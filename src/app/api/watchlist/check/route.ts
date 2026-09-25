import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { scheduleNext } from "@/lib/server/kick";
import { startWatchCheck } from "@/lib/server/watchlist";

export const maxDuration = 60;

/** Re-check the watchlist now (the weekly job, on demand). */
export const POST = handle(async (req: NextRequest) => {
  const r = await startWatchCheck({ force: true });
  if (r.runId) scheduleNext(req.nextUrl.origin, r.runId);
  return Response.json(r);
});
