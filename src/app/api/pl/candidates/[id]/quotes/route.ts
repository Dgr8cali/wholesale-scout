import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { createQuote } from "@/lib/server/plQuotes";

type Ctx = { params: Promise<{ id: string }> };

/** A new quote for the candidate. */
export const POST = handle(async (req: NextRequest, ctx: Ctx) => {
  try {
    return Response.json({ quote: await createQuote((await ctx.params).id, (await req.json().catch(() => ({}))) as Record<string, unknown>) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
