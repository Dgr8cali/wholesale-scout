import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { scheduleNext } from "@/lib/server/kick";
import { startWatchCheck } from "@/lib/server/watchlist";

export const maxDuration = 60;

const authorised = (req: NextRequest) => !!process.env.CRON_SECRET && req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;

/**
 * Weekly watchlist re-check (Vercel Cron, Sundays; see vercel.json): starts a run of every
 * watched product. When it finishes, the conditions are recorded and one digest is emailed.
 */
export const GET = handle(async (req: NextRequest) => {
  if (!authorised(req)) return Response.json({ error: "Unauthorised" }, { status: 401 });
  const r = await startWatchCheck();
  if (r.runId) scheduleNext(req.nextUrl.origin, r.runId);
  return Response.json(r);
});
