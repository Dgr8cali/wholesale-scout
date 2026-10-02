import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { applyQuote } from "@/lib/server/plQuotes";

type Ctx = { params: Promise<{ id: string }> };

/** { to: "gate0" | "gate7" }: write the quote's landed cost (and first order) into the candidate. */
export const POST = handle(async (req: NextRequest, ctx: Ctx) => {
  const b = (await req.json().catch(() => ({}))) as { to?: string };
  try {
    return Response.json(await applyQuote((await ctx.params).id, b.to === "gate7" ? "gate7" : "gate0"));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
