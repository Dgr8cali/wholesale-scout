import { handle } from "@/lib/server/http";
import { rescoreReferences } from "@/lib/server/pl";

/**
 * Every candidate whose Gate 2 reference you haven't picked onto the longest Keepa history, from
 * stored data (no Keepa tokens); Gate 2 re-run for those that move. The scorecard re-scores itself.
 */
export const POST = handle(async () => Response.json({ moved: await rescoreReferences() }));
