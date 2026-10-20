import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { saveQuoteLabels } from "@/lib/server/plQuotes";

type Ctx = { params: Promise<{ id: string }> };

/** { criteria: [{ k, label }] × 6, spec: [{ k, label }] × 4 } or { reset: true }: the candidate's sample-score and spec labels. */
export const PUT = handle(async (req: NextRequest, ctx: Ctx) => {
  const b = (await req.json().catch(() => ({}))) as { criteria?: unknown; spec?: unknown; reset?: boolean };
  try {
    return Response.json({ labels: await saveQuoteLabels((await ctx.params).id, b) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
