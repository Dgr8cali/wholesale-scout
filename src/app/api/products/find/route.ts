import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { findProducts } from "@/lib/server/productPage";

/** Products by ASIN, EAN or words of the title (?q=), for the top bar's search. */
export const GET = handle(async (req: NextRequest) => Response.json({ products: await findProducts(req.nextUrl.searchParams.get("q") ?? "") }));
