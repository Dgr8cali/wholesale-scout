import { handle } from "@/lib/server/http";
import { stockLevels } from "@/lib/server/stock";

/** Every item: levels per bucket (FBA from SP-API), value, demand, days of cover, status, reorder. */
export const GET = handle(async () => Response.json(await stockLevels()));
