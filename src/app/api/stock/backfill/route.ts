import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { linkPurchasesToItems } from "@/lib/server/purchases";

/** Link every purchase to a stock item (made from the catalogue where needed) and fill missing images. ?keepa=0: free sources only. */
export const POST = handle(async (req: NextRequest) => Response.json(await linkPurchasesToItems({ keepa: req.nextUrl.searchParams.get("keepa") !== "0" })));
