import { cartView } from "@/lib/qogita/cart";
import { getQogita } from "@/lib/qogita/client";
import { handle } from "@/lib/server/http";

/** The active Qogita cart: one allocation per supplier with subtotal, MOV progress and lines. */
export const GET = handle(async () => {
  const q = getQogita();
  if (!q) return Response.json({ available: false, allocations: [] });
  return Response.json({ available: true, allocations: await cartView(q) });
});
