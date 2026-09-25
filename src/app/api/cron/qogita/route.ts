import { waitUntil } from "@vercel/functions";
import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { scheduleNext } from "@/lib/server/kick";
import { nightlyStep } from "@/lib/server/qogitaNightly";

export const maxDuration = 60;

const authorised = (req: NextRequest) => !!process.env.CRON_SECRET && req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;

/**
 * Nightly Qogita re-pull (Vercel Cron, see vercel.json). Each call re-pulls one due preset
 * and, while more are due, calls itself again for the next.
 */
export const GET = handle(async (req: NextRequest) => {
  if (!authorised(req)) return Response.json({ error: "Unauthorised" }, { status: 401 });
  const step = await nightlyStep();
  const runId = step.result?.runId;
  if (runId) scheduleNext(req.nextUrl.origin, runId);
  if (step.remaining > 0) {
    // The next due preset: a call to this route, fired after the response.
    waitUntil(fetch(`${req.nextUrl.origin}/api/cron/qogita`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }, signal: AbortSignal.timeout(5_000) }).catch(() => {}));
  }
  return Response.json(step);
});
