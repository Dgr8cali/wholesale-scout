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
  LookupAttempt,
  ListingOffers,
  LookupTrace,
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

/** Extra attempts for fee estimates that come back as Amazon-side ServerErrors. */
const FEE_RETRIES = 2;

/** SP-API's documented rate (requests/second) and burst per operation, for the token buckets. */
const RATE_LIMITS: Record<string, { rate: number; burst: number }> = {
  catalog: { rate: 2, burst: 2 }, // searchCatalogItems
  feesSingle: { rate: 1, burst: 2 }, // getMyFeesEstimateForASIN
  feesBatch: { rate: 0.5, burst: 1 }, // getMyFeesEstimates (20 per request)
  restrictions: { rate: 5, burst: 10 }, // getListingsRestrictions
  pricing: { rate: 0.5, burst: 1 }, // getCompetitivePricing (20 per request)
  offersBatch: { rate: 0.1, burst: 1 }, // getItemOffersBatch (20 per request)
};

interface Bucket {
  tokens: number;
  at: number;
  /** Callers queue on this, so parallel requests share the bucket fairly. */
  turn: Promise<void>;
}

export class SpApiClient {
  private token: { value: string; expiresAt: number } | null = null;
  private buckets = new Map<string, Bucket>();
  private tokenInFlight: Promise<string> | null = null;

  constructor(
    readonly config: SpApiConfig,
    private readonly fetchImpl: Fetch = fetch,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  /** LWA refresh-token exchange. Cached until a minute before expiry. */
  async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt - 60_000) return this.token.value;
    // Parallel requests share one exchange.
    this.tokenInFlight ??= this.exchangeToken().finally(() => {
      this.tokenInFlight = null;
    });
    return this.tokenInFlight;
  }

  private async exchangeToken(): Promise<string> {
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

  private bucket(op: string): Bucket | null {
    const cfg = RATE_LIMITS[op];
    if (!cfg) return null;
    let b = this.buckets.get(op);
    if (!b) this.buckets.set(op, (b = { tokens: cfg.burst, at: Date.now(), turn: Promise.resolve() }));
    return b;
  }

  /** Token bucket per operation: bursts up to Amazon's burst, then its steady rate. Safe in parallel. */
  private async throttle(op: string) {
    const cfg = RATE_LIMITS[op];
    const b = this.bucket(op);
    if (!cfg || !b) return;
    const mine = b.turn.then(async () => {
      const now = Date.now();
      b.tokens = Math.min(cfg.burst, b.tokens + ((now - b.at) / 1000) * cfg.rate);
      b.at = now;
      if (b.tokens < 1) {
        await this.sleep(((1 - b.tokens) / cfg.rate) * 1000);
        b.tokens = 1;
        b.at = Date.now();
      }
      b.tokens -= 1;
    });
    b.turn = mine.catch(() => {});
    await mine;
  }

  /** After a 429, empty the bucket so parallel callers back off too. */
  private drain(op: string) {
    const b = this.bucket(op);
    if (b) {
      b.tokens = Math.min(b.tokens, 0);
      b.at = Date.now();
    }
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
      if (res.status === 429) this.drain(op);
      if (res.status === 401 || res.status === 403) this.token = null;
      if (!retryable || attempt >= 3) {
        const body = await res.json().catch(() => undefined);
        const msg = (body as { errors?: { message?: string }[] } | undefined)?.errors?.[0]?.message;
        throw new SpApiError(`SP-API ${op} ${res.status}${msg ? `: ${msg}` : ""}`, res.status, body);
      }
      await this.sleep(2 ** attempt * 1000);
    }
  }

  /** Catalog lookup by EAN. Every ASIN an EAN maps to is returned. */
  async catalogByEans(eans: string[]): Promise<Map<string, CatalogMatch[]>> {
    return (await this.lookupEans(eans)).matches;
  }

  private async searchCatalog(identifiersType: LookupAttempt["identifiersType"], codes: string[], pageToken?: string) {
    return this.request<{ items?: unknown[]; numberOfResults?: number; pagination?: { nextToken?: string } }>(
      "catalog", "GET", "/catalog/2022-04-01/items", {
        query: {
          identifiers: codes.join(","),
          identifiersType,
          marketplaceIds: this.config.marketplaceId,
          includedData: "summaries,attributes,dimensions,identifiers,relationships,salesRanks,classifications,images",
          pageSize: "20",
          ...(pageToken ? { pageToken } : {}),
        },
      },
    );
  }

  /**
   * Resolve EANs to catalog items, with a trace per EAN. Every pass is batched and items are
   * attributed by their identifiers, so a miss costs a fraction of a request:
   *
   * 1. EANs, 20 per request, following nextToken.
   * 2. Where a batch came back truncated (Amazon reports more results than it returns, and
   *    sometimes gives no token), its unmatched EANs again, 5 per request.
   * 3. Still unmatched: the GTIN-14 form, 20 per request; then UPC for codes of 12 digits or
   *    fewer, 20 per request.
   */
  async lookupEans(eans: string[]): Promise<{ matches: Map<string, CatalogMatch[]>; traces: Map<string, LookupTrace> }> {
    const matches = new Map<string, CatalogMatch[]>();
    const traces = new Map<string, LookupTrace>(eans.map((e) => [e, { outcome: "search_miss", attempts: [] }]));
    const lastRaw = new Map<string, unknown>();
    const add = (ean: string, item: CatalogMatch) => {
      const list = matches.get(ean) ?? [];
      if (!list.some((x) => x.asin === item.asin)) list.push(item);
      matches.set(ean, list);
    };

    /** One batched pass: `codes` maps each EAN to the identifier sent for it. */
    const pass = async (type: LookupAttempt["identifiersType"], batch: { ean: string; code: string }[], size: number) => {
      const truncated: string[] = [];
      for (let i = 0; i < batch.length; i += size) {
        const chunk = batch.slice(i, i + size);
        const found = new Map<string, number>();
        let total: number | undefined, returned = 0, token: string | undefined, error: string | undefined, lastPage: unknown;
        try {
          for (let page = 0; page < 5; page++) {
            const res = await this.searchCatalog(type, chunk.map((c) => c.code), token);
            total = res.numberOfResults;
            returned += res.items?.length ?? 0;
            lastPage = res;
            for (const raw of res.items ?? []) {
              const item = parseCatalogItem(raw, this.config.marketplaceId);
              for (const { ean, code } of chunk) {
                if (item.eans.some((e) => sameGtin(e, code) || sameGtin(e, ean))) {
                  add(ean, item);
                  found.set(ean, (found.get(ean) ?? 0) + 1);
                }
              }
            }
            token = res.pagination?.nextToken;
            if (!token) break;
          }
        } catch (e) {
          error = (e as Error).message;
          lastPage = { error, body: (e as SpApiError).body };
        }
        const label = chunk.length === 1 ? chunk[0].code : `batch of ${chunk.length}`;
        for (const { ean } of chunk) {
          traces.get(ean)!.attempts.push({ identifiersType: type, code: label, items: found.get(ean) ?? 0, total, ...(error ? { error } : {}) });
          if (!found.has(ean)) lastRaw.set(ean, lastPage);
        }
        if (!error && total != null && total > returned) truncated.push(...chunk.map((c) => c.ean).filter((e) => !found.has(e)));
      }
      return truncated;
    };

    const unmatched = () => eans.filter((e) => !matches.has(e));
    const bare = (e: string) => e.replace(/\D/g, "").replace(/^0+/, "");

    const truncated = await pass("EAN", eans.map((ean) => ({ ean, code: ean })), 20);
    const cut = truncated.filter((e) => !matches.has(e));
    if (cut.length) {
      const still = await pass("EAN", cut.map((ean) => ({ ean, code: bare(ean).padStart(13, "0") })), 5);
      // Five EANs can still overflow a page; those few go one at a time.
      if (still.length) await pass("EAN", still.filter((e) => !matches.has(e)).map((ean) => ({ ean, code: bare(ean).padStart(13, "0") })), 1);
    }
    await pass("GTIN", unmatched().filter((e) => bare(e).length <= 14).map((ean) => ({ ean, code: bare(ean).padStart(14, "0") })), 20);
    await pass("UPC", unmatched().filter((e) => bare(e).length <= 12).map((ean) => ({ ean, code: bare(ean).padStart(12, "0") })), 20);

    for (const ean of eans) {
      const trace = traces.get(ean)!;
      if (matches.has(ean)) {
        trace.outcome = "matched";
        continue;
      }
      // A miss counts only if Amazon answered the last query for it; otherwise it's an API error.
      trace.outcome = trace.attempts.at(-1)?.error ? "api_error" : "search_miss";
      trace.raw = JSON.stringify(lastRaw.get(ean) ?? null).slice(0, 1500);
      console.log(`[catalog] ${ean} ${trace.outcome}: ${JSON.stringify(trace.attempts)} raw=${trace.raw}`);
    }
    return { matches, traces };
  }

  /** Full catalog items by ASIN, 20 per request (an ASIN check). ASINs Amazon doesn't know are absent. */
  async catalogByAsins(asins: string[]): Promise<Map<string, CatalogMatch>> {
    const out = new Map<string, CatalogMatch>();
    const unique = [...new Set(asins)];
    for (let i = 0; i < unique.length; i += 20) {
      const chunk = unique.slice(i, i + 20);
      const res = await this.request<{ items?: unknown[] }>("catalog", "GET", "/catalog/2022-04-01/items", {
        query: {
          identifiers: chunk.join(","), identifiersType: "ASIN", marketplaceIds: this.config.marketplaceId,
          includedData: "summaries,attributes,dimensions,identifiers,relationships,salesRanks,classifications,images", pageSize: "20",
        },
      });
      for (const raw of res.items ?? []) {
        const item = parseCatalogItem(raw, this.config.marketplaceId);
        if (item.asin) out.set(item.asin.toUpperCase(), item);
      }
    }
    return out;
  }

  /** Main image per ASIN (catalog search by ASIN, 20 per request). null when Amazon has none. */
  async imagesByAsins(asins: string[]): Promise<Map<string, string | null>> {
    const out = new Map<string, string | null>();
    const unique = [...new Set(asins)];
    for (let i = 0; i < unique.length; i += 20) {
      const chunk = unique.slice(i, i + 20);
      const res = await this.request<{ items?: unknown[] }>("catalog", "GET", "/catalog/2022-04-01/items", {
        query: { identifiers: chunk.join(","), identifiersType: "ASIN", marketplaceIds: this.config.marketplaceId, includedData: "images", pageSize: "20" },
      });
      for (const a of chunk) out.set(a, null);
      for (const raw of res.items ?? []) {
        const item = parseCatalogItem(raw, this.config.marketplaceId);
        if (item.asin) out.set(item.asin, item.imageUrl);
      }
    }
    return out;
  }

  /**
   * getMyFeesEstimateForASIN — Amazon's fee for one ASIN at a price, FBA. Amazon returns
   * intermittent "ServerError" results with HTTP 200, so those are asked again.
   */
  async getMyFeesEstimate(asin: string, price: number): Promise<FeesEstimate> {
    let result: FeesEstimate;
    for (let attempt = 0; ; attempt++) {
      const res = await this.request<{ payload?: { FeesEstimateResult?: unknown } }>(
        "feesSingle",
        "POST",
        `/products/fees/v0/items/${encodeURIComponent(asin)}/feesEstimate`,
        { body: { FeesEstimateRequest: this.feesRequest(asin, price) } },
      );
      result = parseFeesEstimate(res.payload?.FeesEstimateResult, asin);
      if (!result.retryable || attempt >= FEE_RETRIES) return result;
      await this.sleep(1000 * (attempt + 1));
    }
  }

  /** getMyFeesEstimates — up to 20 ASIN/price pairs per call; ServerError items are asked again. */
  async getMyFeesEstimates(items: { asin: string; price: number }[]): Promise<FeesEstimate[]> {
    const out: FeesEstimate[] = new Array(items.length);
    let todo = items.map((item, index) => ({ ...item, index }));
    for (let attempt = 0; todo.length; attempt++) {
      const retry: typeof todo = [];
      for (let i = 0; i < todo.length; i += 20) {
        const chunk = todo.slice(i, i + 20);
        const res = await this.request<unknown[]>("feesBatch", "POST", "/products/fees/v0/feesEstimate", {
          body: chunk.map(({ asin, price }) => ({
            FeesEstimateRequest: this.feesRequest(asin, price),
            IdType: "ASIN",
            IdValue: asin,
          })),
        });
        chunk.forEach((item, j) => {
          const r = parseFeesEstimate(res?.[j], item.asin);
          out[item.index] = r;
          if (r.retryable && attempt < FEE_RETRIES) retry.push(item);
        });
      }
      todo = retry;
      if (todo.length) await this.sleep(1000 * (attempt + 1));
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
      return { asin, status: "unknown", reasons: [{ code: "NO_SELLER_ID", message: "Set SPAPI_SELLER_ID to check gating", links: [] }] };
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
  /**
   * Who sells each listing now (new condition), 20 ASINs a request: whether Amazon holds an
   * offer, how many offers are FBA, and the Buy Box. Free, and enough to rule rows out
   * before any Keepa token.
   */
  async getItemOffersBatch(asins: string[]): Promise<Map<string, ListingOffers>> {
    const out = new Map<string, ListingOffers>();
    for (let i = 0; i < asins.length; i += 20) {
      const chunk = asins.slice(i, i + 20);
      const res = await this.request<{ responses?: unknown[] }>("offersBatch", "POST", "/batches/products/pricing/v0/itemOffers", {
        body: {
          requests: chunk.map((asin) => ({
            uri: `/products/pricing/v0/items/${asin}/offers`, method: "GET",
            MarketplaceId: this.config.marketplaceId, ItemCondition: "New", CustomerType: "Consumer",
          })),
        },
      });
      for (const o of parseItemOffers(res.responses ?? [])) out.set(o.asin, o);
    }
    return out;
  }

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

/** Amazon.co.uk's own seller ID. */
const AMAZON_UK_SELLER_ID = "A3P5ROKL5A1OLE";

/** Batch getItemOffers responses into who's selling each ASIN; failed entries are left out. */
export function parseItemOffers(responses: unknown[]): ListingOffers[] {
  const out: ListingOffers[] = [];
  for (const r of responses as { status?: { statusCode?: number }; body?: { payload?: Record<string, unknown> } }[]) {
    const p = r.body?.payload as {
      ASIN?: string;
      Summary?: { TotalOfferCount?: number; NumberOfOffers?: { condition?: string; fulfillmentChannel?: string; OfferCount?: number }[]; BuyBoxPrices?: { condition?: string; LandedPrice?: { Amount?: number } }[] };
      Offers?: { SellerId?: string; IsBuyBoxWinner?: boolean }[];
    } | undefined;
    if (!p?.ASIN || (r.status?.statusCode && r.status.statusCode >= 300)) continue;
    const s = p.Summary ?? {};
    const isNew = (c?: string) => !c || c.toLowerCase() === "new";
    const fba = (s.NumberOfOffers ?? []).filter((n) => isNew(n.condition) && n.fulfillmentChannel === "Amazon").reduce((a, n) => a + (n.OfferCount ?? 0), 0);
    const bb = (s.BuyBoxPrices ?? []).find((b) => isNew(b.condition))?.LandedPrice?.Amount;
    out.push({
      asin: p.ASIN,
      amazon: (p.Offers ?? []).some((o) => o.SellerId === AMAZON_UK_SELLER_ID),
      fbaOffers: s.NumberOfOffers ? fba : null,
      totalOffers: s.TotalOfferCount ?? null,
      buyBox: bb != null ? Number(bb) : null,
      buyBoxSellerId: (p.Offers ?? []).find((o) => o.IsBuyBoxWinner)?.SellerId ?? null,
    });
  }
  return out;
}

/** Identifier variants to try, one at a time, for an EAN a batch didn't resolve. */
export function lookupCandidates(ean: string): [LookupAttempt["identifiersType"], string][] {
  const digits = ean.replace(/\D/g, "");
  const bare = digits.replace(/^0+/, "");
  if (!bare) return [];
  const out: [LookupAttempt["identifiersType"], string][] = [];
  if (bare.length <= 13) out.push(["EAN", bare.padStart(13, "0")]);
  if (bare.length <= 12) out.push(["UPC", bare.padStart(12, "0")]);
  if (bare.length <= 14) out.push(["GTIN", bare.padStart(14, "0")]);
  return out;
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
