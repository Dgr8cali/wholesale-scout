import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { advanceStage } from "@/lib/server/plPipeline";
import { createQuote } from "@/lib/server/plQuotes";

type Ctx = { params: Promise<{ id: string }> };

/** A new quote for the candidate. */
export const POST = handle(async (req: NextRequest, ctx: Ctx) => {
  try {
    const { id } = await ctx.params;
    const quote = await createQuote(id, (await req.json().catch(() => ({}))) as Record<string, unknown>);
    await advanceStage(id);
    return Response.json({ quote });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
