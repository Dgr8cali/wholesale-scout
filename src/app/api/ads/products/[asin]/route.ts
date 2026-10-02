import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { saveAdsProduct, saveAdsTarget, type AdsProduct } from "@/lib/server/ads";

type Ctx = { params: Promise<{ asin: string }> };

/** { product?: price, landed_cost, referral_category, weight_g, dims, fba_fee, phase, title; target?: { launch, steady } (%) }. */
export const PUT = handle(async (req: NextRequest, ctx: Ctx) => {
  const asin = (await ctx.params).asin.toUpperCase();
  const b = (await req.json().catch(() => ({}))) as { product?: Partial<AdsProduct>; target?: { launch: number | null; steady: number | null } };
  try {
    if (b.product) await saveAdsProduct(asin, b.product);
    if (b.target) await saveAdsTarget(asin, b.target.launch, b.target.steady);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
