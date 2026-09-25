import type { NextRequest } from "next/server";
import { extJson, extOptions, isAsin, starAsin } from "@/lib/server/extension";
import { handle } from "@/lib/server/http";

export const OPTIONS = extOptions;
/** Star a product by ASIN: { asin }. */
export const POST = handle(async (req: NextRequest) => {
  const { asin } = (await req.json().catch(() => ({}))) as { asin?: string };
  if (!isAsin(asin)) return extJson({ error: "asin required" }, 400);
  const fav = await starAsin(asin);
  return fav ? extJson({ favourite: fav }) : extJson({ error: "Check this ASIN first" }, 404);
});
