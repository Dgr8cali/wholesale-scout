/**
 * Amazon Selling Partner API client (EU endpoint, UK marketplace).
 *
 * Auth is Login with Amazon: the refresh token is exchanged for a one-hour access
 * token, cached in memory, and sent as x-amz-access-token. SP-API no longer needs
 * AWS SigV4 signing.
 *
 * Only import this from server code: it reads secrets from process.env.
 */
import { parseCatalogItem, parseCompetitivePricing, parseFeesEstimate, parseRestrictions } from "./parse";
import type {
  CatalogMatch,
  CompetitivePrice,
  FeesEstimate,
  Restriction,
  SpApiConfig,
} from "./types";

export * from "./types";

const LWA_URL = "https://api.amazon.com/auth/o2/token";
const EU_ENDPOINT = "https://sellingpartnerapi-eu.amazon.com";

export class SpApiError extends Error {
  constructor(message: string, readonly status: number, readonly body?: unknown) {
    super(message);
  }
}

export function spApiConfigFromEnv(env: NodeJS.ProcessEnv = process.env): SpApiConfig | null {
  const { SPAPI_CLIENT_ID, SPAPI_CLIENT_SECRET, SPAPI_REFRESH_TOKEN } = env;
  if (!SPAPI_CLIENT_ID || !SPAPI_CLIENT_SECRET || !SPAPI_REFRESH_TOKEN) return null;
  return {
    clientId: SPAPI_CLIENT_ID,
    clientSecret: SPAPI_CLIENT_SECRET,
    refreshToken: SPAPI_REFRESH_TOKEN,
    marketplaceId: env.SPAPI_MARKETPLACE_ID || "A1F83G8C2ARO7P",
    sellerId: env.SPAPI_SELLER_ID || null,
    endpoint: env.SPAPI_ENDPOINT || EU_ENDPOINT,
  };
}

type Fetch = typeof fetch;

/** Per-operation minimum spacing between calls, from SP-API's documented rate limits. */
const MIN_INTERVAL_MS: Record<string, number> = {
  catalog: 500, // searchCatalogItems: 2 rps
  feesSingle: 1000, // getMyFeesEstimateForASIN: 1 rps
  feesBatch: 2000, // getMyFeesEstimates: 0.5 rps
  restrictions: 200, // getListingsRestrictions: 5 rps
  pricing: 2000, // getCompetitivePricing: 0.5 rps
};

export class SpApiClient {
  private token: { value: string; expiresAt: number } | null = null;
  private lastCall: Record<string, number> = {};

  constructor(
    readonly config: SpApiConfig,
    private readonly fetchImpl: Fetch = fetch,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  /** LWA refresh-token exchange. Cached until a minute before expiry. */
  async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt - 60_000) return this.token.value;
    const res = await this.fetchImpl(LWA_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: this.config.refreshToken,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }).toString(),
    });
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
    if (!res.ok || !body.access_token) {
      throw new SpApiError(`LWA token exchange failed: ${body.error_description ?? res.status}`, res.status, body);
    }
    this.token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
    return this.token.value;
  }

  private async throttle(op: string) {
    const gap = MIN_INTERVAL_MS[op] ?? 0;
    const wait = (this.lastCall[op] ?? 0) + gap - Date.now();
    if (wait > 0) await this.sleep(wait);
    this.lastCall[op] = Date.now();
  }

  /** Signed request with retries on 429 and 5xx (exponential backoff, 4 attempts). */
  async request<T>(op: string, method: "GET" | "POST", path: string, opts: { query?: Record<string, string>; body?: unknown } = {}): Promise<T> {
    const url = new URL(path, this.config.endpoint);
    for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);

    for (let attempt = 0; ; attempt++) {
      await this.throttle(op);
      const res = await this.fetchImpl(url, {
        method,
        headers: {
          "x-amz-access-token": await this.accessToken(),
          "content-type": "application/json",
          accept: "application/json",
          "user-agent": "WholesaleScout/0.1 (Language=TypeScript)",
        },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      });
      if (res.ok) return (await res.json()) as T;
      const retryable = res.status === 429 || res.status >= 500;
      if (res.status === 401 || res.status === 403) this.token = null;
      if (!retryable || attempt >= 3) {
        const body = await res.json().catch(() => undefined);
        const msg = (body as { errors?: { message?: string }[] } | undefined)?.errors?.[0]?.message;
        throw new SpApiError(`SP-API ${op} ${res.status}${msg ? `: ${msg}` : ""}`, res.status, body);
      }
      await this.sleep(2 ** attempt * 1000);
    }
  }

  /** Catalog lookup by EAN (up to 20 per call). Every ASIN an EAN maps to is returned. */
  async catalogByEans(eans: string[]): Promise<Map<string, CatalogMatch[]>> {
    const out = new Map<string, CatalogMatch[]>();
    for (let i = 0; i < eans.length; i += 20) {
      const chunk = eans.slice(i, i + 20);
      const res = await this.request<{ items?: unknown[] }>("catalog", "GET", "/catalog/2022-04-01/items", {
        query: {
          identifiers: chunk.join(","),
          identifiersType: "EAN",
          marketplaceIds: this.config.marketplaceId,
          includedData: "summaries,attributes,dimensions,identifiers,relationships,salesRanks,classifications",
          pageSize: "20",
        },
      });
      for (const raw of res.items ?? []) {
        const item = parseCatalogItem(raw, this.config.marketplaceId);
        for (const ean of chunk) {
          if (item.eans.some((e) => sameGtin(e, ean))) {
            const list = out.get(ean) ?? [];
            if (!list.some((x) => x.asin === item.asin)) list.push(item);
            out.set(ean, list);
          }
        }
      }
    }
    return out;
  }

  /** getMyFeesEstimateForASIN — Amazon's fee for one ASIN at a price, FBA. */
  async getMyFeesEstimate(asin: string, price: number): Promise<FeesEstimate> {
    const res = await this.request<{ payload?: { FeesEstimateResult?: unknown } }>(
      "feesSingle",
      "POST",
      `/products/fees/v0/items/${encodeURIComponent(asin)}/feesEstimate`,
      { body: { FeesEstimateRequest: this.feesRequest(asin, price) } },
    );
    return parseFeesEstimate(res.payload?.FeesEstimateResult, asin);
  }

  /** getMyFeesEstimates — up to 20 ASIN/price pairs per call. */
  async getMyFeesEstimates(items: { asin: string; price: number }[]): Promise<FeesEstimate[]> {
    const out: FeesEstimate[] = [];
    for (let i = 0; i < items.length; i += 20) {
      const chunk = items.slice(i, i + 20);
      const res = await this.request<unknown[]>("feesBatch", "POST", "/products/fees/v0/feesEstimate", {
        body: chunk.map(({ asin, price }) => ({
          FeesEstimateRequest: this.feesRequest(asin, price),
          IdType: "ASIN",
          IdValue: asin,
        })),
      });
      chunk.forEach(({ asin }, j) => out.push(parseFeesEstimate(res?.[j], asin)));
    }
    return out;
  }

  private feesRequest(asin: string, price: number) {
    return {
      MarketplaceId: this.config.marketplaceId,
      IsAmazonFulfilled: true,
      PriceToEstimateFees: { ListingPrice: { CurrencyCode: "GBP", Amount: Math.round(price * 100) / 100 } },
      Identifier: `ws-${asin}-${Math.round(price * 100)}`,
    };
  }

  /** getListingsRestrictions — whether this seller account can list the ASIN new. */
  async getListingsRestrictions(asin: string): Promise<Restriction> {
    if (!this.config.sellerId) {
      return { asin, status: "unknown", reasons: [{ code: "NO_SELLER_ID", message: "Set SPAPI_SELLER_ID to check gating" }] };
    }
    const res = await this.request<{ restrictions?: unknown[] }>("restrictions", "GET", "/listings/2021-08-01/restrictions", {
      query: {
        asin,
        sellerId: this.config.sellerId,
        marketplaceIds: this.config.marketplaceId,
        conditionType: "new_new",
        reasonLocale: "en_GB",
      },
    });
    return parseRestrictions(asin, res.restrictions ?? []);
  }

  /** getCompetitivePricing — current Buy Box and offer count, up to 20 ASINs per call. */
  async getCompetitivePricing(asins: string[]): Promise<Map<string, CompetitivePrice>> {
    const out = new Map<string, CompetitivePrice>();
    for (let i = 0; i < asins.length; i += 20) {
      const chunk = asins.slice(i, i + 20);
      const res = await this.request<{ payload?: unknown[] }>("pricing", "GET", "/products/pricing/v0/competitivePrice", {
        query: { MarketplaceId: this.config.marketplaceId, Asins: chunk.join(","), ItemType: "Asin" },
      });
      for (const p of parseCompetitivePricing(res.payload ?? [])) out.set(p.asin, p);
    }
    return out;
  }
}

/** EAN-13, UPC-12 and GTIN-14 of the same item differ only by leading zeros. */
export function sameGtin(a: string, b: string): boolean {
  const n = (s: string) => s.replace(/\D/g, "").replace(/^0+/, "");
  return n(a) === n(b) && n(a) !== "";
}

let shared: SpApiClient | null | undefined;
/** The process-wide client, or null when SP-API credentials aren't configured. */
export function getSpApi(): SpApiClient | null {
  if (shared === undefined) {
    const cfg = spApiConfigFromEnv();
    shared = cfg ? new SpApiClient(cfg) : null;
  }
  return shared;
}
