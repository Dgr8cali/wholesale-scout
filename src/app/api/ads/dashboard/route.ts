import { handle } from "@/lib/server/http";
import { adsDashboard } from "@/lib/server/ads";

/** Per ASIN, per campaign and per search term, with break-even ACoS and the status chips. */
export const GET = handle(async () => Response.json(await adsDashboard()));
