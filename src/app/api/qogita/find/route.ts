import type { NextRequest } from "next/server";
import { getQogita, type QogitaProduct } from "@/lib/qogita/client";
import { handle } from "@/lib/server/http";

/** "Find on Qogita": Qogita's in-stock products with this EAN (GTIN), cheapest first. */
export const GET = handle(async (req: NextRequest) => {
  const gtin = (req.nextUrl.searchParams.get("gtin") ?? "").trim();
  if (!/^\d{8,14}$/.test(gtin)) return Response.json({ error: "gtin must be an EAN/UPC (8–14 digits)" }, { status: 400 });
  const q = getQogita();
  if (!q) return Response.json({ error: "Qogita isn't set up (QOGITA_EMAIL, QOGITA_PASSWORD)" }, { status: 503 });
  const first = await q.products({ gtin }).next();
  const found: QogitaProduct[] = first.done ? [] : first.value.results;
  const products = found.map((p) => ({
    name: p.name, brand: p.brand, gtin: p.gtin,
    price: p.price ? { amount: Number(p.price.amount), currency: p.price.currency } : null,
    unit: p.unit ?? null, inventory: p.inventory ?? null,
    url: /^https?:/.test(p.productUrl) ? p.productUrl : `https://www.qogita.com${p.productUrl.startsWith("/") ? "" : "/"}${p.productUrl}`,
  })).sort((a, b) => (a.price?.amount ?? Infinity) - (b.price?.amount ?? Infinity));
  return Response.json({ products });
});
