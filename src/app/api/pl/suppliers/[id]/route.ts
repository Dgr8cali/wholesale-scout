import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { quoteFromLead, updateLead, type LeadStatus } from "@/lib/server/plSuppliers";

type Ctx = { params: Promise<{ id: string }> };

/** { status?, notes?, reject_reason? } (rejecting needs a reason). */
export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  const b = (await req.json().catch(() => ({}))) as { status?: LeadStatus; notes?: string | null; reject_reason?: string | null };
  try {
    return Response.json({ lead: await updateLead((await ctx.params).id, b) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});

/** { action: "quote" }: a quote in the candidate's Quotes, prefilled from the lead; the lead becomes quoted. */
export const POST = handle(async (req: NextRequest, ctx: Ctx) => {
  const b = (await req.json().catch(() => ({}))) as { action?: string };
  if (b.action !== "quote") return Response.json({ error: "action: quote" }, { status: 400 });
  try {
    return Response.json({ quote: await quoteFromLead((await ctx.params).id) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
