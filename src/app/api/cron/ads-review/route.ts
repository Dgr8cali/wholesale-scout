import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { bearerIs } from "@/lib/server/secrets";
import { scheduledReview } from "@/lib/server/adsAi";

export const maxDuration = 60;

const authorised = (req: NextRequest) => bearerIs(req.headers.get("authorization"), process.env.CRON_SECRET);

/**
 * The monthly Ads review (Vercel Cron, the 1st at 06:00 UTC; see vercel.json): reviews last month,
 * only when Settings → Ads has the schedule on (it's off by default). Otherwise it does nothing.
 */
export const GET = handle(async (req: NextRequest) => {
  if (!authorised(req)) return Response.json({ error: "Unauthorised" }, { status: 401 });
  return Response.json(await scheduledReview());
});
