import "server-only";
import { acosForTacos, breakEvenTacos, DEFAULT_CTR_BENCHMARK, listingHealth, median, organicShare, suggestTacos, type Health, type Optimise, type SalesSplit } from "../ads/tacos";
import { db } from "./db";

/**
 * Per product, beyond ACoS: how its sales split between ads and organic (TACoS, organic share), the
 * ACoS its TACoS target allows in TACoS mode, whether to suggest TACoS mode, and listing health (ad
 * CTR and CVR against the niche).
 */
export interface Insights {
  split: SalesSplit; period: string;
  tacos: number | null; organicShare: number | null;
  /** Organic share over the last 30 days (daily data), else over the import when it's 30+ days. */
  share30: { value: number; period: string } | null;
  reviews: number | null;
  suggestTacos: boolean;
  breakEvenTacos: number | null;
  optimise: Optimise; targetTacos: number | null;
  /** In TACoS mode: the ACoS the target TACoS allows, and the ad share of sales it came from. */
  acosForTacos: { acos: number; adShare: number | null; capped: boolean } | null;
  health: Health;
}

interface Row {
  asin: string; from: string | null; to: string | null;
  totals: { impressions: number | null; clicks: number; cost: number; orders: number; sales: number; units: number | null };
  economics: { price: number; margin: number | null; breakEvenAcos: number | null } | null;
}

const DAY = 86_400_000;
const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY) + 1;

export async function insightsFor(rows: Row[], ctx: {
  daily: { campaign: string; date: string; impressions: number | null; clicks: number; cost: number; orders: number; sales: number }[];
  campaignAsin: Map<string, string | null>;
  products: Map<string, { optimise?: Optimise | null; target_tacos?: number | null; pl_candidate_id?: string | null }>;
  ctrBenchmark: number | null;
}): Promise<Record<string, Insights>> {
  const d = db();
  const asins = rows.map((r) => r.asin);
  if (!asins.length) return {};
  const since = rows.map((r) => r.from).filter(Boolean).sort()[0] ?? new Date(Date.now() - 90 * DAY).toISOString().slice(0, 10);
  const candIds = [...new Set(asins.map((a) => ctx.products.get(a)?.pl_candidate_id).filter((x): x is string => !!x))];
  const [sales, snaps, conv] = await Promise.all([
    d.from("amazon_sales").select("asin, day, units, revenue").in("asin", asins).gte("day", since),
    d.from("keepa_snapshots").select("asin, review_count_series, fetched_at").in("asin", asins).order("fetched_at", { ascending: false }),
    candIds.length ? d.from("pl_candidate_fields").select("candidate_id, value").eq("key", "conv").in("candidate_id", candIds) : Promise.resolve({ data: [], error: null }),
  ]);
  const salesRows = (sales.data ?? []) as { asin: string; day: string; units: number; revenue: number }[];
  const reviewsOf = (asin: string) => {
    const s = ((snaps.data ?? []) as { asin: string; review_count_series: [number, number | null][] | null }[]).find((x) => x.asin === asin);
    return s?.review_count_series?.filter((p) => p[1] != null && p[1] >= 0).at(-1)?.[1] ?? null;
  };
  const convByCand = new Map(((conv.data ?? []) as { candidate_id: string; value: string }[]).map((c) => [c.candidate_id, Number(c.value) / 100]));
  // The account median CVR: across products with clicks.
  const accountCvr = median(rows.filter((r) => r.totals.clicks > 0).map((r) => r.totals.orders / r.totals.clicks));
  const ctrB = ctx.ctrBenchmark ?? DEFAULT_CTR_BENCHMARK;

  const out: Record<string, Insights> = {};
  for (const r of rows) {
    const mine = salesRows.filter((s) => s.asin === r.asin);
    const between = (a: string, b: string) => mine.filter((s) => s.day >= a && s.day <= b);
    const inRange = r.from && r.to ? between(r.from, r.to) : [];
    const split: SalesSplit = {
      adUnits: r.totals.units ?? r.totals.orders, adSales: r.totals.sales,
      totalUnits: inRange.length ? inRange.reduce((a, s) => a + Number(s.units), 0) : null,
      totalSales: inRange.length ? inRange.reduce((a, s) => a + Number(s.revenue), 0) : null,
    };
    const period = r.from && r.to ? `over ${day(r.from)} – ${day(r.to)}` : "";
    // The last 30 days: the daily Campaign report when it covers them, else the import if it's 30+ days.
    const myDaily = ctx.daily.filter((x) => ctx.campaignAsin.get(x.campaign) === r.asin);
    const lastDaily = myDaily.map((x) => x.date).sort().at(-1) ?? null;
    let share30: Insights["share30"] = null;
    let healthIn = { impressions: r.totals.impressions, clicks: r.totals.clicks, orders: r.totals.orders, period: `${period}${r.from && r.to && days(r.from, r.to) > 31 ? " (the whole import: no daily data for the last 30 days)" : ""}` };
    if (lastDaily) {
      const from30 = new Date(Date.parse(lastDaily) - 29 * DAY).toISOString().slice(0, 10);
      const w = myDaily.filter((x) => x.date >= from30);
      if (new Set(w.map((x) => x.date)).size >= 25) {
        const adUnits = w.reduce((a, x) => a + x.orders, 0);
        const all = between(from30, lastDaily);
        const s = all.length ? organicShare({ adUnits, totalUnits: all.reduce((a, x) => a + Number(x.units), 0), adSales: 0, totalSales: null }) : null;
        if (s != null) share30 = { value: s, period: `last 30 days to ${day(lastDaily)}` };
        healthIn = { impressions: w.reduce((a, x) => a + (x.impressions ?? 0), 0), clicks: w.reduce((a, x) => a + x.clicks, 0), orders: w.reduce((a, x) => a + x.orders, 0), period: `over the last 30 days to ${day(lastDaily)}` };
      }
    }
    const share = organicShare(split);
    if (!share30 && share != null && r.from && r.to && days(r.from, r.to) >= 30) share30 = { value: share, period };
    const reviews = reviewsOf(r.asin);
    const p = ctx.products.get(r.asin);
    const optimise: Optimise = p?.optimise === "tacos" ? "tacos" : "acos";
    const beTacos = breakEvenTacos(r.economics?.margin ?? null, r.economics?.price ?? null);
    const targetTacos = p?.target_tacos != null ? Number(p.target_tacos) / 100 : beTacos;
    const candConv = p?.pl_candidate_id ? convByCand.get(p.pl_candidate_id) : undefined;
    const cvrB = candConv != null && Number.isFinite(candConv) && candConv > 0
      ? { cvr: candConv, cvrSource: "(the niche's search conversion, Opportunity Explorer)" }
      : { cvr: accountCvr, cvrSource: rows.length > 1 ? "(account median)" : "(account median: this is the only product, so it's its own)" };
    out[r.asin] = {
      split, period, tacos: split.totalSales ? r.totals.cost / split.totalSales : null, organicShare: share, share30, reviews,
      suggestTacos: optimise === "acos" && suggestTacos(share30?.value ?? null, reviews),
      breakEvenTacos: beTacos, optimise, targetTacos,
      acosForTacos: optimise === "tacos" && targetTacos != null ? acosForTacos(targetTacos, split) : null,
      health: listingHealth(healthIn, { ctr: ctrB, ...cvrB }),
    };
  }
  return out;
}
