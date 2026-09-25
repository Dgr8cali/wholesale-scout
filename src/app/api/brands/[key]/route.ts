import type { NextRequest } from "next/server";
import { brandDetail } from "@/lib/server/brandMap";
import { handle } from "@/lib/server/http";

/** One brand: its roll-up, and its products across all runs with the best offer per EAN. */
export const GET = handle(async (_req: NextRequest, ctx: { params: Promise<{ key: string }> }) => {
  const detail = await brandDetail((await ctx.params).key);
  return detail ? Response.json(detail) : Response.json({ error: "Brand not found" }, { status: 404 });
});
