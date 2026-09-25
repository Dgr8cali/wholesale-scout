import { handle } from "@/lib/server/http";
import { scannedSellers } from "@/lib/server/sellerScan";

/** Sellers whose storefronts have been scanned, with how the last scan came out. */
export const GET = handle(async () => Response.json({ sellers: await scannedSellers() }));
