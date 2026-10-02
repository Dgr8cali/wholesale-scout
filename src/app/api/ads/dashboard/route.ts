import { handle } from "@/lib/server/http";
import { adsDashboard } from "@/lib/server/ads";
import { launchPlans, rankHistory, stockByAsin } from "@/lib/server/adsOps";
import { db, must } from "@/lib/server/db";

/** Per ASIN, per campaign and per search term, with break-even ACoS and the status chips; plus stock, launch plans and each keyword's rank checks. */
export const GET = handle(async () => {
  const plans = await launchPlans();
  const dash = await adsDashboard(plans.map((p) => p.asin));
  const adsUnits = new Map(dash.asins.map((a) => {
    const days = a.from && a.to ? (Date.parse(a.to) - Date.parse(a.from)) / 86_400_000 + 1 : null;
    return [a.asin, days ? (a.totals.units ?? a.totals.orders) / days : null] as const;
  }));
  const asins = [...new Set([...dash.asins.map((a) => a.asin), ...plans.map((p) => p.asin)])];
  const [stock, ranks, kws] = await Promise.all([
    stockByAsin(asins, adsUnits), rankHistory(),
    db().from("ads_keywords").select("keyword_id, campaign, keyword_text, match_type, bid, state, impressions, clicks, cost, orders, sales").then((r) => must(r, "keywords") as Record<string, unknown>[]),
  ]);
  const camp = new Map(dash.campaigns.map((c) => [c.id, c]));
  const keywords = kws.map((k) => {
    const c = camp.get(k.campaign as string);
    const asin = c?.asin ?? null;
    const text = String(k.keyword_text);
    return {
      keywordId: k.keyword_id, campaign: k.campaign, campaignName: c?.name ?? "", asin, text, matchType: k.match_type, bid: k.bid == null ? null : Number(k.bid), state: k.state,
      clicks: Number(k.clicks), cost: Number(k.cost), orders: Number(k.orders), sales: Number(k.sales),
      ranks: asin ? (ranks[asin]?.[text.trim().toLowerCase()] ?? []).slice(-8) : [],
    };
  }).sort((a, b) => b.cost - a.cost);
  return Response.json({ ...dash, stock, plans, keywords });
});
