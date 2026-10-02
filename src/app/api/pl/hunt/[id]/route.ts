import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { loadHunt } from "@/lib/server/plHunt";

type Ctx = { params: Promise<{ id: string }> };

/**
 * A hunt's niches, grouped now (dismissed niches left out), with the "Why so few?" funnel.
 * ?minAsins= to show smaller niches; ?strict=1 to count qualifying ASINs only (not near misses).
 */
export const GET = handle(async (req: NextRequest, ctx: Ctx) => {
  const q = req.nextUrl.searchParams;
  const m = Number(q.get("minAsins"));
  return Response.json(await loadHunt((await ctx.params).id, false, Number.isFinite(m) && m >= 1 ? { minAsins: Math.round(m) } : undefined, { strict: q.get("strict") === "1" }));
});
