import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { updatePurchase } from "@/lib/server/purchases";
import { deleteOpenPurchase, editOrder } from "@/lib/server/stockEdit";
import { receivePurchase } from "@/lib/server/stock";
import type { PurchaseStatus } from "@/lib/tracker";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Move a purchase along ({ status, on? }) or correct { units, landedGbp, orderedOn, note }. Received
 * with { bucket } (home or tiktok_fbt), its units go into Stock as a receipt (once).
 */
export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  const b = (await req.json().catch(() => ({}))) as { status?: PurchaseStatus; units?: number; landedGbp?: number; orderedOn?: string; note?: string | null; on?: string; bucket?: "home" | "tiktok_fbt" };
  try {
    const id = (await ctx.params).id;
    // Without a status it's an edit of the order (item, supplier, quantity, cost, order details): the same everywhere.
    if (!b.status) return Response.json({ ...(await editOrder(id, b as never)), stock: null });
    const purchase = await updatePurchase(id, b);
    const stock = b.status === "received" && b.bucket ? await receivePurchase(id, b.bucket, b.on) : null;
    return Response.json({ purchase, stock });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});

/** Delete a purchase not yet received into Stock (a receipt must be deleted first). */
export const DELETE = handle(async (_req: NextRequest, ctx: Ctx) => {
  try {
    await deleteOpenPurchase((await ctx.params).id);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
