import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { setCampaignArchived, setCampaignAsin } from "@/lib/server/ads";

type Ctx = { params: Promise<{ id: string }> };

/** { asin }: the ASIN a campaign advertises (null clears it); { archived }: hide it from the dashboard and the rules. */
export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  const b = (await req.json().catch(() => ({}))) as { asin?: string | null; archived?: boolean };
  try {
    const id = (await ctx.params).id;
    if (typeof b.archived === "boolean") { await setCampaignArchived(id, b.archived); return Response.json({ ok: true }); }
    await setCampaignAsin(id, b.asin ? String(b.asin).trim().toUpperCase() : null);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
