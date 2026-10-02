import type { NextRequest } from "next/server";
import { estimateTokens } from "@/lib/ads/ai";
import { handle } from "@/lib/server/http";
import { reviewSummaryContext, summariseReviews } from "@/lib/server/plReviews";

type Ctx = { params: Promise<{ id: string }> };
export const maxDuration = 60;

/** ?preview=1: what "Ask Claude to summarise" would send (no API call). */
export const GET = handle(async (_req: NextRequest, ctx: Ctx) => {
  try {
    const context = await reviewSummaryContext((await ctx.params).id);
    return Response.json({ context, contextTokens: estimateTokens(context) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});

/** { force? }: ask Claude for the top three fixable complaints (only on your click). */
export const POST = handle(async (req: NextRequest, ctx: Ctx) => {
  const b = (await req.json().catch(() => ({}))) as { force?: boolean };
  try {
    return Response.json(await summariseReviews((await ctx.params).id, { force: !!b.force }));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
