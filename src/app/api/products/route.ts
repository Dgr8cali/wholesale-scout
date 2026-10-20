import type { NextRequest } from "next/server";
import { filtersFromQuery } from "@/lib/filters";
import { handle } from "@/lib/server/http";
import { listProducts } from "@/lib/server/productPage";

/**
 * Products, one per ASIN, newest screening first, with their latest results: the results filters
 * as the page's address carries them (?q=, &verdict=buy,check, &profit=5, &bsr=..50000, &gated=no…;
 * lib/filters), &bought=1, &page=, &size=20|50.
 */
export const GET = handle(async (req: NextRequest) => {
  const s = req.nextUrl.searchParams;
  return Response.json(await listProducts({ filters: filtersFromQuery(s), bought: s.get("bought") === "1", page: Number(s.get("page")) || 0, size: Number(s.get("size")) || 50 }));
});
