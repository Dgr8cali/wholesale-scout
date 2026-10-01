import { handle } from "@/lib/server/http";
import { reparsePoe } from "@/lib/server/pl";

export const maxDuration = 60;

/** Read every stored Opportunity Explorer capture again with the current parser and refill Gates 3 and 5. */
export const POST = handle(async () => Response.json({ snapshots: await reparsePoe() }));
