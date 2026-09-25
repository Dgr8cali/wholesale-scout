export interface SpApiConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  marketplaceId: string;
  /** Merchant token; needed only for getListingsRestrictions. */
  sellerId: string | null;
  endpoint: string;
}

export interface CatalogMatch {
  asin: string;
  eans: string[];
  title: string | null;
  brand: string | null;
  /** Website display group title, e.g. "Health & Personal Care". */
  category: string | null;
  /** Package dimensions in cm, when Amazon publishes them. */
  dimsCm: { l: number; w: number; h: number } | null;
  weightG: number | null;
  salesRank: number | null;
  parentAsin: string | null;
  variationCount: number | null;
  /** Declared dangerous-goods regulations, e.g. ["ghs", "transportation"]. */
  hazmat: string[];
  batteries: boolean;
  /** Largest MAIN image on Amazon's CDN, or null. */
  imageUrl: string | null;
}

export interface FeesEstimate {
  asin: string;
  ok: boolean;
  /** Ex-tax amounts in GBP. */
  referral: number | null;
  /** FBA fulfilment plus any per-item or closing fees. */
  fba: number | null;
  total: number | null;
  error?: string;
  /** Amazon's side failed (Status "ServerError"); worth asking again. */
  retryable?: boolean;
}

export type RestrictionStatus = "open" | "approval_required" | "blocked" | "unknown";

/** A link Amazon attaches to a restriction reason, e.g. "Request Approval via Seller Central." */
export interface RestrictionLink {
  resource: string;
  verb: string;
  title: string | null;
  type: string | null;
}

export interface Restriction {
  asin: string;
  status: RestrictionStatus;
  reasons: { code: string; message: string; links: RestrictionLink[] }[];
}

export interface CompetitivePrice {
  asin: string;
  /** Landed Buy Box price for new condition, GBP. */
  buyBox: number | null;
  newOffers: number | null;
  salesRank: number | null;
}

/** One catalog query made while resolving an EAN. */
export interface LookupAttempt {
  identifiersType: "EAN" | "UPC" | "GTIN";
  /** The code sent, or "batch of N" for the first, batched pass. */
  code: string;
  /** Items Amazon returned that were attributed to this EAN. */
  items: number;
  /** Amazon's numberOfResults for the query. */
  total?: number;
  error?: string;
}

/** How an EAN was resolved, kept on the result so a miss can be told from an API failure. */
export interface LookupTrace {
  outcome: "matched" | "search_miss" | "api_error";
  attempts: LookupAttempt[];
  /** Start of the last raw response, for misses and errors. */
  raw?: string;
}
