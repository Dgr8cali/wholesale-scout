import type { NextRequest } from "next/server";
import { CONDITION_KINDS, needsValue, type WatchCondition } from "@/lib/watch";
import { emailConfigured } from "@/lib/server/email";
import { handle } from "@/lib/server/http";
import { openAlerts, setWatch, watchItems } from "@/lib/server/watchlist";

/** The watchlist: each watched product with its condition and last check, open alerts, and whether email is set up. */
export const GET = handle(async () => {
  const [items, alerts] = await Promise.all([watchItems(), openAlerts()]);
  return Response.json({ items, alerts, email: emailConfigured() });
});

/** Watch a product: { ean, asin, condition: { kind, value? } | null, noSupplier? }. */
export const PUT = handle(async (req: NextRequest) => {
  const b = (await req.json()) as { ean?: string; asin?: string | null; condition?: WatchCondition | null; noSupplier?: boolean };
  if (!b.ean) return Response.json({ error: "ean required" }, { status: 400 });
  const c = b.condition ?? null;
  if (c) {
    if (!CONDITION_KINDS.includes(c.kind)) return Response.json({ error: `condition must be one of ${CONDITION_KINDS.join(", ")}` }, { status: 400 });
    if (needsValue(c.kind) && !(Number(c.value) > 0)) return Response.json({ error: "That condition needs a value above 0" }, { status: 400 });
  }
  const fav = await setWatch({
    ean: b.ean, asin: b.asin ?? null, noSupplier: b.noSupplier,
    condition: c ? { kind: c.kind, ...(needsValue(c.kind) ? { value: Number(c.value) } : {}) } : null,
  });
  return Response.json({ favourite: fav });
});
