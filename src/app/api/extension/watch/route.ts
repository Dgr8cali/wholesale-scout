import type { NextRequest } from "next/server";
import { extJson, extOptions, isAsin, watchAsin } from "@/lib/server/extension";
import { handle } from "@/lib/server/http";
import type { WatchCondition } from "@/lib/watch";

export const OPTIONS = extOptions;
/** Watch a product by ASIN: { asin, condition? } (absent: suggested from what blocked it). */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { asin?: string; condition?: WatchCondition | null };
  if (!isAsin(b.asin)) return extJson({ error: "asin required" }, 400);
  const fav = await watchAsin(b.asin, b.condition);
  return fav ? extJson({ favourite: fav }) : extJson({ error: "Check this ASIN first" }, 404);
});
