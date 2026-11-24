import { compareWeek } from "@/lib/adsapi/compare";
import { windowFor } from "@/lib/adsapi/reports";
import { dailyRowsBySource } from "@/lib/server/adsConnection";
import { handle } from "@/lib/server/http";

/** The last 7 days' campaign rows pulled from the API next to the daily rows imported from files (both read from the database). */
export const GET = handle(async () => {
  const { from, to } = windowFor("campaigns", "manual");
  const [api, imported] = await Promise.all([dailyRowsBySource(from, to, "api"), dailyRowsBySource(from, to, "import")]);
  return Response.json({ from, to, comparison: compareWeek(api, imported, from, to), hasApi: api.length > 0 });
});
