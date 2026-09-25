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
  /** Pack attributes: item_package_quantity and number_of_items, where given. */
  pack?: { itemPackageQuantity: number | null; numberOfItems: number | null };
  /** What Amazon's attributes say about dangerous goods and heat (empty when nothing). */
  dg?: AmazonDg | null;
  /** Largest MAIN image on Amazon's CDN, or null. */
  imageUrl: string | null;
}

/**
 * Amazon's own dangerous-goods data for a listing: the `hazmat` attribute (UN number,
 * shipping name, transport class), GHS classes, the declared regulations and
 * is_heat_sensitive. Only what Amazon actually states is kept.
 */
export interface AmazonDg {
  /** A regulated transport entry: e.g. { un: "UN1950", name: "AEROSOLS", class: "2.1" }. */
  hazmat: { un: string | null; name: string | null; class: string | null } | null;
  /** GHS hazard classes, less Amazon's "no label" placeholder. */
  ghs: string[];
  /** supplier_declared_dg_hz_regulation values other than not_applicable / unknown. */
  declared: string[];
  /** is_heat_sensitive: true (meltable). */
  heatSensitive: boolean;
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

/** Who's selling a listing now, from getItemOffers (new condition). */
export interface ListingOffers {
  asin: string;
  /** Amazon itself holds an offer. */
  amazon: boolean;
  /** Offers fulfilled by Amazon (FBA sellers, Amazon's own offer included when it has one). */
  fbaOffers: number | null;
  totalOffers: number | null;
  /** Landed Buy Box price, GBP. */
  buyBox: number | null;
  /** The seller whose offer wins the Buy Box, when there is one. */
  buyBoxSellerId?: string | null;
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
