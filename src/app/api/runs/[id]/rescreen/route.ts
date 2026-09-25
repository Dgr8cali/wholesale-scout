import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { scheduleNext } from "@/lib/server/kick";
import { rescreenRun } from "@/lib/server/process";

export const maxDuration = 60;

/**
 * Re-run every gate and the score with the profile as saved now, from stored data. Works for
 * about 40 seconds a call; while rows are left it schedules the next call itself.
 */
export const POST = handle(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { profileId?: string; storedOnly?: boolean; continuing?: boolean };
  const result = await rescreenRun(id, body.profileId, { storedOnly: !!body.storedOnly, continuing: !!body.continuing });
  if (result.remaining) scheduleNext(req.nextUrl.origin, id, "rescreen");
  else if (result.requeued) scheduleNext(req.nextUrl.origin, id);
  return Response.json(result);
});
