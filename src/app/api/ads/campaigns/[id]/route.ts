import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { setCampaignAsin } from "@/lib/server/ads";

type Ctx = { params: Promise<{ id: string }> };

/** { asin }: the ASIN a campaign advertises (null clears it). */
export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  const b = (await req.json().catch(() => ({}))) as { asin?: string | null };
  try {
    await setCampaignAsin((await ctx.params).id, b.asin ? String(b.asin).trim().toUpperCase() : null);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
