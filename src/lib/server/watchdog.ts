import "server-only";
import type { RunStats } from "../eta";
import { db, must } from "./db";

/** A chain that hasn't moved a run on for this long is presumed dead and restarted. */
export const STALL_MS = 3 * 60_000;

export interface Stalled { runId: string; path: "process" | "rescreen" }

/**
 * Runs with work left whose chain has died: no worker holds the lease, and nothing has moved
 * for 3 minutes. Paused runs are left alone.
 */
export async function stalledRuns(now = Date.now()): Promise<Stalled[]> {
  const d = db();
  const runs = must(
    await d.from("runs").select("id, status, lease_until, last_progress_at, started_at, stats").in("status", ["pending", "processing"]),
    "runs",
  ) as { id: string; status: string; lease_until: string | null; last_progress_at: string | null; started_at: string; stats: (RunStats & { paused?: unknown }) | null }[];
  const out: Stalled[] = [];
  for (const r of runs) {
    if (r.stats?.paused) continue;
    if (r.lease_until && Date.parse(r.lease_until) > now) continue; // a worker is on it
    const last = Date.parse(r.last_progress_at ?? r.started_at);
    if (now - last < STALL_MS) continue;
    const job = r.stats?.rescreen;
    if (job && !job.finishedAt) {
      out.push({ runId: r.id, path: "rescreen" });
      continue;
    }
    const pending = (await d.from("results").select("id", { count: "exact", head: true }).eq("run_id", r.id).eq("status", "pending")).count ?? 0;
    if (pending > 0) out.push({ runId: r.id, path: "process" });
  }
  return out;
}
