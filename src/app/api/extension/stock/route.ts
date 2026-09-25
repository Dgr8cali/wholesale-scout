import type { NextRequest } from "next/server";
import { extJson, extOptions, isAsin, saveCompetitorStock, type StockSeller } from "@/lib/server/extension";
import { handle } from "@/lib/server/http";

export const OPTIONS = extOptions;
/** Competitors' stock read on Amazon: { asin, sellers: [{ sellerId, name, fba, stock, limited }] }. */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { asin?: string; sellers?: StockSeller[] };
  if (!isAsin(b.asin) || !Array.isArray(b.sellers)) return extJson({ error: "asin and sellers required" }, 400);
  return (await saveCompetitorStock(b.asin, b.sellers)) ? extJson({ ok: true }) : extJson({ error: "Check this ASIN first" }, 404);
});
