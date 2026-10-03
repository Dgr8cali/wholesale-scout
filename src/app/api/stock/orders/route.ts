import { handle } from "@/lib/server/http";
import { listPurchases } from "@/lib/server/purchases";

/** Stock → Orders: every purchase of a stock item, newest first. */
export const GET = handle(async () => Response.json({ orders: (await listPurchases()).filter((p) => p.stock_item_id) }));
