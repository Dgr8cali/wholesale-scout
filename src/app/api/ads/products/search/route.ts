import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { searchProducts } from "@/lib/server/ads";

/** ?q= an ASIN or words of a title: products to assign a campaign to (free, no Keepa call). */
export const GET = handle(async (req: NextRequest) => Response.json({ matches: await searchProducts(req.nextUrl.searchParams.get("q") ?? "") }));
