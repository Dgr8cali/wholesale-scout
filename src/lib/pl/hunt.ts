/**
 * Niche Hunt: Keepa's Product Finder asked for products that already pass Gatekeeper's Gate 0 and
 * Gate 1, hunted per leaf browse category (each leaf is a niche). Two stages: size each leaf with
 * one finder call and no detail; then fetch detail for the most promising leaves. Pure: the page
 * and the server share it.
 *
 * What the finder can filter is filtered there (price, rating, no Amazon now, package size, listing
 * age, category, Amazon brands). The rest needs each product's detail, so it's checked after the
 * fetch: rank drops, Amazon in the last 90 days, the exact small-parcel fit, and reviews. Reviews are
 * the *qualifying* rule rather than a finder filter: products over the review cap are kept in their
 * niche as the incumbents to beat, which is what the shape badge and "max reviews" read.
 */
import { median } from "../format";
import { AMAZON_BRANDS, isAmazonBrand } from "./amazon-brands";
import { fastVelocity } from "../screening/sales";
import { monthlySales, priceOf, type PlAsin } from "./fill";

export interface NicheHuntFilters {
  priceMin: number;
  priceMax: number;
  /** Products with more reviews than this don't qualify (they stay as incumbents). */
  maxReviews: number;
  ratingMin: number;
  ratingMax: number;
  /** Rank drops over 90 days, at least (≈ 100 a month at 300). Checked after the fetch. */
  minRankDrops90: number;
  /**
   * Ceiling on the 90-day average sales rank, asked of the finder: it has no rank-drops filter, and
   * without a rank bound it returns listings that barely sell. A pre-filter only; drops decide.
   */
  maxRank90: number;
  /** No Amazon offer now, nor in the last 90 days. */
  noAmazon: boolean;
  maxWeightG: number;
  /** Package within the small-parcel limits (35 × 25 × 12 cm) when Keepa has the dimensions. */
  smallParcel: boolean;
  /**
   * Category ids from Amazon UK's top-level list. Matched on the category a product's sales rank is
   * in (Keepa's salesRankReference): UK kitchen products sit under the Home & Garden root but rank in
   * Home & Kitchen, and a rootCategory filter on Home & Kitchen finds only odd listings.
   */
  categories: number[];
  minListedMonths: number;
  excludeAmazonBrands: boolean;
  /** Qualifying ASINs a niche needs to be shown. */
  minAsins: number;
  /** Stage 1: leaves to size (the largest under the roots by product count). */
  leavesCap: number;
  /** Stage 2: leaves to fetch detail for, most matches first ("N"). */
  detailLeaves: number;
  /** Stage 2: ASINs per leaf, best-selling first. */
  perLeaf: number;
  /** A leaf with fewer finder matches than this isn't detailed. */
  minLeafMatches: number;
  /** Hunt exactly these leaf ids instead of the largest under the roots (a smoke test, a re-check). */
  leafIds?: number[];
}

/** Keepa UK root categories Gatekeeper's Gate 0 allows by default. */
export const DEFAULT_CATEGORY_NAMES = ["Home & Kitchen", "Garden", "Sports & Outdoors", "Pet Supplies", "Stationery & Office Supplies", "Baby Products", "DIY & Tools"];
/** Gate 0's avoid categories: off by default, can be ticked on. */
export const AVOID_CATEGORY_NAMES = ["Beauty", "Premium Beauty", "Health & Personal Care", "Grocery", "Electronics & Photo", "Computers & Accessories", "Toys & Games", "Fashion"];

export const SMALL_PARCEL_CM: [number, number, number] = [35, 25, 12];
export const LIMITS = { leavesCap: 200, detailLeaves: 50, perLeaf: 50 };
/** Keepa's smallest finder page: sizing a leaf returns up to this many ASINs, best-selling first. */
export const SIZING_PAGE = 50;

export function defaultFilters(categories: { id: number; name: string }[]): NicheHuntFilters {
  return {
    priceMin: 18, priceMax: 35, maxReviews: 500, ratingMin: 3.8, ratingMax: 4.3, minRankDrops90: 300, maxRank90: 75_000, noAmazon: true,
    maxWeightG: 500, smallParcel: true, minListedMonths: 6, excludeAmazonBrands: true, minAsins: 3,
    leavesCap: 60, detailLeaves: 15, perLeaf: 12, minLeafMatches: 5,
    categories: categories.filter((c) => DEFAULT_CATEGORY_NAMES.includes(c.name)).map((c) => c.id),
  };
}

/** Filters as sent by the page, checked. */
export function validFilters(x: Partial<NicheHuntFilters>): NicheHuntFilters | string {
  const n = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const f: NicheHuntFilters = {
    priceMin: n(x.priceMin, 18), priceMax: n(x.priceMax, 35), maxReviews: Math.round(n(x.maxReviews, 500)),
    ratingMin: n(x.ratingMin, 3.8), ratingMax: n(x.ratingMax, 4.3), minRankDrops90: Math.round(n(x.minRankDrops90, 300)), maxRank90: Math.round(n(x.maxRank90, 75_000)),
    noAmazon: x.noAmazon !== false, maxWeightG: Math.round(n(x.maxWeightG, 500)), smallParcel: x.smallParcel !== false,
    categories: Array.isArray(x.categories) ? x.categories.map(Number).filter(Number.isFinite).slice(0, 50) : [],
    minListedMonths: n(x.minListedMonths, 6), excludeAmazonBrands: x.excludeAmazonBrands !== false,
    minAsins: Math.max(1, Math.round(n(x.minAsins, 3))),
    leavesCap: Math.round(n(x.leavesCap, 60)), detailLeaves: Math.round(n(x.detailLeaves, 15)), perLeaf: Math.round(n(x.perLeaf, 12)),
    minLeafMatches: Math.max(1, Math.round(n(x.minLeafMatches, 5))),
    ...(Array.isArray(x.leafIds) && x.leafIds.length ? { leafIds: x.leafIds.map(Number).filter(Number.isFinite).slice(0, LIMITS.leavesCap) } : {}),
  };
  if (!(f.priceMin >= 0) || !(f.priceMax > f.priceMin)) return "The price band needs a min under the max";
  if (!(f.ratingMin >= 0 && f.ratingMax <= 5 && f.ratingMax >= f.ratingMin)) return "Ratings run 0–5, min at or under max";
  if (!f.categories.length) return "Pick at least one category";
  if (!(f.maxRank90 >= 1)) return "The rank ceiling must be at least 1";
  if (!(f.leavesCap >= 1 && f.leavesCap <= LIMITS.leavesCap)) return `Leaves to size must be 1–${LIMITS.leavesCap}`;
  if (!(f.detailLeaves >= 1 && f.detailLeaves <= LIMITS.detailLeaves)) return `Leaves to detail must be 1–${LIMITS.detailLeaves}`;
  if (!(f.perLeaf >= 1 && f.perLeaf <= LIMITS.perLeaf)) return `ASINs per leaf must be 1–${LIMITS.perLeaf}`;
  return f;
}

const keepaMinutes = (ms: number) => Math.floor(ms / 60_000) - 21_564_000;

/**
 * The Product Finder query for one leaf: only what the finder can check itself, products listed
 * directly in the leaf, best-selling first (90-day rank), one per variation family, Keepa's smallest
 * page (the match count is what stage 1 is after; the page is kept for stage 2).
 */
export function finderSelection(f: NicheHuntFilters, leafId: number, now = Date.now()): Record<string, unknown> {
  const mm = SMALL_PARCEL_CM[0] * 10; // the longest side; the exact fit is checked after the fetch
  return {
    categories_include: [leafId],
    current_BUY_BOX_SHIPPING_gte: Math.round(f.priceMin * 100),
    current_BUY_BOX_SHIPPING_lte: Math.round(f.priceMax * 100),
    current_RATING_gte: Math.round(f.ratingMin * 10),
    current_RATING_lte: Math.round(f.ratingMax * 10),
    avg90_SALES_gte: 1,
    avg90_SALES_lte: f.maxRank90,
    ...(f.noAmazon ? { availabilityAmazon: [-1], buyBoxStatsAmazon90_lte: 0 } : {}),
    packageWeight_lte: f.maxWeightG,
    ...(f.smallParcel ? { packageLength_lte: mm, packageWidth_lte: mm, packageHeight_lte: mm } : {}),
    ...(f.minListedMonths > 0 ? { trackingSince_lte: keepaMinutes(now - f.minListedMonths * 30.44 * 86_400_000) } : {}),
    ...(f.excludeAmazonBrands ? { brand: AMAZON_BRANDS.map((b) => `✜${b}`) } : {}),
    productType: [0],
    singleVariation: true,
    sort: [["avg90_SALES", "asc"]],
    perPage: SIZING_PAGE,
    page: 0,
  };
}

/** Keepa's price for a Product Finder page: 10 tokens, plus 1 per 100 ASINs returned (as the wholesale Hunt). */
export const finderTokens = (asins: number) => 10 + Math.ceil(asins / 100);
/** Sizing a leaf: one finder page of up to 50 ASINs. */
export const SIZING_TOKENS = finderTokens(SIZING_PAGE);
/** A detail fetch: 1 token an ASIN, plus up to 1 for its rating and review count. */
export const DETAIL_TOKENS_PER_ASIN = 2;
/** Listing a root's category tree: 1 token per 10 categories, at most this many categories a root. */
export const TREE_MAX_CATEGORIES = 400;

/** Spare tokens a hunt leaves in the balance: it won't start if its estimate eats into these. */
export const TOKEN_RESERVE = 100;

export interface HuntEstimate {
  /** Listing the category tree (0 when cached). */
  tree: number;
  /** Stage 1: leaves to size (not sized in the last 7 days under these filters), × 11. */
  sizing: number;
  leavesToSize: number;
  /** Stage 2: N leaves × ASINs per leaf, × ~2, less any detail fetched in the last 7 days. */
  detail: number;
  total: number;
}

export function huntEstimate(x: { rootsWithoutTree: number; leavesToSize: number; detailLeaves: number; perLeaf: number; cachedAsins?: number }): HuntEstimate {
  const tree = x.rootsWithoutTree * Math.ceil(TREE_MAX_CATEGORIES / 10);
  const sizing = x.leavesToSize * SIZING_TOKENS;
  const detail = Math.max(0, x.detailLeaves * x.perLeaf - (x.cachedAsins ?? 0)) * DETAIL_TOKENS_PER_ASIN;
  return { tree, sizing, leavesToSize: x.leavesToSize, detail, total: tree + sizing + detail };
}

/** The most leaves to detail that fits the balance (less the reserve); 0 when even sizing doesn't fit. */
export function fittingDetailLeaves(e: HuntEstimate, perLeaf: number, balance: number): number {
  const room = balance - TOKEN_RESERVE - e.tree - e.sizing;
  return room <= 0 ? 0 : Math.floor(room / (perLeaf * DETAIL_TOKENS_PER_ASIN));
}

/** The filters a leaf's finder count depends on, as a key: a count is reused only under the same ones. */
export function filtersKey(f: NicheHuntFilters): string {
  const k = [f.priceMin, f.priceMax, f.ratingMin, f.ratingMax, f.maxRank90, f.noAmazon ? 1 : 0, f.maxWeightG, f.smallParcel ? 1 : 0, f.minListedMonths, f.excludeAmazonBrands ? 1 : 0];
  return k.join("|");
}

/* ===================== niche names ===================== */

const COLOURS = "black white grey gray silver gold rose red blue navy green pink purple yellow orange brown beige cream clear transparent natural wood wooden multicolour multicolor multi assorted".split(" ");
const MARKETING = ("premium upgraded upgrade new improved best quality professional pro heavy duty strong durable portable reusable eco friendly ultimate deluxe luxury original genuine " +
  "perfect easy simple smart mini large small medium big extra xl xxl xs size sizes adjustable expandable foldable collapsible non slip anti stainless steel bpa free safe " +
  "set pack piece pieces pcs pc kit bundle count lot gift ideal home kitchen office uk").split(" ");
const STOP = "a an and or the of for with to in on by from at as is it this that your you our my men women mens womens kids baby adults adult".split(" ");
const DROP = new Set([...COLOURS, ...MARKETING, ...STOP]);

/** British spelling and singular, so "Cutlery Trays" and "cutlery tray" group together. */
function normWord(w: string): string {
  let x = w.replace(/izer(s?)$/, "iser$1").replace(/ization$/, "isation").replace(/color/, "colour");
  if (x.length > 4 && /(ches|shes|sses|xes)$/.test(x)) x = x.slice(0, -2);
  else if (x.length > 3 && /ies$/.test(x)) x = `${x.slice(0, -3)}y`;
  else if (x.length > 3 && /[^s]s$/.test(x)) x = x.slice(0, -1);
  return x;
}

/**
 * A niche from a title: the first clause (before "," " - " "|" "(" ":", and before "for" / "with"), without the brand, sizes,
 * pack counts, colours and marketing words, kept to its last three words: the product noun phrase.
 * "Kitsure Silverware Organizer, Expandable…" → "silverware organiser". The key is its last two
 * words, so "bamboo cutlery tray" and "wooden cutlery tray" are one niche.
 */
export function nicheOfTitle(title: string | null | undefined, brand?: string | null): { key: string; name: string } | null {
  if (!title) return null;
  // The product is named before the first separator, and before what it's "for" or comes "with".
  let t = title.toLowerCase().split(/\s[-–|]\s|[,(|:;]/)[0].split(/\s(?:for|with|compatible|suitable|fits?|to fit)\s/)[0];
  for (const b of [brand, ...(brand ? brand.split(/\s+/) : [])]) {
    if (b && b.length > 1) t = t.replace(new RegExp(`\\b${b.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), " ");
  }
  const words = t
    // A number and the word it counts or measures ("5 slots", "2 pack", "30cm", "3-tier") describe the variant.
    .replace(/\d+(\.\d+)?\s*-?\s*[a-z]*\b/g, " ")
    .replace(/[^a-z\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((w) => w.length > 1 && !DROP.has(w))
    .map(normWord)
    .filter((w) => !DROP.has(w));
  if (!words.length) return null;
  const phrase = words.slice(-3);
  return { key: phrase.slice(-2).join(" "), name: phrase.join(" ") };
}

/* ===================== qualifying and grouping ===================== */

/**
 * An ASIN's niche: its leaf browse category (Amazon's own grouping of like products: "Cutlery
 * Trays", "Bath Mats"), named in lower case; else a phrase from its title. Titles are often long
 * run-ons ("Barrier Mat Non Slip Door Mat Rubber Mats Floor Mats Kitchen Rug"), so the category is
 * the better key; names can be corrected by hand.
 */
export function nicheOfAsin(s: Pick<HuntAsin, "title" | "brand" | "leaf_category" | "leaf_category_id">): { key: string; name: string } | null {
  if (s.leaf_category) return { key: s.leaf_category_id ? `cat:${s.leaf_category_id}` : `cat:${s.leaf_category.toLowerCase()}`, name: s.leaf_category.toLowerCase() };
  return nicheOfTitle(s.title, s.brand);
}

/** A hunted ASIN: its snapshot plus what the hunt needs on top. */
export interface HuntAsin extends PlAsin {
  root_category: string | null;
  /** The leaf browse category (e.g. Cutlery Trays): the niche, when Keepa has it. */
  leaf_category_id?: number | null;
  leaf_category?: string | null;
  /** Days since Amazon last held an offer (0 = now); null = never seen. */
  amazon_last_seen_days: number | null;
}

/** Why an ASIN doesn't qualify (none: it does). Reviews over the cap make it an incumbent, not a reject. */
export function disqualify(a: HuntAsin, f: NicheHuntFilters): string[] {
  const out: string[] = [];
  const price = priceOf(a);
  if (price != null && (price < f.priceMin || price > f.priceMax)) out.push(`price £${price.toFixed(2)}`);
  if (a.rating != null && (a.rating < f.ratingMin || a.rating > f.ratingMax)) out.push(`rating ${a.rating}`);
  // Demand by the app's sales rule (rank drops ÷ 3, or bought-past-month for a fast seller). A fast
  // seller (90-day average rank under 5,000) with no bought-past-month figure passes on its rank:
  // its rank drops undercount it (rank 49 showed 43 drops in 90 days).
  const sales = monthlySales(a).value ?? 0;
  const fastUncounted = isSalesFloor(a);
  if (sales < f.minRankDrops90 / 3 && !fastUncounted) out.push(`${Math.round(sales)} sales a month (${a.rank_drops_90d ?? 0} rank drops in 90 days)`);
  if (f.noAmazon && a.amazon_last_seen_days != null && a.amazon_last_seen_days <= 90) out.push("Amazon sold it in the last 90 days");
  if (a.weight != null && a.weight > f.maxWeightG) out.push(`${a.weight} g`);
  if (f.smallParcel && a.dimensions) {
    const d = [a.dimensions.l, a.dimensions.w, a.dimensions.h].sort((x, y) => y - x);
    if (d[0] > SMALL_PARCEL_CM[0] || d[1] > SMALL_PARCEL_CM[1] || d[2] > SMALL_PARCEL_CM[2]) out.push("bigger than a small parcel");
  }
  if (f.excludeAmazonBrands && isAmazonBrand(a.brand)) out.push("Amazon brand");
  return out;
}

export type Shape = "open" | "contested" | "dominated";

/** Open: nobody over 1,000 reviews. Contested: one. Dominated: two or more, or one over 5,000. */
export function shapeOf(reviews: (number | null)[]): Shape {
  const r = reviews.filter((x): x is number => x != null);
  const over1k = r.filter((x) => x > 1000).length;
  if (over1k >= 2 || r.some((x) => x > 5000)) return "dominated";
  return over1k === 1 ? "contested" : "open";
}

export interface NicheAsin {
  asin: string; qualifies: boolean; incumbent: boolean; reasons: string[]; sales: number | null;
  /** A fast seller (90-day rank under 5,000) without bought-past-month: its sales figure is a floor. */
  salesFloor: boolean;
  snap: HuntAsin;
}

const isSalesFloor = (a: HuntAsin) => fastVelocity({ avgRank90d: a.avg_rank_90d }) && a.bought_past_month == null;

export interface Niche {
  key: string;
  name: string;
  /** Qualifying ASINs. */
  count: number;
  medianPrice: number | null;
  medianReviews: number | null;
  medianRating: number | null;
  /** Monthly sales of the qualifying ASINs, summed (the wholesale rule per ASIN). */
  salesSum: number;
  /** Qualifying ASINs whose sales are a floor (fast sellers, rank drops undercount): salesSum is "at least". */
  salesFloorCount: number;
  /** The most reviews on any of its ASINs fetched, qualifying or not: the incumbent to beat. */
  maxReviews: number | null;
  shape: Shape;
  /** The commonest root category among its ASINs. */
  rootCategory: string | null;
  /** Qualifying first, by sales; then the incumbents. */
  asins: NicheAsin[];
}

/**
 * ASINs into niches. A niche is shown with at least `minAsins` qualifying ASINs; incumbents (over
 * the review cap, otherwise fine) count for its shape and max reviews, not its count or medians.
 */
export function groupNiches(snaps: HuntAsin[], f: NicheHuntFilters, dismissed: Set<string> = new Set()): Niche[] {
  const groups = new Map<string, { names: Map<string, number>; rows: NicheAsin[] }>();
  for (const s of snaps) {
    const n = nicheOfAsin(s);
    if (!n || dismissed.has(n.key)) continue;
    const reasons = disqualify(s, f);
    const incumbent = !reasons.length && (s.review_count ?? 0) > f.maxReviews;
    const row: NicheAsin = { asin: s.asin, qualifies: !reasons.length && !incumbent, incumbent, reasons, sales: monthlySales(s).value, salesFloor: isSalesFloor(s), snap: s };
    const g = groups.get(n.key) ?? { names: new Map<string, number>(), rows: [] as NicheAsin[] };
    g.names.set(n.name, (g.names.get(n.name) ?? 0) + 1);
    g.rows.push(row);
    groups.set(n.key, g);
  }
  const out: Niche[] = [];
  for (const [key, g] of groups) {
    const q = g.rows.filter((r) => r.qualifies);
    if (q.length < f.minAsins) continue;
    const counted = g.rows.filter((r) => r.qualifies || r.incumbent);
    const cats = new Map<string, number>();
    for (const r of q) if (r.snap.root_category) cats.set(r.snap.root_category, (cats.get(r.snap.root_category) ?? 0) + 1);
    const reviews = counted.map((r) => r.snap.review_count);
    const known = reviews.filter((x): x is number => x != null);
    out.push({
      key,
      name: [...g.names].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0][0],
      count: q.length,
      medianPrice: median(q.map((r) => priceOf(r.snap)).filter((x): x is number => x != null)),
      medianReviews: median(q.map((r) => r.snap.review_count).filter((x): x is number => x != null)),
      medianRating: median(q.map((r) => r.snap.rating).filter((x): x is number => x != null)),
      salesSum: Math.round(q.reduce((a, r) => a + (r.sales ?? 0), 0)),
      salesFloorCount: q.filter((r) => r.salesFloor).length,
      maxReviews: known.length ? Math.max(...known) : null,
      shape: shapeOf(reviews),
      rootCategory: [...cats].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      asins: [...q.sort((a, b) => (b.sales ?? 0) - (a.sales ?? 0)), ...g.rows.filter((r) => r.incumbent)],
    });
  }
  return out.sort((a, b) => b.salesSum - a.salesSum);
}

/** Opportunity Explorer opened on a search for the niche, to capture Gate 3 next. */
export const opportunityExplorerUrl = (name: string) =>
  `https://sellercentral.amazon.co.uk/opportunity-explorer?search=${encodeURIComponent(name)}`;
