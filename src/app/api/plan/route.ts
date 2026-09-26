import type { NextRequest } from "next/server";
import { brandMapStale } from "@/lib/server/brandMap";
import { handle } from "@/lib/server/http";
import { scheduleCall } from "@/lib/server/kick";
import { memo } from "@/lib/server/memo";
import { planCandidates } from "@/lib/server/plan";

/**
 * The order planner's candidates and limits (the plan itself is worked out on the page). ?warns=1 includes warns.
 * It reads the brand map: when that's behind (a re-score, a profile save), a refresh starts and `updating` says so.
 */
export const GET = handle(async (req: NextRequest) => {
  const stale = await memo("brands:stale", 60_000, brandMapStale);
  if (stale) scheduleCall(req.nextUrl.origin, "/api/brands/refresh");
  return Response.json({ ...(await planCandidates({ warns: req.nextUrl.searchParams.get("warns") === "1" })), updating: stale });
});
