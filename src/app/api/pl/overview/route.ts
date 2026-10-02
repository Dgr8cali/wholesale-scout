import { handle } from "@/lib/server/http";
import { candidatesOverview } from "@/lib/server/plQuotes";

/** Per candidate: status, quotes, chosen landed cost, next launch step. */
export const GET = handle(async () => Response.json({ candidates: await candidatesOverview() }));
