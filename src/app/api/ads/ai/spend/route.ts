import { handle } from "@/lib/server/http";
import { aiSpend, latestAi } from "@/lib/server/adsAi";

/** What the research layer has cost, and the latest monthly review (for Home). */
export const GET = handle(async () => {
  const month = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  return Response.json({ spend: await aiSpend(), lastMonth: month, review: await latestAi("review", month) });
});
