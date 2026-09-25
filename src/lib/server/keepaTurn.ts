import "server-only";
import { db, must } from "./db";

/**
 * Only one run spends Keepa tokens at a time. Its turn goes to the run most recently put
 * first ("Go first"), else the oldest; only unpaused, unarchived runs with rows still to go
 * through Keepa (new, in lookup, or waiting for stage 1 or 2) are in line.
 */
export interface KeepaTurn { id: string; name: string | null; source: string }

/** Rows still ahead of or at Keepa: pending and not yet past it (new rows, lookups, stage 1 or 2). */
const waitingOnKeepa = async (runId: string) => {
  const q = () => db().from("results").select("id", { count: "exact", head: true }).eq("run_id", runId).eq("status", "pending");
  const [all, past] = await Promise.all([q(), q().in("inputs->>stage", ["enriched", "account"])]);
  return (all.count ?? 0) - (past.count ?? 0) > 0;
};

export async function keepaQueue(): Promise<KeepaTurn[]> {
  const res = await db().from("runs")
    .select("id, name, source, status, started_at, paused_at, archived_at, keepa_first_at")
    .in("status", ["pending", "processing"]);
  // Before migration 20260927000300 there are no turns: every run may use Keepa.
  if (res.error && /paused_at|keepa_first_at|archived_at/.test(res.error.message)) return [];
  const runs = (must(res, "runs") as { id: string; name: string | null; source: string; started_at: string; paused_at: string | null; archived_at: string | null; keepa_first_at: string | null }[])
    .filter((r) => !r.paused_at && !r.archived_at)
    .sort((a, b) => (b.keepa_first_at ?? "").localeCompare(a.keepa_first_at ?? "") || (a.started_at ?? "").localeCompare(b.started_at ?? ""));
  const out: KeepaTurn[] = [];
  for (const r of runs) if (await waitingOnKeepa(r.id)) out.push({ id: r.id, name: r.name, source: r.source });
  return out;
}

/** The run whose turn it is on Keepa, or null when none is waiting. */
export async function keepaOwner(): Promise<KeepaTurn | null> {
  return (await keepaQueue())[0] ?? null;
}
