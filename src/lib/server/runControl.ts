import "server-only";
import { db, must } from "./db";

const MIGRATION = "Run migration 20260927000300_pause_keepa_turns.sql first";
const missing = (m: string) => /paused_at|keepa_first_at|refresh_run_keepa|schema cache|does not exist/i.test(m);

/** Pause: the call in hand stops after its batch; nothing else runs or spends until resumed. */
export async function pauseRun(runId: string): Promise<void> {
  const res = await db().from("runs").update({ paused_at: new Date().toISOString() }).eq("id", runId);
  if (res.error && missing(res.error.message)) throw new Error(MIGRATION);
  must(res, "pause");
}

/** Resume where it stopped: finished rows stay finished, parked rows keep what they fetched. */
export async function resumeRun(runId: string): Promise<void> {
  const res = await db().from("runs").update({ paused_at: null }).eq("id", runId);
  if (res.error && missing(res.error.message)) throw new Error(MIGRATION);
  must(res, "resume");
}

/** Put a run first in line for Keepa. */
export async function keepaGoFirst(runId: string): Promise<void> {
  const res = await db().from("runs").update({ keepa_first_at: new Date().toISOString() }).eq("id", runId);
  if (res.error && missing(res.error.message)) throw new Error(MIGRATION);
  must(res, "go first");
}

/** Send rows whose Keepa history is older than `days` back for a fresh stage-1 fetch. */
export async function refreshStaleKeepa(runId: string, days = 7): Promise<number> {
  const olderThan = new Date(Date.now() - days * 86_400_000).toISOString();
  const res = await db().rpc("refresh_run_keepa", { p_run: runId, p_older_than: olderThan });
  if (res.error && missing(res.error.message)) throw new Error(MIGRATION);
  const n = Number(must(res, "refresh") ?? 0);
  if (n > 0) must(await db().from("runs").update({ status: "processing", finished_at: null }).eq("id", runId), "run");
  return n;
}
