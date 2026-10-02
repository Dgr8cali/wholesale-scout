import { handle } from "@/lib/server/http";
import { stockSummary } from "@/lib/server/stock";

/** Home's Stock row: value at cost, units by bucket, low-stock count, reorders due. */
export const GET = handle(async () => Response.json(await stockSummary()));
