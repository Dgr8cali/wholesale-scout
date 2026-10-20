import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { advanceStage } from "@/lib/server/plPipeline";
import { quoteFromLead, updateLead, type LeadStatus } from "@/lib/server/plSuppliers";

type Ctx = { params: Promise<{ id: string }> };

/** { status?, notes?, reject_reason? } (rejecting needs a reason). */
export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  const b = (await req.json().catch(() => ({}))) as { status?: LeadStatus; notes?: string | null; reject_reason?: string | null };
  try {
    const lead = await updateLead((await ctx.params).id, b);
    // A messaged supplier puts the candidate in Sourcing.
    if (b.status) await advanceStage(lead.candidate_id);
    return Response.json({ lead });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});

/** { action: "quote" }: a quote in the candidate's Quotes, prefilled from the lead; the lead becomes quoted. */
export const POST = handle(async (req: NextRequest, ctx: Ctx) => {
  const b = (await req.json().catch(() => ({}))) as { action?: string };
  if (b.action !== "quote") return Response.json({ error: "action: quote" }, { status: 400 });
  try {
    const quote = await quoteFromLead((await ctx.params).id);
    await advanceStage(quote.candidate_id);
    return Response.json({ quote });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
