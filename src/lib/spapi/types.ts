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

export interface Restriction {
  asin: string;
  status: RestrictionStatus;
  reasons: { code: string; message: string }[];
}

export interface CompetitivePrice {
  asin: string;
  /** Landed Buy Box price for new condition, GBP. */
  buyBox: number | null;
  newOffers: number | null;
  salesRank: number | null;
}
