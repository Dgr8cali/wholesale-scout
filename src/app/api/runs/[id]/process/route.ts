import { after, type NextRequest } from "next/server";
import { db } from "@/lib/server/db";
import { handle } from "@/lib/server/http";
import { kickRun } from "@/lib/server/kick";
import { processRun } from "@/lib/server/process";

export const maxDuration = 60;

/** A chain with no progress for this long stops; the run page resumes it. */
const STALL_MS = 20 * 60_000;

/**
 * Work on a run for one budget (~45 s), then hand on to the next call until it's done.
 * One worker at a time: a call that finds the run leased returns at once.
 */
export const POST = handle(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const progress = await processRun(id, { budgetMs: 45_000 });
  // Hand on only under a lease; without one, two workers could take the same rows.
  if (!progress.done && !progress.busy && progress.leased) {
    const run = await db().from("runs").select("*").eq("id", id).single();
    const last = (run.data as { last_progress_at?: string | null } | null)?.last_progress_at;
    const stalled = !progress.progressed && last != null && Date.now() - Date.parse(last) > STALL_MS;
    if (!stalled) after(() => kickRun(req.nextUrl.origin, id));
  }
  return Response.json(progress);
});
