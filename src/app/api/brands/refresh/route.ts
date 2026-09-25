import type { NextRequest } from "next/server";
import { refreshBrandMap } from "@/lib/server/brandMap";
import { handle } from "@/lib/server/http";
import { scheduleCall } from "@/lib/server/kick";

export const maxDuration = 60;

/** Bring the brand map up to date for ~40 s, then hand on to the next call until it's done. */
export const POST = handle(async (req: NextRequest) => {
  const r = await refreshBrandMap(40_000);
  if (!r.busy && r.remaining > 0) scheduleCall(req.nextUrl.origin, "/api/brands/refresh");
  return Response.json(r);
});
