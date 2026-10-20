import type { NextRequest } from "next/server";
import { refreshBrandMap } from "@/lib/server/brandMap";
import { handle } from "@/lib/server/http";
import { scheduleCall } from "@/lib/server/kick";
import { refreshProductFacts } from "@/lib/server/productFacts";

export const maxDuration = 60;

/** Bring the brand map up to date for ~40 s, then hand on to the next call until it's done (then Products' filter facts). */
export const POST = handle(async (req: NextRequest) => {
  const r = await refreshBrandMap(40_000);
  if (!r.busy && r.remaining > 0) scheduleCall(req.nextUrl.origin, "/api/brands/refresh");
  // Done: Products' filter facts follow, so its first filtered page doesn't wait for them.
  else if (!r.busy) await refreshProductFacts();
  return Response.json(r);
});
