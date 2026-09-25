/** A time series point: [unix ms, value]. */
export type Point = [number, number];

/** What the screening gates and win score need from a year of Keepa history. */
export interface KeepaSummary {
  historyDays: number | null;
  rankNow: number | null;
  rankDrops30d: number | null;
  /** Amazon's "bought in past month" figure (a floor: 200 means "200+"), when Amazon shows it. */
  monthlySold: number | null;
  avgRank90d: number | null;
  /** % change in 90-day average rank, now vs a year ago. Negative = improving. */
  rankTrendPct12m: number | null;
  currentBuyBox: number | null;
  medianBuyBox12m: number | null;
  /** Buy Box least-squares slope as % of the 12-month median per year. Negative = falling. */
  bbSlopePctYr: number | null;
  /** Coefficient of variation of the Buy Box over 12 months, %. */
  bbVolatilityPct: number | null;
  offersNow: number | null;
  offers90dAgo: number | null;
  fbaOffers: number | null;
  /** Days since Amazon last held an offer; null when never seen in the history. */
  amazonLastSeenDays: number | null;
  /** When Amazon last held an offer (now, while it does); null when never seen. */
  amazonLastSeenAt?: string | null;
  /** Keepa's top-level category (the one the sales rank is in). */
  rootCategory?: string | null;
  /** Largest share of the year any single seller held the Buy Box, %. */
  topSellerBbSharePct: number | null;
  /** Largest one-day percentage jump in review count. */
  reviewJumpPct: number | null;
  /** True when this ASIN is a variation child whose history starts after its parent's. */
  youngerThanParent: boolean | null;
  // Optional: absent on snapshots stored before these were kept.
  /** Keepa's own count of rank drops in 30 days (stats.salesRankDrops30). */
  keepaRankDrops30?: number | null;
  /** The sellers who held the Buy Box longest over 365 days, most first. */
  topSellers?: { sellerId: string; sharePct: number }[];
  /** Who holds the Buy Box at the end of the history (Buy Box data only). */
  buyBoxSellerNow?: string | null;
  /** Keepa's FBA pick-and-pack fee estimate, GBP ex-VAT. */
  fbaFee?: number | null;
  referralFeePct?: number | null;
  /** Package dimensions (cm) and weight (g) as Keepa has them. */
  packageDims?: { l: number; w: number; h: number } | null;
  packageWeightG?: number | null;
  /** Size of the variation family. */
  variationCount?: number | null;
  /**
   * False when fetched without Buy Box data (stage 1, 1 token): price figures come from the
   * lowest new offer and there's no Buy Box seller history. Absent on older snapshots (which
   * always had it).
   */
  buyBoxFetched?: boolean;
  // History for dormant listings (no offer now); see summarize.dormancy.
  lastBuyBox12m?: number | null;
  lastBuyBoxAt?: string | null;
  rankDrops12m?: number | null;
  avgRank12m?: number | null;
  lastOfferDaysAgo?: number | null;
}

export interface KeepaProduct {
  asin: string;
  eans: string[];
  title: string | null;
  brand: string | null;
  category: string | null;
  dimsCm: { l: number; w: number; h: number } | null;
  weightG: number | null;
  parentAsin: string | null;
  variationCount: number | null;
  /** Main image on Amazon's CDN, from Keepa's imagesCSV. */
  imageUrl: string | null;
  summary: KeepaSummary;
  /** Buy Box holder changes: [unix ms, seller id]. */
  buyBoxSellers: [number, string][];
  series: {
    rank: Point[];
    buyBox: Point[];
    newPrice: Point[];
    offerCount: Point[];
    amazon: Point[];
    reviewCount: Point[];
  };
}

/** What Keepa said about one request: its own token figures, logged and recorded as they arrive. */
export interface KeepaResponseMeta {
  kind: "asin" | "code" | "seller" | "finder" | "category";
  /** The request included Buy Box data (buybox=1): 3 tokens a product instead of 1. */
  buyBox?: boolean;
  /** ASINs or codes asked for. */
  count: number;
  status: number;
  tokensConsumed: number;
  tokensLeft: number | null;
  refillInMs: number | null;
  processingTimeInMs: number | null;
  products: number;
}

export interface KeepaLookup {
  /** EAN → every ASIN it resolves to (code lookups). */
  byEan: Map<string, KeepaProduct[]>;
  /** ASIN → product (ASIN lookups). */
  byAsin: Map<string, KeepaProduct>;
  /** Sum of Keepa's tokensConsumed across the requests. */
  tokensUsed: number;
  /** Keepa's tokensLeft after the last request. */
  tokensLeft: number | null;
  requests: KeepaResponseMeta[];
  /** Set when Keepa refused for lack of tokens; the rest weren't asked. */
  exhausted?: { refillInMs: number | null; skipped: number };
}

/** A Keepa seller profile (1 token). */
export interface SellerProfile {
  sellerId: string;
  name: string | null;
  /** Positive rating over the last 12 months, %. */
  ratingPct: number | null;
  ratingCount: number | null;
  /** Listings on the storefront. */
  storefrontSize: number | null;
  /** Largest brands on the storefront, by listing count. */
  brands: { brand: string; count: number }[];
}

/** A seller's storefront (Keepa seller with storefront=1: 10 tokens). */
export interface Storefront {
  profile: SellerProfile;
  /** Registered business name, when Keepa has it. */
  businessName: string | null;
  /** Share of its listings' Buy Box it holds (new), %. */
  buyBoxOwnershipPct: number | null;
  /** The storefront's ASINs, most recently seen first. */
  asins: string[];
  tokensUsed: number;
}

export interface SellerLookup {
  profiles: Map<string, SellerProfile>;
  tokensUsed: number;
  exhausted?: { refillInMs: number | null; skipped: number };
}

/** Keepa's token bucket, from its free /token endpoint. */
export interface KeepaTokens {
  tokensLeft: number;
  /** Until the next refill, ms. */
  refillInMs: number;
  /** Tokens added per minute. */
  refillRate: number;
}

export type OnKeepaResponse = (meta: KeepaResponseMeta) => void | Promise<void>;

export interface KeepaClient {
  /** False for the stub: gates that need Keepa report "not checked" instead of failing. */
  readonly available: boolean;
  readonly name: string;
  /** buyBox: include Buy Box price and seller history (3 tokens a product; 1 without). */
  lookupByEans(eans: string[], onResponse?: OnKeepaResponse, opts?: { buyBox?: boolean }): Promise<KeepaLookup>;
  lookupByAsins(asins: string[], onResponse?: OnKeepaResponse, opts?: { buyBox?: boolean }): Promise<KeepaLookup>;
  lookupSellers(sellerIds: string[], onResponse?: OnKeepaResponse): Promise<SellerLookup>;
  /** A seller's storefront ASIN list and profile (10 tokens); null when Keepa doesn't know the seller. */
  storefront?(sellerId: string, onResponse?: OnKeepaResponse): Promise<Storefront | null>;
  /** Current token balance (free). null when unknown. */
  tokenStatus(): Promise<KeepaTokens | null>;
}
