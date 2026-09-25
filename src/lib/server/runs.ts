import "server-only";
import { chunks, db, loadProfile, must } from "./db";
import { runProgress } from "./process";

/**
 * A new run from chosen products, each on a given offer. Returns its id; the caller starts
 * processing. Before the run-names migration the name is skipped (the source still shows).
 */
export async function createRunFrom(picks: { productId: string; offerId: string }[], opts: { name: string; source: string; profileId?: string | null }): Promise<string> {
  const d = db();
  const unique = [...new Map(picks.map((p) => [p.productId, p])).values()];
  if (!unique.length) throw new Error("Nothing to screen");
  const profile = await loadProfile(opts.profileId);
  const fields = { profile_id: profile.id, profile_snapshot: profile.config, source: opts.source, status: "pending", row_count: unique.length };
  let res = await d.from("runs").insert({ ...fields, name: opts.name }).select("id").single();
  if (res.error && /column|schema cache/i.test(res.error.message)) res = await d.from("runs").insert(fields).select("id").single();
  const run = must(res, "run") as { id: string };
  for (const c of chunks(unique, 500)) {
    must(await d.from("results").insert(c.map((p) => ({ run_id: run.id, product_id: p.productId, offer_id: p.offerId, offer_count: 1 }))), "results");
  }
  return run.id;
}

/** A run with just these rows of another run, named after it. */
export async function runFromSelection(runId: string, resultIds: string[], profileId?: string | null): Promise<{ runId: string; count: number }> {
  const d = db();
  const src = must(await d.from("runs").select("*").eq("id", runId).single(), "run") as { name?: string | null; source: string; profile_id: string | null };
  const rows: { product_id: string; offer_id: string | null }[] = [];
  for (const c of chunks(resultIds)) {
    rows.push(...(must(await d.from("results").select("product_id, offer_id").eq("run_id", runId).in("id", c), "results") as { product_id: string; offer_id: string | null }[]));
  }
  const picks = rows.filter((r) => r.offer_id).map((r) => ({ productId: r.product_id, offerId: r.offer_id! }));
  const base = src.name || src.source;
  const id = await createRunFrom(picks, {
    name: `${base} — ${picks.length} selected`.slice(0, 120),
    source: `Selected from ${base}`.slice(0, 300),
    profileId: profileId || src.profile_id,
  });
  return { runId: id, count: picks.length };
}

/** Take rows out of a run (their products and offers stay). */
export async function removeFromRun(runId: string, resultIds: string[]): Promise<number> {
  const d = db();
  let removed = 0;
  for (const c of chunks(resultIds)) {
    removed += (must(await d.from("results").delete().eq("run_id", runId).in("id", c).select("id"), "remove") as unknown[]).length;
  }
  const p = await runProgress(runId);
  must(await d.from("runs").update({ row_count: p.total, processed_count: p.processed, ...(p.done ? { status: "done" } : {}) }).eq("id", runId), "run");
  return removed;
}
