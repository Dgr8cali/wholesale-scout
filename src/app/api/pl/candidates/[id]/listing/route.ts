import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { setListingAsin } from "@/lib/server/plQuotes";

type Ctx = { params: Promise<{ id: string }> };

/** { asin }: the candidate's own listing (null clears it); it joins the Ads products. */
export const PUT = handle(async (req: NextRequest, ctx: Ctx) => {
  const b = (await req.json().catch(() => ({}))) as { asin?: string | null };
  try {
    await setListingAsin((await ctx.params).id, b.asin ?? null);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
