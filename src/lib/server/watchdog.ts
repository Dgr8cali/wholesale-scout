import "server-only";
import type { RunStats } from "../eta";
import { db, must } from "./db";
import { keepaOwner } from "./keepaTurn";

/** A chain that hasn't moved a run on for this long is presumed dead and restarted. */
const STALL_MS = 3 * 60_000;

export interface Stalled { runId: string; path: "process" | "rescreen" }

/**
 * Runs with work left whose chain has died: no worker holds the lease, and nothing has moved
 * for 3 minutes. Paused runs are left alone.
 */
export async function stalledRuns(now = Date.now()): Promise<Stalled[]> {
  const d = db();
  const runs = must(
    await d.from("runs").select("*").in("status", ["pending", "processing"]),
    "runs",
  ) as { id: string; status: string; lease_until: string | null; last_progress_at: string | null; started_at: string; paused_at?: string | null; stats: RunStats | null }[];
  const owner = (await keepaOwner().catch(() => null))?.id ?? null;
  const out: Stalled[] = [];
  for (const r of runs) {
    if (r.paused_at) continue;
    if (r.lease_until && Date.parse(r.lease_until) > now) continue; // a worker is on it
    const job = r.stats?.rescreen;
    // A re-screen that has just begun hasn't made progress yet: time it from its start.
    const last = Math.max(Date.parse(r.last_progress_at ?? r.started_at), job && !job.finishedAt ? Date.parse(job.startedAt) : 0);
    if (now - last < STALL_MS) continue;
    if (job && !job.finishedAt) {
      out.push({ runId: r.id, path: "rescreen" });
      continue;
    }
    const pending = (await d.from("results").select("id", { count: "exact", head: true }).eq("run_id", r.id).eq("status", "pending")).count ?? 0;
    if (!pending) continue;
    // Only Keepa work left and it isn't this run's turn: it's waiting, not stalled.
    if (owner && owner !== r.id) {
      const keepaRows = (await d.from("results").select("id", { count: "exact", head: true }).eq("run_id", r.id).eq("status", "pending").in("inputs->>stage", ["priced", "buybox"])).count ?? 0;
      if (keepaRows === pending) continue;
    }
    out.push({ runId: r.id, path: "process" });
  }
  return out;
}
