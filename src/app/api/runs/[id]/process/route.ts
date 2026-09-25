import type { NextRequest } from "next/server";
import { db } from "@/lib/server/db";
import { handle } from "@/lib/server/http";
import { scheduleNext } from "@/lib/server/kick";
import { processRun } from "@/lib/server/process";

export const maxDuration = 60;

/** A chain with no progress for this long (and not waiting on Keepa) gives up; a bug, not a wait. */
const GIVE_UP_MS = 60 * 60_000;

/**
 * Work on a run for one budget (~45 s), then schedule the next call itself until it's done:
 * no page needs to be open. One worker at a time: a call that finds the run leased returns at
 * once, so two chains merge into one. A chain that dies is restarted by the watchdog.
 */
export const POST = handle(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  // 40 s of work inside the 60 s limit; processRun won't start a batch it can't finish.
  const progress = await processRun(id, { budgetMs: 40_000 });
  // Hand on only under a lease; without one, two workers could take the same rows.
  if (!progress.done && !progress.busy && progress.leased && !progress.paused) {
    const run = await db().from("runs").select("last_progress_at, resume_after").eq("id", id).single();
    const r = run.data as { last_progress_at?: string | null; resume_after?: string | null } | null;
    const waitingOnKeepa = !!r?.resume_after || progress.waiting.keepa > 0;
    const stuck = !progress.progressed && !waitingOnKeepa && r?.last_progress_at != null && Date.now() - Date.parse(r.last_progress_at) > GIVE_UP_MS;
    if (!stuck) scheduleNext(req.nextUrl.origin, id);
  }
  return Response.json(progress);
});
