import { after, type NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { kickRun } from "@/lib/server/kick";
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
  if (runId) after(() => kickRun(req.nextUrl.origin, runId));
  if (step.remaining > 0) {
    after(async () => {
      try {
        await fetch(`${req.nextUrl.origin}/api/cron/qogita`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }, signal: AbortSignal.timeout(2_500) });
      } catch {
        // Timed out waiting, as intended: the next call carries on by itself.
      }
    });
  }
  return Response.json(step);
});
