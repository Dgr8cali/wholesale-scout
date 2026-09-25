import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { deletePurchase, updatePurchase } from "@/lib/server/purchases";
import type { PurchaseStatus } from "@/lib/tracker";

type Ctx = { params: Promise<{ id: string }> };

/** Move a purchase along ({ status, on? }) or correct { units, landedGbp, orderedOn, note }. */
export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  const b = (await req.json().catch(() => ({}))) as { status?: PurchaseStatus; units?: number; landedGbp?: number; orderedOn?: string; note?: string | null; on?: string };
  try {
    return Response.json({ purchase: await updatePurchase((await ctx.params).id, b) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});

export const DELETE = handle(async (_req: NextRequest, ctx: Ctx) => {
  await deletePurchase((await ctx.params).id);
  return Response.json({ ok: true });
});
