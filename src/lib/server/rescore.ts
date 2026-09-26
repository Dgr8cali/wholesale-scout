import "server-only";
import { chunks, db, must } from "./db";
import { forget } from "./memo";
import { scheduleCall, scheduleRescreen } from "./kick";
import { rescoreStored } from "./process";

/**
 * A change to a product (a waiver, a brand approval, a cost override) reaches every current
 * (not archived) run it's in: its finished rows are re-scored from stored data, each on its
 * run's own profile. `skipRun` is one the caller has already re-screened. Then the brand map
 * (Brands, Suppliers, the planner) is refreshed in the background; product pages and
 * favourites read the results themselves.
 */
export async function rescoreProducts(productIds: string[], opts: { skipRun?: string | null; origin?: string } = {}): Promise<{ runs: number; rescored: number }> {
  const ids = [...new Set(productIds.filter(Boolean))];
  const d = db();
  const rows: { id: string; run_id: string }[] = [];
  for (const c of chunks(ids)) rows.push(...(must(await d.from("results").select("id, run_id").in("product_id", c).eq("status", "done"), "results") as typeof rows));
  const runIds = [...new Set(rows.map((r) => r.run_id))].filter((r) => r !== opts.skipRun);
  const current = new Set<string>();
  for (const c of chunks(runIds)) {
    for (const r of must(await d.from("runs").select("id, archived_at").in("id", c), "runs") as { id: string; archived_at: string | null }[]) if (!r.archived_at) current.add(r.id);
  }
  let rescored = 0;
  for (const runId of current) rescored += await rescoreStored(runId, rows.filter((r) => r.run_id === runId).map((r) => r.id));
  refreshViews(opts.origin);
  return { runs: current.size, rescored };
}

/** Products by EAN (and ASIN; null covers every ASIN of the EAN). */
export async function productIdsFor(items: { ean: string; asin: string | null }[]): Promise<string[]> {
  const d = db();
  const out: string[] = [];
  for (const c of chunks([...new Set(items.map((i) => i.ean))])) {
    for (const p of must(await d.from("products").select("id, ean, asin").in("ean", c), "products") as { id: string; ean: string; asin: string | null }[]) {
      if (items.some((i) => i.ean === p.ean && (i.asin == null || i.asin === p.asin))) out.push(p.id);
    }
  }
  return out;
}

/** The brand map's cached copy is out of date: drop it here and refresh it in the background. */
export function refreshViews(origin?: string) {
  forget("brands:");
  if (origin) scheduleCall(origin, "/api/brands/refresh");
}

/**
 * A profile's settings changed: each current run on it that has finished (not paused, not still
 * screening) is re-screened from stored data in the background, one chain per run, as the run
 * page's Re-screen would. Returns how many were started.
 */
export async function rescreenProfileRuns(profileId: string, origin: string): Promise<number> {
  const runs = must(await db().from("runs").select("id, status, archived_at, paused_at").eq("profile_id", profileId), "runs") as
    { id: string; status: string; archived_at: string | null; paused_at?: string | null }[];
  const due = runs.filter((r) => !r.archived_at && !r.paused_at && r.status === "done");
  for (const r of due) scheduleRescreen(origin, r.id, { profileId, storedOnly: true });
  refreshViews(origin);
  return due.length;
}
