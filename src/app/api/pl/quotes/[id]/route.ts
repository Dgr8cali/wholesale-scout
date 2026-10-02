import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { deleteQuote, updateQuote } from "@/lib/server/plQuotes";

type Ctx = { params: Promise<{ id: string }> };

/** Any of the quote's fields, or its calculator inputs ({ calc }). */
export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  try {
    return Response.json({ quote: await updateQuote((await ctx.params).id, (await req.json().catch(() => ({}))) as Record<string, unknown>) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});

export const DELETE = handle(async (_req: NextRequest, ctx: Ctx) => {
  await deleteQuote((await ctx.params).id);
  return Response.json({ ok: true });
});
