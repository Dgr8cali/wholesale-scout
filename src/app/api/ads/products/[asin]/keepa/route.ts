import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { fetchAdsProductFromKeepa } from "@/lib/server/ads";

type Ctx = { params: Promise<{ asin: string }> };

/** The product's title, size and weight from Keepa (about 1 token), for its FBA fee. */
export const POST = handle(async (_req: NextRequest, ctx: Ctx) => Response.json(await fetchAdsProductFromKeepa((await ctx.params).asin.toUpperCase())));
