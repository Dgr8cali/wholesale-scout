/**
 * Niche Hunt: Keepa's Product Finder asked for products that already pass Gatekeeper's Gate 0 and
 * Gate 1, grouped by leaf browse category (each leaf is a niche). Pure: the page and the server
 * share it. Two modes:
 *  - Direct (the default): one finder query per root category with every qualifying threshold Keepa
 *    can apply server-side, sorted by rank drops, a few pages of 50; then detail for those ASINs,
 *    grouped by each product's leaf. Cheap: the finder does the filtering.
 *  - Leaf: size each leaf with one finder call (wide filters), then detail the most promising.
 *
 * Hunt wide, qualify strict. The finder's filters are wide (what Keepa searches): Gatekeeper's pass
 * thresholds as hard finder filters compound, and a first real hunt found 7 qualifying ASINs in 148.
 * The qualifying thresholds are strict (Gatekeeper's pass band) and run on each product's detail; a
 * product failing only Gatekeeper's warn band, or missing its weight or size, is a *near miss*.
 * Products over the review cap stay in their niche as the incumbents to beat, which is what the shape
 * badge and "max reviews" read.
 */
import { median } from "../format";
import { AMAZON_BRANDS, isAmazonBrand } from "./amazon-brands";
import { fastVelocity } from "../screening/sales";
import { monthlySales, priceOf, type PlAsin } from "./fill";

export type HuntMode = "direct" | "leaf";

export interface NicheHuntFilters {
  /** Direct (one filtered query per root) or leaf (size each leaf, then detail). */
  mode: HuntMode;
  /** Direct: finder pages of 50 per root, best rank drops first. */
  pagesPerRoot: number;
  /** Direct: niches (3+ qualifying) to check for incumbents afterwards, ~31 tokens each. */
  incumbentNiches: number;
  /* Finder filters (wide): what Keepa searches. */
  finderPriceMin: number;
  finderPriceMax: number;
  finderRatingMin: number;
  finderRatingMax: number;
  /* Qualifying thresholds (strict): what counts as page-one material. */
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
  /** No Amazon offer now (finder), nor in the last 90 days (qualifying). */
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

/**
 * Gatekeeper's warn band (Gate 0's price £15–40 and weight 700 g, Gate 1's rating 3.6–4.5): a product
 * failing only these, or missing its weight or size, is a near miss rather than a fail.
 */
export const NEAR_MISS = { priceMin: 15, priceMax: 40, ratingMin: 3.6, ratingMax: 4.5, weightG: 700 };
export const LIMITS = { leavesCap: 200, detailLeaves: 50, perLeaf: 50, pagesPerRoot: 10, incumbentNiches: 30 };
/** Keepa's smallest finder page: sizing a leaf returns up to this many ASINs, best-selling first. */
export const SIZING_PAGE = 50;

export function defaultFilters(categories: { id: number; name: string }[]): NicheHuntFilters {
  return {
    mode: "direct", pagesPerRoot: 4, incumbentNiches: 10,
    finderPriceMin: 14, finderPriceMax: 45, finderRatingMin: 3.5, finderRatingMax: 4.7, maxRank90: 100_000,
    // Qualifying on Gatekeeper's warn band (£15–40, 3.6–4.5): a hunt finds; the scorecard judges on the pass band.
    priceMin: NEAR_MISS.priceMin, priceMax: NEAR_MISS.priceMax, maxReviews: 500, ratingMin: NEAR_MISS.ratingMin, ratingMax: NEAR_MISS.ratingMax, minRankDrops90: 300, noAmazon: true,
    maxWeightG: 500, smallParcel: true, minListedMonths: 6, excludeAmazonBrands: true, minAsins: 3,
    leavesCap: 120, detailLeaves: 15, perLeaf: 12, minLeafMatches: 5,
    categories: categories.filter((c) => DEFAULT_CATEGORY_NAMES.includes(c.name)).map((c) => c.id),
  };
}

/** Filters as sent by the page, checked. */
export function validFilters(x: Partial<NicheHuntFilters>): NicheHuntFilters | string {
  const n = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const f: NicheHuntFilters = {
    mode: x.mode === "leaf" ? "leaf" : "direct", pagesPerRoot: Math.round(n(x.pagesPerRoot, 4)), incumbentNiches: Math.round(n(x.incumbentNiches, 10)),
    finderPriceMin: n(x.finderPriceMin, 14), finderPriceMax: n(x.finderPriceMax, 45), finderRatingMin: n(x.finderRatingMin, 3.5), finderRatingMax: n(x.finderRatingMax, 4.7),
    priceMin: n(x.priceMin, NEAR_MISS.priceMin), priceMax: n(x.priceMax, NEAR_MISS.priceMax), maxReviews: Math.round(n(x.maxReviews, 500)),
    ratingMin: n(x.ratingMin, NEAR_MISS.ratingMin), ratingMax: n(x.ratingMax, NEAR_MISS.ratingMax), minRankDrops90: Math.round(n(x.minRankDrops90, 300)), maxRank90: Math.round(n(x.maxRank90, 100_000)),
    noAmazon: x.noAmazon !== false, maxWeightG: Math.round(n(x.maxWeightG, 500)), smallParcel: x.smallParcel !== false,
    categories: Array.isArray(x.categories) ? x.categories.map(Number).filter(Number.isFinite).slice(0, 50) : [],
    minListedMonths: n(x.minListedMonths, 6), excludeAmazonBrands: x.excludeAmazonBrands !== false,
    minAsins: Math.max(1, Math.round(n(x.minAsins, 3))),
    leavesCap: Math.round(n(x.leavesCap, 120)), detailLeaves: Math.round(n(x.detailLeaves, 15)), perLeaf: Math.round(n(x.perLeaf, 12)),
    minLeafMatches: Math.max(1, Math.round(n(x.minLeafMatches, 5))),
    ...(Array.isArray(x.leafIds) && x.leafIds.length ? { leafIds: x.leafIds.map(Number).filter(Number.isFinite).slice(0, LIMITS.leavesCap) } : {}),
  };
  if (!(f.finderPriceMin >= 0) || !(f.finderPriceMax > f.finderPriceMin)) return "The finder's price band needs a min under the max";
  if (!(f.finderRatingMin >= 0 && f.finderRatingMax <= 5 && f.finderRatingMax >= f.finderRatingMin)) return "The finder's ratings run 0–5, min at or under max";
  if (!(f.priceMin >= 0) || !(f.priceMax > f.priceMin)) return "The price band needs a min under the max";
  if (!(f.ratingMin >= 0 && f.ratingMax <= 5 && f.ratingMax >= f.ratingMin)) return "Ratings run 0–5, min at or under max";
  if (!f.categories.length) return "Pick at least one category";
  if (!(f.maxRank90 >= 1)) return "The rank ceiling must be at least 1";
  if (!(f.pagesPerRoot >= 1 && f.pagesPerRoot <= LIMITS.pagesPerRoot)) return `Pages per root must be 1–${LIMITS.pagesPerRoot}`;
  if (!(f.incumbentNiches >= 0 && f.incumbentNiches <= LIMITS.incumbentNiches)) return `Niches to check for incumbents must be 0–${LIMITS.incumbentNiches}`;
  if (!(f.leavesCap >= 1 && f.leavesCap <= LIMITS.leavesCap)) return `Leaves to size must be 1–${LIMITS.leavesCap}`;
  if (!(f.detailLeaves >= 1 && f.detailLeaves <= LIMITS.detailLeaves)) return `Leaves to detail must be 1–${LIMITS.detailLeaves}`;
  if (!(f.perLeaf >= 1 && f.perLeaf <= LIMITS.perLeaf)) return `ASINs per leaf must be 1–${LIMITS.perLeaf}`;
  return f;
}

const keepaMinutes = (ms: number) => Math.floor(ms / 60_000) - 21_564_000;

/**
 * The Product Finder query for one leaf, with the wide finder filters: products listed directly in
 * the leaf, best-selling first (90-day rank), one per variation family, Keepa's smallest page (the
 * match count is what stage 1 is after; the page is kept for stage 2). No weight or size filter:
 * Keepa often lacks them, and the finder drops a product it can't measure.
 */
export function finderSelection(f: NicheHuntFilters, leafId: number, now = Date.now()): Record<string, unknown> {
  return {
    categories_include: [leafId],
    current_BUY_BOX_SHIPPING_gte: Math.round(f.finderPriceMin * 100),
    current_BUY_BOX_SHIPPING_lte: Math.round(f.finderPriceMax * 100),
    current_RATING_gte: Math.round(f.finderRatingMin * 10),
    current_RATING_lte: Math.round(f.finderRatingMax * 10),
    avg90_SALES_gte: 1,
    avg90_SALES_lte: f.maxRank90,
    ...(f.noAmazon ? { availabilityAmazon: [-1] } : {}),
    ...(f.minListedMonths > 0 ? { trackingSince_lte: keepaMinutes(now - f.minListedMonths * 30.44 * 86_400_000) } : {}),
    ...(f.excludeAmazonBrands ? { brand: AMAZON_BRANDS.map((b) => `✜${b}`) } : {}),
    productType: [0],
    singleVariation: true,
    sort: [["avg90_SALES", "asc"]],
    perPage: SIZING_PAGE,
    page: 0,
  };
}

/**
 * Direct mode's query for one root, every qualifying threshold Keepa can apply server-side (checked
 * against the live API, Oct 2026):
 *  - the category a product ranks in (salesRankReference: the root of its sales rank);
 *  - Buy Box price and rating in the qualifying band (£15–40, 3.6–4.5 by default);
 *  - reviews at most the cap; no Amazon offer; tracked by Keepa for the minimum months; no Amazon brand;
 *  - sales: monthlySold (Amazon's "bought in past month") at least minRankDrops90 ÷ 3, the monthly
 *    sales the qualifying check asks for. salesRankDrops90_gte exists but undercounts: no product in
 *    Pet Supplies under these filters had 300+ (81 had 100+), so it isn't used as a floor;
 *  - sorted by 90-day rank drops, most first.
 *  - package weight at most 700 g (the warn band; 500 g is checked on the detail). Keepa's weight
 *    filter leaves out products whose weight it doesn't know: WEIGHT_FILTER_UNKNOWN measured it.
 */
export function directSelection(f: NicheHuntFilters, rootId: number, now = Date.now()): Record<string, unknown> {
  return {
    salesRankReference: [rootId],
    current_BUY_BOX_SHIPPING_gte: Math.round(f.priceMin * 100),
    current_BUY_BOX_SHIPPING_lte: Math.round(f.priceMax * 100),
    current_RATING_gte: Math.round(f.ratingMin * 10),
    current_RATING_lte: Math.round(f.ratingMax * 10),
    current_COUNT_REVIEWS_lte: f.maxReviews,
    packageWeight_lte: NEAR_MISS.weightG,
    monthlySold_gte: Math.max(1, Math.ceil(f.minRankDrops90 / 3)),
    ...(f.noAmazon ? { availabilityAmazon: [-1] } : {}),
    ...(f.minListedMonths > 0 ? { trackingSince_lte: keepaMinutes(now - f.minListedMonths * 30.44 * 86_400_000) } : {}),
    ...(f.excludeAmazonBrands ? { brand: AMAZON_BRANDS.map((b) => `✜${b}`) } : {}),
    productType: [0],
    singleVariation: true,
    sort: [["salesRankDrops90", "desc"]],
  };
}

/**
 * What Keepa's weight filter leaves out: products with no package weight. Measured on Pet Supplies
 * under the direct-mode filters (Oct 2026): 28,582 matched without it, 21,973 at ≤ 700 g and 6,484
 * over, so 125 had no weight.
 */
export const WEIGHT_FILTER_UNKNOWN = { unknown: 125, of: 28_582 };

/** Incumbents taken per niche: the leaf's best sellers over the review cap. */
export const INCUMBENT_TAKE = 10;
/**
 * The incumbent check for a niche (direct mode caps reviews, so it finds none): the leaf's best
 * sellers by rank with more reviews than the cap, any price. The finder returns ASINs only, so the
 * 10 taken are detailed for their review counts.
 */
export function incumbentSelection(leafId: number, maxReviews: number): Record<string, unknown> {
  return {
    categories_include: [leafId],
    current_COUNT_REVIEWS_gte: maxReviews + 1,
    current_SALES_gte: 1,
    productType: [0],
    singleVariation: true,
    sort: [["current_SALES", "asc"]],
  };
}

/** Keepa's price for a Product Finder page: 10 tokens, plus 1 per 100 ASINs returned (as the wholesale Hunt). */
export const finderTokens = (asins: number) => 10 + Math.ceil(asins / 100);
/** Sizing a leaf: one finder page of up to 50 ASINs (Keepa charged 11 for a full page of 50). */
export const SIZING_TOKENS = finderTokens(SIZING_PAGE);
/** A direct-mode page: 50 ASINs, 11 tokens. */
export const DIRECT_PAGE = SIZING_PAGE;
export const DIRECT_PAGE_TOKENS = finderTokens(DIRECT_PAGE);
/** A hunt stops starting Keepa calls once it has spent its estimate plus this share. */
export const SPEND_CAP_OVER = 0.1;
export const spendCap = (estimate: number) => Math.ceil(estimate * (1 + SPEND_CAP_OVER));
/** A detail fetch: 1 token an ASIN, plus up to 1 for its rating and review count. */
export const DETAIL_TOKENS_PER_ASIN = 2;
/** A niche's incumbent check: one finder page (Keepa's smallest is 50) and up to 10 details. */
export const INCUMBENT_TOKENS = SIZING_TOKENS + INCUMBENT_TAKE * DETAIL_TOKENS_PER_ASIN;
/** Listing a root's category tree: 1 token per 10 categories, at most this many categories a root. */
export const TREE_MAX_CATEGORIES = 400;

/** Spare tokens a hunt leaves in the balance: it won't start if its estimate eats into these. */
export const TOKEN_RESERVE = 100;

export interface HuntEstimate {
  mode?: HuntMode;
  /** Direct: finder pages (roots × pages) and their tokens; incumbent checks (niches × ~31). */
  finderPages?: number; finder?: number; incumbentNiches?: number; incumbents?: number;
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

/**
 * Direct mode: roots × pages finder pages at 11 tokens, and detail for up to 50 ASINs a page at ~2
 * tokens (less the ASINs with a snapshot under 7 days old, when known). No category tree.
 */
export function directEstimate(x: { roots: number; pages: number; cachedAsins?: number; incumbentNiches?: number }): HuntEstimate {
  const finderPages = x.roots * x.pages;
  const finder = finderPages * DIRECT_PAGE_TOKENS;
  const detail = Math.max(0, finderPages * DIRECT_PAGE - (x.cachedAsins ?? 0)) * DETAIL_TOKENS_PER_ASIN;
  const incumbentNiches = x.incumbentNiches ?? 0;
  const incumbents = incumbentNiches * INCUMBENT_TOKENS;
  return { mode: "direct", finderPages, finder, incumbentNiches, incumbents, tree: 0, sizing: 0, leavesToSize: 0, detail, total: finder + detail + incumbents };
}

/** The most leaves to detail that fits the balance (less the reserve); 0 when even sizing doesn't fit. */
export function fittingDetailLeaves(e: HuntEstimate, perLeaf: number, balance: number): number {
  const room = balance - TOKEN_RESERVE - e.tree - e.sizing;
  return room <= 0 ? 0 : Math.floor(room / (perLeaf * DETAIL_TOKENS_PER_ASIN));
}

/** The finder filters a leaf's count depends on, as a key: a count is reused only under the same ones. */
export function filtersKey(f: NicheHuntFilters): string {
  const k = ["v2", f.finderPriceMin, f.finderPriceMax, f.finderRatingMin, f.finderRatingMax, f.maxRank90, f.noAmazon ? 1 : 0, f.minListedMonths, f.excludeAmazonBrands ? 1 : 0];
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

/** One qualifying check, in the order the "Why so few?" funnel applies them. */
interface QualCheck {
  key: string;
  label: (f: NicheHuntFilters) => string;
  /** "pass", "near" (fails only Gatekeeper's warn band, or size missing), "unknown" (passes, but Keepa lacks the figure) or "fail". */
  test: (a: HuntAsin, f: NicheHuntFilters) => { r: "pass" | "near" | "unknown" | "fail"; why?: string };
}

const inBand = (v: number, lo: number, hi: number) => v >= lo && v <= hi;

export const QUAL_CHECKS: QualCheck[] = [
  { key: "price", label: (f) => `price £${f.priceMin}–${f.priceMax}`, test: (a, f) => {
    const p = priceOf(a);
    if (p == null) return { r: "near", why: "no price" };
    return inBand(p, f.priceMin, f.priceMax) ? { r: "pass" } : { r: inBand(p, NEAR_MISS.priceMin, NEAR_MISS.priceMax) ? "near" : "fail", why: `price £${p.toFixed(2)}` };
  } },
  { key: "rating", label: (f) => `rating ${f.ratingMin}–${f.ratingMax}`, test: (a, f) => {
    if (a.rating == null) return { r: "near", why: "no rating" };
    return inBand(a.rating, f.ratingMin, f.ratingMax) ? { r: "pass" } : { r: inBand(a.rating, NEAR_MISS.ratingMin, NEAR_MISS.ratingMax) ? "near" : "fail", why: `rating ${a.rating}` };
  } },
  // Demand by the app's sales rule (rank drops ÷ 3, or bought-past-month for a fast seller). A fast
  // seller (90-day average rank under 5,000) with no bought-past-month figure passes on its rank:
  // its rank drops undercount it (rank 49 showed 43 drops in 90 days).
  { key: "demand", label: (f) => `${Math.round(f.minRankDrops90 / 3)}+ sales a month`, test: (a, f) => {
    const sales = monthlySales(a).value ?? 0;
    return sales >= f.minRankDrops90 / 3 || isSalesFloor(a) ? { r: "pass" } : { r: "fail", why: `${Math.round(sales)} sales a month (${a.rank_drops_90d ?? 0} rank drops in 90 days)` };
  } },
  { key: "amazon", label: () => "no Amazon in 90 days", test: (a, f) =>
    f.noAmazon && a.amazon_last_seen_days != null && a.amazon_last_seen_days <= 90 ? { r: "fail", why: "Amazon sold it in the last 90 days" } : { r: "pass" } },
  { key: "brand", label: () => "not an Amazon brand", test: (a, f) => (f.excludeAmazonBrands && isAmazonBrand(a.brand) ? { r: "fail", why: "Amazon brand" } : { r: "pass" }) },
  { key: "weight", label: (f) => `${f.maxWeightG} g or less`, test: (a, f) => {
    // Unknown, not a miss: Keepa lacks many weights; the scorecard asks for it.
    if (a.weight == null) return { r: "unknown", why: "weight unknown" };
    return a.weight <= f.maxWeightG ? { r: "pass" } : { r: a.weight <= NEAR_MISS.weightG ? "near" : "fail", why: `${a.weight} g` };
  } },
  { key: "size", label: () => "small parcel", test: (a, f) => {
    if (!f.smallParcel) return { r: "pass" };
    if (!a.dimensions) return { r: "near", why: "no size" };
    const d = [a.dimensions.l, a.dimensions.w, a.dimensions.h].sort((x, y) => y - x);
    return d[0] > SMALL_PARCEL_CM[0] || d[1] > SMALL_PARCEL_CM[1] || d[2] > SMALL_PARCEL_CM[2] ? { r: "fail", why: "bigger than a small parcel" } : { r: "pass" };
  } },
];

export type AsinStatus = "qualifies" | "near" | "incumbent" | "fails";

/**
 * A product against the qualifying thresholds: qualifies, a near miss (fails only the warn band, or
 * its data is missing), an incumbent (fine but over the review cap: the competition), or fails.
 */
export function qualify(a: HuntAsin, f: NicheHuntFilters): { status: AsinStatus; fails: string[]; near: string[]; unknown: string[] } {
  const fails: string[] = [], near: string[] = [], unknown: string[] = [];
  for (const c of QUAL_CHECKS) {
    const t = c.test(a, f);
    if (t.r === "fail") fails.push(t.why ?? c.label(f));
    else if (t.r === "near") near.push(t.why ?? c.label(f));
    else if (t.r === "unknown") unknown.push(t.why ?? c.label(f));
  }
  const status: AsinStatus = fails.length ? "fails" : (a.review_count ?? 0) > f.maxReviews ? "incumbent" : near.length ? "near" : "qualifies";
  return { status, fails, near, unknown };
}

/** Why an ASIN doesn't qualify outright (none: it qualifies), hard fails first. */
export function disqualify(a: HuntAsin, f: NicheHuntFilters): string[] {
  const q = qualify(a, f);
  return [...q.fails, ...q.near];
}

/**
 * "Why so few?": the qualifying checks applied one after another to the detailed products, with how
 * many each removed (and how many it let through as near misses), then the review cap.
 */
export function funnel(snaps: HuntAsin[], f: NicheHuntFilters): { start: number; steps: { label: string; removed: number; near: number; unknown: number }[]; incumbents: number; near: number; qualifying: number } {
  let left = snaps;
  const nearSet = new Set<string>();
  const steps = QUAL_CHECKS.map((c) => {
    const kept: HuntAsin[] = [];
    let removed = 0, near = 0, unknown = 0;
    for (const a of left) {
      const t = c.test(a, f);
      if (t.r === "fail") removed++;
      else {
        kept.push(a);
        if (t.r === "near") { near++; nearSet.add(a.asin); }
        if (t.r === "unknown") unknown++;
      }
    }
    left = kept;
    return { label: c.label(f), removed, near, unknown };
  });
  const incumbents = left.filter((a) => (a.review_count ?? 0) > f.maxReviews);
  const rest = left.filter((a) => (a.review_count ?? 0) <= f.maxReviews);
  const near = rest.filter((a) => nearSet.has(a.asin)).length;
  return { start: snaps.length, steps, incumbents: incumbents.length, near, qualifying: rest.length - near };
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
  asin: string; status: AsinStatus; qualifies: boolean; near: boolean; incumbent: boolean;
  /** Hard fails, then near-miss reasons. */
  reasons: string[];
  /** Figures Keepa lacks that don't stop it qualifying ("weight unknown"). */
  unknown: string[];
  sales: number | null;
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
  /** Near misses (fail only Gatekeeper's warn band, or data missing). */
  nearCount: number;
  incumbentCount: number;
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
 * ASINs into niches. A niche is shown with at least `minAsins` qualifying ASINs, near misses counted
 * too unless `strict`. Medians and summed sales cover qualifying and near-miss ASINs (the niche's
 * page-one material); incumbents count for its shape and max reviews only.
 */
export function groupNiches(snaps: HuntAsin[], f: NicheHuntFilters, dismissed: Set<string> = new Set(), opts: { strict?: boolean; incumbents?: Set<string> } = {}): Niche[] {
  const groups = new Map<string, { names: Map<string, number>; rows: NicheAsin[] }>();
  for (const s of snaps) {
    const n = nicheOfAsin(s);
    if (!n || dismissed.has(n.key)) continue;
    const q = qualify(s, f);
    // From an incumbent check: the competition on page one whatever else it fails (price, Amazon…).
    if (opts.incumbents?.has(s.asin) && (s.review_count ?? 0) > f.maxReviews) q.status = "incumbent";
    const row: NicheAsin = {
      asin: s.asin, status: q.status, qualifies: q.status === "qualifies", near: q.status === "near", incumbent: q.status === "incumbent",
      reasons: [...q.fails, ...q.near], unknown: q.unknown, sales: monthlySales(s).value, salesFloor: isSalesFloor(s), snap: s,
    };
    const g = groups.get(n.key) ?? { names: new Map<string, number>(), rows: [] as NicheAsin[] };
    g.names.set(n.name, (g.names.get(n.name) ?? 0) + 1);
    g.rows.push(row);
    groups.set(n.key, g);
  }
  const out: Niche[] = [];
  for (const [key, g] of groups) {
    const strictQ = g.rows.filter((r) => r.qualifies);
    const nearQ = g.rows.filter((r) => r.near);
    if (strictQ.length + (opts.strict ? 0 : nearQ.length) < f.minAsins) continue;
    // Page-one material: qualifying and near misses.
    const q = [...strictQ, ...nearQ];
    // Shape and max reviews: the page-one material (qualifying, near misses) and the incumbents.
    const counted = g.rows.filter((r) => r.qualifies || r.near || r.incumbent);
    const cats = new Map<string, number>();
    for (const r of q) if (r.snap.root_category) cats.set(r.snap.root_category, (cats.get(r.snap.root_category) ?? 0) + 1);
    const reviews = counted.map((r) => r.snap.review_count);
    const known = reviews.filter((x): x is number => x != null);
    out.push({
      key,
      name: [...g.names].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0][0],
      count: strictQ.length,
      nearCount: nearQ.length,
      incumbentCount: g.rows.filter((r) => r.incumbent).length,
      medianPrice: median(q.map((r) => priceOf(r.snap)).filter((x): x is number => x != null)),
      medianReviews: median(q.map((r) => r.snap.review_count).filter((x): x is number => x != null)),
      medianRating: median(q.map((r) => r.snap.rating).filter((x): x is number => x != null)),
      salesSum: Math.round(q.reduce((a, r) => a + (r.sales ?? 0), 0)),
      salesFloorCount: q.filter((r) => r.salesFloor).length,
      maxReviews: known.length ? Math.max(...known) : null,
      shape: shapeOf(reviews),
      rootCategory: [...cats].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      // Qualifying, then near misses, by sales; then the incumbents; then the fails.
      asins: [...strictQ, ...nearQ].sort((a, b) => Number(b.qualifies) - Number(a.qualifies) || (b.sales ?? 0) - (a.sales ?? 0))
        .concat(g.rows.filter((r) => r.incumbent), g.rows.filter((r) => r.status === "fails")),
    });
  }
  return out.sort((a, b) => b.salesSum - a.salesSum);
}

/** Opportunity Explorer opened on a search for the niche, to capture Gate 3 next. */
export const opportunityExplorerUrl = (name: string) =>
  `https://sellercentral.amazon.co.uk/opportunity-explorer?search=${encodeURIComponent(name)}`;
