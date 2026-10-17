/**
 * What Keepa fills on a private-label candidate: Gate 0's sell price, weight and size, Gate 1 from
 * every page-one ASIN, Gate 2 from the reference listing. Each value carries the figures it came
 * from, shown under the field. Pure.
 */
import { median } from "../format";
import { fastVelocity, salesPerMonth } from "../screening/sales";
import type { RankTrend } from "./history";

/** A competitor ASIN as stored on pl_candidate_asins. */
export interface PlAsin {
  asin: string;
  position: number;
  is_reference: boolean;
  title: string | null;
  brand: string | null;
  image: string | null;
  price: number | null;
  rating: number | null;
  review_count: number | null;
  rank: number | null;
  avg_rank_90d: number | null;
  rank_drops_90d: number | null;
  bought_past_month: number | null;
  offer_count: number | null;
  buybox_price: number | null;
  amazon_ever_seller: boolean | null;
  amazon_brand: boolean | null;
  dimensions: { l: number; w: number; h: number } | null;
  weight: number | null;
  first_seen: string | null;
  history: PlHistory | null;
  snapshot_at: string | null;
}

export interface PlHistory {
  rankTrend: RankTrend | null;
  rankTrendWhy: string;
  offerTrend: "steady" | "climbing" | null;
  offerTrendWhy: string;
  bbTrend: "holds" | "sliding" | null;
  bbTrendWhy: string;
  /** Keepa's 30-day rank-drop count, for the sales estimate. */
  keepaRankDrops30: number | null;
  /** The Buy Box history was fetched (stage 2); without it bbTrend is unknown. */
  buyBoxFetched: boolean;
}

/** An automatic value; `source` overrides the fill's own (e.g. "poe_derived" within a POE fill). */
export interface Filled { value: string; why: string; source?: "poe_derived" }
export type Fill = Record<string, Filled>;

/** Gatekeeper's Gate 0 band (£18–35) unless the candidate sets its own; widened 20% each way for "the price spread holds". */
export const PRICE_BAND = { min: 18, max: 35 };

const round = (n: number, dp = 0) => Math.round(n * 10 ** dp) / 10 ** dp;
const gbp = (n: number) => `£${n.toFixed(2)}`;
const n0 = (n: number) => Math.round(n).toLocaleString("en-GB");

/**
 * Sales a month for one listing, by the wholesale rule (screening/sales): a fast seller (90-day
 * average rank under 5,000) uses Amazon's bought-in-past-month, since rank drops undercount it;
 * otherwise the highest of the rank-drop counts and bought-in-past-month.
 */
export function monthlySales(a: PlAsin): { value: number | null; why: string } {
  const drops = a.rank_drops_90d != null ? Math.round(a.rank_drops_90d / 3) : null;
  if (drops == null && a.bought_past_month == null && a.history?.keepaRankDrops30 == null) return { value: null, why: "no sales data" };
  const s = salesPerMonth({ hasHistory: true, avgRank90d: a.avg_rank_90d, rankDrops30d: drops, keepaRankDrops30: a.history?.keepaRankDrops30 ?? null, monthlySold: a.bought_past_month });
  const best = s.sources.find((x) => x.best);
  const why = fastVelocity({ avgRank90d: a.avg_rank_90d }) && best?.plus ? "bought in past month (fast seller)" : best?.label.includes("bought") ? "bought in past month" : "rank drops";
  return { value: s.value, why };
}

/** The listing's price: the Buy Box, else the lowest new offer. */
export const priceOf = (a: PlAsin) => a.buybox_price ?? a.price;

/** The bands in words, for the caption ("most 200–500"). */
const BAND_WORDS = ["most over 1,000", "most over 500", "most 200–500", "several under 200 selling well"];

/** One read of page one's reviews: the band (Gatekeeper's: over 1,000 / 500+ / several under 200 selling 150+ a month / else 200–500). */
function bandOf(asins: PlAsin[]): { value: string; dist: string } | null {
  const counts = asins.map((a) => a.review_count).filter((c): c is number => c != null);
  if (!counts.length) return null;
  const share = (pred: (c: number) => boolean) => counts.filter(pred).length / counts.length;
  const under200Selling = asins.filter((a) => a.review_count != null && a.review_count < 200 && (monthlySales(a).value ?? 0) >= 150).length;
  const dist = `${counts.filter((c) => c > 1000).length} over 1,000 · ${counts.filter((c) => c >= 500 && c <= 1000).length} 500–1,000 · ${counts.filter((c) => c >= 200 && c < 500).length} 200–500 · ${counts.filter((c) => c < 200).length} under 200`;
  const value = share((c) => c > 1000) > 0.5 ? "0" : share((c) => c >= 500) > 0.5 ? "1" : under200Selling >= 2 ? "3" : "2";
  return { value, dist };
}

/**
 * Gate 1's review depth, read from the newest third of page one by first-seen date (at least 3
 * listings), so a page of old incumbents with new entrants selling beside them isn't scored on the
 * incumbents. The bands are Gatekeeper's, unchanged. With first-seen dates missing for more than a
 * third of the listings, it reads all of them and says so. The caption shows both reads:
 * "Newest third (3 of 8): most 200–500 · all listings: most over 500".
 */
export function reviewsBand(asins: PlAsin[]): Filled | null {
  const withCounts = asins.filter((a) => a.review_count != null);
  const all = bandOf(withCounts);
  if (!all) return null;
  const n = withCounts.length;
  const undated = withCounts.filter((a) => !a.first_seen || !Number.isFinite(Date.parse(a.first_seen))).length;
  if (undated > n / 3) {
    return { value: all.value, why: `All listings (first-seen dates missing for ${undated} of ${n}): ${BAND_WORDS[+all.value]} (${all.dist})` };
  }
  const take = Math.min(n, Math.max(3, Math.ceil(n / 3)));
  const newest = withCounts.filter((a) => a.first_seen && Number.isFinite(Date.parse(a.first_seen)))
    .sort((a, b) => Date.parse(b.first_seen!) - Date.parse(a.first_seen!) || a.position - b.position).slice(0, take);
  const read = bandOf(newest)!;
  return { value: read.value, why: `Newest third (${newest.length} of ${n}): ${BAND_WORDS[+read.value]} (${read.dist}) · all listings: ${BAND_WORDS[+all.value]}` };
}

/** The fields Gate 2 takes from the reference listing (what changing the reference re-runs). */
export const GATE2_KEYS = ["rankTrend", "rankDrops", "bought", "offerTrend", "bbTrend", "amazonSeller"] as const;

/**
 * The default reference listing: the one with the longest Keepa history (earliest first seen), so a
 * young listing's launch isn't read as the niche's 12 months; ties and unknowns by position.
 */
export function defaultReference(asins: Pick<PlAsin, "asin" | "position" | "first_seen">[]): string | null {
  if (!asins.length) return null;
  const t = (a: Pick<PlAsin, "first_seen">) => (a.first_seen ? Date.parse(a.first_seen) : Number.POSITIVE_INFINITY);
  return [...asins].sort((a, b) => t(a) - t(b) || a.position - b.position)[0].asin;
}

/** "3 yrs 2 mths", "7 mths", "3 wks": how long Keepa has seen the listing. */
export function listingAge(firstSeen: string | null, now = Date.now()): { months: number; text: string } | null {
  if (!firstSeen) return null;
  const days = Math.max(0, (now - Date.parse(firstSeen)) / 86_400_000);
  const months = days / 30.44;
  const y = Math.floor(months / 12), m = Math.floor(months % 12);
  const text = months < 1 ? `${Math.max(1, Math.round(days / 7))} wk${Math.round(days / 7) === 1 ? "" : "s"}` : y ? `${y} yr${y === 1 ? "" : "s"}${m ? ` ${m} mth${m === 1 ? "" : "s"}` : ""}` : `${m} mth${m === 1 ? "" : "s"}`;
  return { months, text };
}

/** Gate 0 defaults and Gates 1 and 2, from the page-one ASINs and the reference among them. */
export function keepaFill(asins: PlAsin[], target: { min: number; max: number } = PRICE_BAND): Fill {
  const BAND_LO = target.min * 0.8, BAND_HI = target.max * 1.2;
  const out: Fill = {};
  const live = asins.filter((a) => a.snapshot_at);
  if (!live.length) return out;
  const ref = live.find((a) => a.is_reference) ?? live[0];

  // Gate 0: sell = median page-one price; size and weight from the reference listing's package.
  const prices = live.map(priceOf).filter((p): p is number => p != null && p > 0);
  const med = median(prices);
  if (med != null) out.sell = { value: String(round(med, 2)), why: `Median of ${prices.length} page-one price${prices.length === 1 ? "" : "s"}` };
  if (ref.weight != null) out.weight = { value: String(ref.weight), why: `${ref.asin}'s package weight (Keepa)` };
  if (ref.dimensions) {
    const d = ref.dimensions;
    out.dimL = { value: String(round(d.l, 1)), why: `${ref.asin}'s package (Keepa)` };
    out.dimW = { value: String(round(d.w, 1)), why: `${ref.asin}'s package (Keepa)` };
    out.dimH = { value: String(round(d.h, 1)), why: `${ref.asin}'s package (Keepa)` };
  }

  // Gate 1.
  const band = reviewsBand(live);
  if (band) out.reviewsBand = band;
  const ratings = live.map((a) => a.rating).filter((r): r is number => r != null && r > 0);
  if (ratings.length) out.avgRating = { value: String(round(ratings.reduce((a, b) => a + b, 0) / ratings.length, 2)), why: `Mean of ${ratings.length} rating${ratings.length === 1 ? "" : "s"}` };
  const sales = live.map((a) => ({ a, s: monthlySales(a) })).filter((x) => x.s.value != null);
  if (sales.length) {
    const m = median(sales.map((x) => x.s.value!))!;
    out.top10Sales = { value: String(Math.round(m)), why: `Median of ${sales.length}: ${sales.map((x) => `${x.a.asin} ${n0(x.s.value!)} (${x.s.why})`).join(", ")}` };
    const sorted = sales.map((x) => x.s.value!).sort((a, b) => b - a);
    const total = sorted.reduce((a, b) => a + b, 0);
    if (total > 0) {
      const top3 = sorted.slice(0, 3).reduce((a, b) => a + b, 0);
      out.top3Share = {
        value: String(Math.round((top3 / total) * 100)),
        why: `Top 3 sell ${n0(top3)} of ${n0(total)} a month across ${sorted.length} listing${sorted.length === 1 ? "" : "s"}${sorted.length <= 3 ? " (3 or fewer listings: always 100%; add more ASINs)" : ""}`,
      };
    }
  }
  const amazonBrands = live.filter((a) => a.amazon_brand);
  out.amazonBrand = { value: amazonBrands.length ? "yes" : "no", why: amazonBrands.length ? `${amazonBrands.map((a) => `${a.brand} (${a.asin})`).join(", ")}` : `None of ${live.length} brands is an Amazon brand` };
  if (prices.length) {
    const inside = prices.filter((p) => p >= BAND_LO && p <= BAND_HI).length;
    out.priceTight = { value: inside / prices.length >= 0.7 ? "yes" : "no", why: `${inside} of ${prices.length} prices inside ${gbp(BAND_LO)}–${gbp(BAND_HI)} (the ${gbp(target.min)}–${gbp(target.max)} target band ±20%; 70% needed)` };
  }

  // Gate 2, from the reference listing.
  const h = ref.history;
  if (h?.rankTrend != null) out.rankTrend = { value: h.rankTrend, why: `${ref.asin}: ${h.rankTrendWhy}` };
  if (ref.rank_drops_90d != null) out.rankDrops = { value: String(Math.round(ref.rank_drops_90d / 3)), why: `${ref.asin}: ${n0(ref.rank_drops_90d)} rank drops in 90 days ÷ 3` };
  if (ref.bought_past_month != null) out.bought = { value: String(ref.bought_past_month), why: `${ref.asin}: Amazon's "${n0(ref.bought_past_month)}+ bought in past month"` };
  if (h?.offerTrend) out.offerTrend = { value: h.offerTrend, why: `${ref.asin}: ${h.offerTrendWhy}` };
  if (h?.bbTrend) out.bbTrend = { value: h.bbTrend, why: `${ref.asin}: ${h.bbTrendWhy}` };
  if (ref.amazon_ever_seller != null) out.amazonSeller = { value: ref.amazon_ever_seller ? "yes" : "no", why: ref.amazon_ever_seller ? `${ref.asin}: Amazon has held an offer (Keepa's Amazon price history)` : `${ref.asin}: no Amazon offer in Keepa's history` };
  return out;
}
