import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { recordStockPurchase } from "@/lib/server/stock";

/** { itemId, units, landedGbp, supplierId?, supplierName?, orderedOn?, note? }: a purchase of a stock item, in the Tracker. */
export const POST = handle(async (req: NextRequest) => {
  try {
    return Response.json({ purchase: await recordStockPurchase((await req.json().catch(() => ({}))) as never) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
