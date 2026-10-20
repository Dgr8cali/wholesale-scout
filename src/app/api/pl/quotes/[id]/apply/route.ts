import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { applyQuote } from "@/lib/server/plQuotes";

type Ctx = { params: Promise<{ id: string }> };

/**
 * { to: "gate0" | "gate7", overwrite?: string[] }: write the quote's landed cost (and first order) into
 * the candidate. Your own values stay unless named in `overwrite` ("landed", "units"), after asking.
 */
export const POST = handle(async (req: NextRequest, ctx: Ctx) => {
  const b = (await req.json().catch(() => ({}))) as { to?: string; overwrite?: unknown };
  const overwrite = Array.isArray(b.overwrite) ? b.overwrite.filter((k): k is string => k === "landed" || k === "units") : [];
  try {
    return Response.json(await applyQuote((await ctx.params).id, b.to === "gate7" ? "gate7" : "gate0", overwrite));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
