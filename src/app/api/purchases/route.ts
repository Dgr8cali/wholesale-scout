import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { listPurchases, recordPurchase, type NewPurchase } from "@/lib/server/purchases";

/** Purchases, newest first (?asin= for one product). */
export const GET = handle(async (req: NextRequest) => Response.json({ purchases: await listPurchases(req.nextUrl.searchParams.get("asin")) }));

/** Record a purchase: { asin, units, landedGbp, unitCostGbp?, supplierId?, supplierName?, orderedOn?, note? }. */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as NewPurchase;
  try {
    return Response.json({ purchase: await recordPurchase(b) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
