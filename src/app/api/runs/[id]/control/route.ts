import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { scheduleNext } from "@/lib/server/kick";
import { keepaGoFirst, pauseRun, refreshStaleKeepa, resumeRun } from "@/lib/server/runControl";

/** Pause, resume, go first on Keepa, or refresh stale Keepa data. Body: { action }. */
export const POST = handle(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  try {
    switch (action) {
      case "pause":
        await pauseRun(id);
        return Response.json({ ok: true });
      case "resume":
        await resumeRun(id);
        scheduleNext(req.nextUrl.origin, id);
        return Response.json({ ok: true });
      case "keepaFirst":
        await keepaGoFirst(id);
        scheduleNext(req.nextUrl.origin, id);
        return Response.json({ ok: true });
      case "refresh": {
        const requeued = await refreshStaleKeepa(id);
        if (requeued) scheduleNext(req.nextUrl.origin, id);
        return Response.json({ ok: true, requeued });
      }
      default:
        return Response.json({ error: "action must be pause, resume, keepaFirst or refresh" }, { status: 400 });
    }
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 409 });
  }
});
