import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { advanceStage } from "@/lib/server/plPipeline";
import { deleteQuote, updateQuote } from "@/lib/server/plQuotes";

type Ctx = { params: Promise<{ id: string }> };

/** Any of the quote's fields, or its calculator inputs ({ calc }). */
export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  try {
    const quote = await updateQuote((await ctx.params).id, (await req.json().catch(() => ({}))) as Record<string, unknown>);
    await advanceStage(quote.candidate_id);
    return Response.json({ quote });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});

export const DELETE = handle(async (_req: NextRequest, ctx: Ctx) => {
  await deleteQuote((await ctx.params).id);
  return Response.json({ ok: true });
});
