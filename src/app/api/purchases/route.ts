import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { listPurchases, recordPurchase, type NewPurchase } from "@/lib/server/purchases";
import { actualsFor } from "@/lib/server/amazonSync";

/** Purchases, newest first (?asin= for one product; &actuals=1 adds what Amazon's reports say happened). */
export const GET = handle(async (req: NextRequest) => {
  const q = req.nextUrl.searchParams;
  const purchases = await listPurchases(q.get("asin"));
  if (q.get("actuals") !== "1") return Response.json({ purchases });
  const actuals = await actualsFor(purchases);
  return Response.json({ purchases: purchases.map((p) => ({ ...p, actuals: actuals.get(p.id) ?? null })) });
});

/** Record a purchase: { asin, units, landedGbp, unitCostGbp?, supplierId?, supplierName?, orderedOn?, note? }. */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as NewPurchase;
  try {
    return Response.json({ purchase: await recordPurchase(b) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
