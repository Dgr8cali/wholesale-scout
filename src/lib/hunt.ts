/**
 * Hunt: Keepa's Product Finder asked for products shaped like the default profile wants
 * (price band, seller range, rank ceiling, no Amazon, a category), before you have a supplier.
 */
import { rankCeiling } from "./screening/categories";
import type { ProfileConfig } from "./screening/config";

export interface HuntShape {
  priceMin: number;
  priceMax: number;
  sellersMin: number;
  sellersMax: number;
  /** Ceiling on the 90-day average sales rank. */
  maxRank: number;
  noAmazon: boolean;
  /** Keepa's (Amazon's) top-level category id and name; null = every category. */
  category: { id: number; name: string } | null;
  /** How many products to take (the finder's page size). */
  results: number;
}

export const HUNT_RESULTS = [50, 100, 250, 500] as const;

/** The profile's shape, the rank ceiling for the category when it has its own. */
export function shapeFromProfile(cfg: ProfileConfig, category: HuntShape["category"] = null, results = 100): HuntShape {
  const g = cfg.gates;
  return {
    priceMin: g.priceBand.min,
    priceMax: g.priceBand.max,
    sellersMin: g.competition.minSellers,
    sellersMax: g.competition.maxSellers,
    maxRank: rankCeiling(g.demand, category?.name).max,
    noAmazon: g.amazonPresence.mode !== "off",
    category,
    results,
  };
}

/**
 * Keepa's Product Finder query. Prices are in pence; the seller range is the count of new
 * offers (Keepa's finder has no FBA-only count; the run's Competition gate checks FBA sellers).
 */
export function finderSelection(s: HuntShape): Record<string, unknown> {
  return {
    ...(s.category ? { rootCategory: [s.category.id] } : {}),
    current_BUY_BOX_SHIPPING_gte: Math.round(s.priceMin * 100),
    current_BUY_BOX_SHIPPING_lte: Math.round(s.priceMax * 100),
    current_COUNT_NEW_gte: s.sellersMin,
    current_COUNT_NEW_lte: s.sellersMax,
    avg90_SALES_gte: 1,
    avg90_SALES_lte: s.maxRank,
    ...(s.noAmazon ? { availabilityAmazon: [-1] } : {}),
    productType: [0],
    sort: [["avg90_SALES", "asc"]],
    perPage: s.results,
    page: 0,
  };
}

/** Keepa's price for a Product Finder page: 10 tokens, plus 1 per 100 ASINs returned. */
export const finderTokens = (results: number) => 10 + Math.ceil(results / 100);

/** A readable name for the run: "Hunt · Beauty · £12–35 · 2–8 sellers · rank ≤ 60,000". */
export function huntName(s: HuntShape): string {
  return [
    "Hunt", s.category?.name ?? "All categories", `£${s.priceMin}–${s.priceMax}`, `${s.sellersMin}–${s.sellersMax} sellers`,
    `rank ≤ ${s.maxRank.toLocaleString("en-GB")}`, ...(s.noAmazon ? ["no Amazon"] : []),
  ].join(" · ");
}

/** A shape as sent by the page, checked. */
export function validShape(x: Partial<HuntShape>): HuntShape | string {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
  const s: HuntShape = {
    priceMin: n(x.priceMin), priceMax: n(x.priceMax), sellersMin: Math.round(n(x.sellersMin)), sellersMax: Math.round(n(x.sellersMax)),
    maxRank: Math.round(n(x.maxRank)), noAmazon: !!x.noAmazon,
    category: x.category && Number.isFinite(Number(x.category.id)) ? { id: Number(x.category.id), name: String(x.category.name ?? "") } : null,
    results: (HUNT_RESULTS as readonly number[]).includes(Number(x.results)) ? Number(x.results) : 100,
  };
  if (!(s.priceMin >= 0) || !(s.priceMax > s.priceMin)) return "The price band needs a min under the max";
  if (!(s.sellersMin >= 0) || !(s.sellersMax >= s.sellersMin)) return "The seller range needs a min at or under the max";
  if (!(s.maxRank >= 1)) return "The rank ceiling must be at least 1";
  return s;
}
