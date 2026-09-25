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
  /** Largest share of the year any single seller held the Buy Box, %. */
  topSellerBbSharePct: number | null;
  /** Largest one-day percentage jump in review count. */
  reviewJumpPct: number | null;
  /** True when this ASIN is a variation child whose history starts after its parent's. */
  youngerThanParent: boolean | null;
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
  summary: KeepaSummary;
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
  kind: "asin" | "code";
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

export type OnKeepaResponse = (meta: KeepaResponseMeta) => void | Promise<void>;

export interface KeepaClient {
  /** False for the stub: gates that need Keepa report "not checked" instead of failing. */
  readonly available: boolean;
  readonly name: string;
  lookupByEans(eans: string[], onResponse?: OnKeepaResponse): Promise<KeepaLookup>;
  lookupByAsins(asins: string[], onResponse?: OnKeepaResponse): Promise<KeepaLookup>;
}
