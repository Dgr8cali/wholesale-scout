import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { listProducts } from "@/lib/server/productPage";

/** Products, one per ASIN, newest screening first: ?q= (ASIN, EAN, title, brand), &verdict=, &bought=1, &page=. */
export const GET = handle(async (req: NextRequest) => {
  const s = req.nextUrl.searchParams;
  return Response.json(await listProducts({ text: s.get("q"), verdict: s.get("verdict"), bought: s.get("bought") === "1", page: Number(s.get("page")) || 0 }));
});
