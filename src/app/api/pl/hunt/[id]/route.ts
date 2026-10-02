import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { loadHunt } from "@/lib/server/plHunt";

type Ctx = { params: Promise<{ id: string }> };

/** A hunt's niches, grouped now (dismissed niches left out); ?minAsins= to show smaller niches. */
export const GET = handle(async (req: NextRequest, ctx: Ctx) => {
  const m = Number(req.nextUrl.searchParams.get("minAsins"));
  return Response.json(await loadHunt((await ctx.params).id, false, Number.isFinite(m) && m >= 1 ? { minAsins: Math.round(m) } : undefined));
});
