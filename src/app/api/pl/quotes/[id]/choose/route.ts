import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { chooseQuote } from "@/lib/server/plQuotes";

type Ctx = { params: Promise<{ id: string }> };

/** { rejectOthers? }: this quote is chosen (the others rejected unless false). */
export const POST = handle(async (req: NextRequest, ctx: Ctx) => {
  const b = (await req.json().catch(() => ({}))) as { rejectOthers?: boolean };
  try {
    return Response.json(await chooseQuote((await ctx.params).id, b.rejectOthers !== false));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
