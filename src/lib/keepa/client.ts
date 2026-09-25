/**
 * Keepa clients behind one interface.
 *
 * - StubKeepaClient: the default until a real key is set. Returns nothing, and the
 *   Keepa-dependent gates report "not checked" rather than failing rows.
 * - HttpKeepaClient: the Keepa product API (amazon.co.uk = domain 2), by ASIN or by
 *   EAN, batches of up to 100. Every request is logged with Keepa's own token figures.
 */
import { decodeSeries, summarize } from "./summarize";
import type { KeepaClient, KeepaLookup, KeepaProduct, KeepaResponseMeta, OnKeepaResponse, KeepaTokens, SellerLookup, SellerProfile, Storefront } from "./types";

export * from "./types";

const emptyLookup = (): KeepaLookup => ({ byEan: new Map(), byAsin: new Map(), tokensUsed: 0, tokensLeft: null, requests: [] });

export class StubKeepaClient implements KeepaClient {
  readonly available = false;
  readonly name = "stub";
  async lookupByEans(): Promise<KeepaLookup> {
    return emptyLookup();
  }
  async lookupByAsins(): Promise<KeepaLookup> {
    return emptyLookup();
  }
  async lookupSellers(): Promise<SellerLookup> {
    return { profiles: new Map(), tokensUsed: 0 };
  }
  async tokenStatus(): Promise<KeepaTokens | null> {
    return null;
  }
}

interface RawSeller {
  sellerId?: string;
  sellerName?: string | null;
  currentRating?: number | null;
  currentRatingCount?: number | null;
  /** [keepa minutes, count]: a count Keepa may not have refreshed. */
  totalStorefrontAsins?: number[] | null;
  /** [keepa minutes, count, ...] history: the last count is the latest. */
  totalStorefrontAsinsCSV?: number[] | null;
  businessName?: string | null;
  buyBoxNewOwnershipRate?: number | null;
  asinList?: string[] | null;
  sellerBrandStatistics?: { brand?: string; productCount?: number }[] | null;
}

export function parseSeller(id: string, s: RawSeller): SellerProfile {
  // The history's last count is the latest; totalStorefrontAsins alone can be months old.
  const store = s.totalStorefrontAsinsCSV?.length ? s.totalStorefrontAsinsCSV : s.totalStorefrontAsins ?? [];
  const size = store.length >= 2 ? store[store.length - 1] : null;
  const pos = (n: number | null | undefined) => (n != null && n >= 0 ? n : null);
  return {
    sellerId: s.sellerId ?? id,
    name: s.sellerName ?? null,
    ratingPct: pos(s.currentRating),
    ratingCount: pos(s.currentRatingCount),
    storefrontSize: pos(size),
    brands: (s.sellerBrandStatistics ?? [])
      .filter((b) => b.brand && (b.productCount ?? 0) > 0)
      .map((b) => ({ brand: b.brand!, count: b.productCount! }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20),
  };
}

/** A seller object fetched with storefront=1. */
export function parseStorefront(id: string, s: RawSeller, tokensUsed: number): Storefront {
  const asins = [...new Set((s.asinList ?? []).filter((a) => typeof a === "string" && /^[A-Z0-9]{10}$/.test(a)))];
  const profile = parseSeller(id, s);
  return {
    // The list itself is the floor for the size when Keepa's count lags.
    profile: { ...profile, storefrontSize: Math.max(profile.storefrontSize ?? 0, asins.length) || null },
    businessName: s.businessName ?? null,
    buyBoxOwnershipPct: s.buyBoxNewOwnershipRate != null && s.buyBoxNewOwnershipRate >= 0 ? s.buyBoxNewOwnershipRate : null,
    asins,
    tokensUsed,
  };
}

// Keepa csv indices.
const CSV = { AMAZON: 0, NEW: 1, SALES: 3, COUNT_NEW: 11, COUNT_REVIEWS: 17, BUY_BOX_SHIPPING: 18 } as const;

interface RawKeepaProduct {
  asin: string;
  eanList?: string[] | null;
  upcList?: string[] | null;
  title?: string | null;
  brand?: string | null;
  categoryTree?: { name: string }[] | null;
  rootCategory?: number;
  packageLength?: number; // mm
  packageWidth?: number;
  packageHeight?: number;
  packageWeight?: number; // g
  parentAsin?: string | null;
  variations?: unknown[] | null;
  csv?: (number[] | null)[];
  buyBoxSellerIdHistory?: string[] | null;
  stats?: { offerCountFBA?: number; salesRankDrops30?: number } | null;
  /** Comma-separated image file names on Amazon's CDN; the first is the main image. */
  imagesCSV?: string | null;
  /** Keepa's FBA fee estimate; pickAndPackFee in pence. */
  fbaFees?: { pickAndPackFee?: number } | null;
  referralFeePercent?: number | null;
  /** Amazon's "bought in past month" (e.g. 200 for "200+"); absent or -1 when not shown. */
  monthlySold?: number | null;
}

export function parseKeepaProduct(p: RawKeepaProduct, now = Date.now(), buyBoxFetched = true): KeepaProduct {
  const csv = p.csv ?? [];
  const series = {
    rank: decodeSeries(csv[CSV.SALES]),
    buyBox: decodeSeries(csv[CSV.BUY_BOX_SHIPPING], { withShipping: true, pence: true }),
    newPrice: decodeSeries(csv[CSV.NEW], { pence: true }),
    offerCount: decodeSeries(csv[CSV.COUNT_NEW]),
    amazon: decodeSeries(csv[CSV.AMAZON], { pence: true }),
    reviewCount: decodeSeries(csv[CSV.COUNT_REVIEWS]),
  };
  const bbHist = p.buyBoxSellerIdHistory ?? [];
  const buyBoxSellers: [number, string][] = [];
  for (let k = 0; k + 1 < bbHist.length; k += 2) {
    buyBoxSellers.push([(Number(bbHist[k]) + 21_564_000) * 60_000, bbHist[k + 1]]);
  }
  const dims = p.packageLength && p.packageWidth && p.packageHeight
    ? { l: p.packageLength / 10, w: p.packageWidth / 10, h: p.packageHeight / 10 }
    : null;
  const weightG = p.packageWeight && p.packageWeight > 0 ? p.packageWeight : null;
  const variationCount = p.variations?.length || null;
  const pick = p.fbaFees?.pickAndPackFee;
  // Without Buy Box data (stage 1) the lowest new offer stands in for the Buy Box price.
  const base = summarize({
    now,
    ...series,
    buyBox: buyBoxFetched ? series.buyBox : series.newPrice,
    fbaOfferCount: p.stats?.offerCountFBA ?? null,
    buyBoxSellers,
    monthlySold: p.monthlySold ?? null,
  });
  return {
    asin: p.asin,
    eans: [...(p.eanList ?? []), ...(p.upcList ?? [])],
    title: p.title ?? null,
    brand: p.brand ?? null,
    category: p.categoryTree?.[0]?.name ?? null,
    dimsCm: dims,
    weightG,
    parentAsin: p.parentAsin ?? null,
    variationCount,
    imageUrl: p.imagesCSV?.split(",")[0]?.trim() ? `https://m.media-amazon.com/images/I/${p.imagesCSV.split(",")[0].trim()}` : null,
    series,
    buyBoxSellers,
    summary: {
      ...base,
      keepaRankDrops30: p.stats?.salesRankDrops30 != null && p.stats.salesRankDrops30 >= 0 ? p.stats.salesRankDrops30 : null,
      fbaFee: pick != null && pick > 0 ? pick / 100 : null,
      referralFeePct: p.referralFeePercent != null && p.referralFeePercent > 0 ? p.referralFeePercent : null,
      packageDims: dims,
      packageWeightG: weightG,
      variationCount,
      buyBoxFetched,
      rootCategory: p.categoryTree?.[0]?.name ?? null,
    },
  };
}

interface KeepaBody {
  products?: RawKeepaProduct[];
  sellers?: Record<string, RawSeller>;
  tokensConsumed?: number;
  tokensLeft?: number;
  refillIn?: number;
  processingTimeInMs?: number;
  error?: { type?: string; message?: string };
}

export class KeepaError extends Error {
  constructor(message: string, readonly meta: KeepaResponseMeta) {
    super(message);
  }
}

/**
 * Keepa product API on amazon.co.uk (domain 2), with a year of stats, full history and
 * Buy Box seller history: 1 token per product plus 2 for the Buy Box data.
 */
export class HttpKeepaClient implements KeepaClient {
  readonly available = true;
  readonly name = "keepa";
  constructor(
    private readonly key: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly log: (line: string) => void = (l) => console.log(l),
  ) {}

  /** One request, logged with Keepa's own token figures and reported before it's parsed. */
  private async request(kind: "asin" | "code" | "seller", ids: string[], onResponse?: OnKeepaResponse, buyBox = true, storefront = false): Promise<{ body: KeepaBody; meta: KeepaResponseMeta }> {
    const url = new URL(kind === "seller" ? "https://api.keepa.com/seller" : "https://api.keepa.com/product");
    url.search = new URLSearchParams(kind === "seller"
      ? { key: this.key, domain: "2", seller: ids.join(","), ...(storefront ? { storefront: "1" } : {}) }
      : { key: this.key, domain: "2", [kind]: ids.join(","), stats: "365", history: "1", ...(buyBox ? { buybox: "1" } : {}) }).toString();
    const res = await this.fetchImpl(url);
    const body = (await res.json().catch(() => ({}))) as KeepaBody;
    const meta: KeepaResponseMeta = {
      kind,
      ...(kind === "seller" ? {} : { buyBox }),
      count: ids.length,
      status: res.status,
      tokensConsumed: body.tokensConsumed ?? 0,
      tokensLeft: body.tokensLeft ?? null,
      refillInMs: body.refillIn ?? null,
      processingTimeInMs: body.processingTimeInMs ?? null,
      products: kind === "seller" ? Object.keys(body.sellers ?? {}).length : body.products?.length ?? 0,
    };
    this.log(
      `[keepa] ${kind}${kind !== "seller" ? (buyBox ? "+buybox" : " history-only") : ""} lookup n=${meta.count} http=${meta.status} products=${meta.products} ` +
        `tokensConsumed=${meta.tokensConsumed} tokensLeft=${meta.tokensLeft} refillIn=${meta.refillInMs}ms processing=${meta.processingTimeInMs}ms`,
    );
    await onResponse?.(meta);
    if (!res.ok) throw new KeepaError(`Keepa ${res.status}: ${body.error?.message ?? body.error?.type ?? "request failed"}`, meta);
    return { body, meta };
  }

  /** Batches of 100; stops (and says so) when Keepa has no tokens left. */
  private async run(kind: "asin" | "code", ids: string[], onResponse: OnKeepaResponse | undefined, take: (p: KeepaProduct, chunk: string[], out: KeepaLookup) => void, buyBox = true): Promise<KeepaLookup> {
    const out = emptyLookup();
    const unique = [...new Set(ids)];
    for (let i = 0; i < unique.length; i += 100) {
      const chunk = unique.slice(i, i + 100);
      if (out.tokensLeft != null && out.tokensLeft <= 0) {
        out.exhausted = { refillInMs: out.requests.at(-1)?.refillInMs ?? null, skipped: unique.length - i };
        break;
      }
      try {
        const { body, meta } = await this.request(kind, chunk, onResponse, buyBox);
        out.requests.push(meta);
        out.tokensUsed += meta.tokensConsumed;
        out.tokensLeft = meta.tokensLeft;
        for (const raw of body.products ?? []) if (raw?.asin) take(parseKeepaProduct(raw, Date.now(), buyBox), chunk, out);
      } catch (e) {
        if (e instanceof KeepaError) {
          out.requests.push(e.meta);
          out.tokensUsed += e.meta.tokensConsumed;
          out.tokensLeft = e.meta.tokensLeft;
          if (e.meta.status === 429) {
            out.exhausted = { refillInMs: e.meta.refillInMs, skipped: unique.length - i };
            break;
          }
        }
        throw e;
      }
    }
    return out;
  }

  /** Token balance from Keepa's /token endpoint, which costs nothing. */
  async tokenStatus(): Promise<KeepaTokens | null> {
    try {
      const res = await this.fetchImpl(new URL(`https://api.keepa.com/token?key=${encodeURIComponent(this.key)}`));
      const b = (await res.json()) as { tokensLeft?: number; refillIn?: number; refillRate?: number };
      if (b.tokensLeft == null) return null;
      this.log(`[keepa] token status tokensLeft=${b.tokensLeft} refillIn=${b.refillIn}ms refillRate=${b.refillRate}/min`);
      return { tokensLeft: b.tokensLeft, refillInMs: b.refillIn ?? 60_000, refillRate: b.refillRate ?? 1 };
    } catch {
      return null;
    }
  }

  /** One seller's storefront: its ASIN list and profile, 10 tokens (1 + 9 for the list). */
  async storefront(sellerId: string, onResponse?: OnKeepaResponse): Promise<Storefront | null> {
    const { body, meta } = await this.request("seller", [sellerId], onResponse, true, true);
    const raw = body.sellers?.[sellerId];
    return raw ? parseStorefront(sellerId, raw, meta.tokensConsumed) : null;
  }

  /** Seller profiles, 1 token each, batches of 100. */
  async lookupSellers(sellerIds: string[], onResponse?: OnKeepaResponse): Promise<SellerLookup> {
    const out: SellerLookup = { profiles: new Map(), tokensUsed: 0 };
    const unique = [...new Set(sellerIds)];
    let left: number | null = null;
    for (let i = 0; i < unique.length; i += 100) {
      const chunk = unique.slice(i, i + 100);
      if (left != null && left <= 0) {
        out.exhausted = { refillInMs: null, skipped: unique.length - i };
        break;
      }
      try {
        const { body, meta } = await this.request("seller", chunk, onResponse);
        out.tokensUsed += meta.tokensConsumed;
        left = meta.tokensLeft;
        for (const [id, raw] of Object.entries(body.sellers ?? {})) out.profiles.set(id, parseSeller(id, raw));
      } catch (e) {
        if (e instanceof KeepaError && e.meta.status === 429) {
          out.exhausted = { refillInMs: e.meta.refillInMs, skipped: unique.length - i };
          break;
        }
        throw e;
      }
    }
    return out;
  }

  /** Product Finder: ASINs matching a selection (Keepa's query JSON), sorted as it says. */
  async productFinder(selection: Record<string, unknown>): Promise<FinderResult> {
    const url = new URL("https://api.keepa.com/query");
    url.search = new URLSearchParams({ key: this.key, domain: "2", selection: JSON.stringify(selection) }).toString();
    const res = await this.fetchImpl(url);
    const body = (await res.json().catch(() => ({}))) as KeepaBody & { asinList?: string[] | null; totalResults?: number };
    this.log(`[keepa] finder http=${res.status} results=${body.asinList?.length ?? 0}/${body.totalResults ?? "?"} tokensConsumed=${body.tokensConsumed ?? 0} tokensLeft=${body.tokensLeft}`);
    if (!res.ok || body.error) throw new Error(`Keepa Product Finder ${res.status}: ${body.error?.message ?? body.error?.type ?? "request failed"}`);
    return { asins: body.asinList ?? [], total: body.totalResults ?? body.asinList?.length ?? 0, tokensUsed: body.tokensConsumed ?? 0, tokensLeft: body.tokensLeft ?? null };
  }

  /** Amazon UK's top-level categories (Keepa's /category with category=0): 1 token. */
  async rootCategories(): Promise<{ categories: { id: number; name: string; products: number | null }[]; tokensUsed: number }> {
    const url = new URL("https://api.keepa.com/category");
    url.search = new URLSearchParams({ key: this.key, domain: "2", category: "0", parents: "0" }).toString();
    const res = await this.fetchImpl(url);
    const body = (await res.json().catch(() => ({}))) as KeepaBody & { categories?: Record<string, { catId: number; name: string; productCount?: number }> };
    this.log(`[keepa] categories http=${res.status} n=${Object.keys(body.categories ?? {}).length} tokensConsumed=${body.tokensConsumed ?? 0}`);
    if (!res.ok || body.error) throw new Error(`Keepa categories ${res.status}: ${body.error?.message ?? body.error?.type ?? "request failed"}`);
    const categories = Object.values(body.categories ?? {}).map((c) => ({ id: c.catId, name: c.name, products: c.productCount ?? null }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { categories, tokensUsed: body.tokensConsumed ?? 0 };
  }

  async lookupByAsins(asins: string[], onResponse?: OnKeepaResponse, opts: { buyBox?: boolean } = {}): Promise<KeepaLookup> {
    return this.run("asin", asins, onResponse, (p, _chunk, out) => {
      out.byAsin.set(p.asin, p);
    }, opts.buyBox ?? true);
  }

  async lookupByEans(eans: string[], onResponse?: OnKeepaResponse, opts: { buyBox?: boolean } = {}): Promise<KeepaLookup> {
    return this.run("code", eans, onResponse, (p, chunk, out) => {
      out.byAsin.set(p.asin, p);
      for (const ean of chunk) {
        if (p.eans.some((e) => e.replace(/^0+/, "") === ean.replace(/^0+/, ""))) {
          out.byEan.set(ean, [...(out.byEan.get(ean) ?? []), p]);
        }
      }
    }, opts.buyBox ?? true);
  }
}

export interface FinderResult { asins: string[]; total: number; tokensUsed: number; tokensLeft: number | null }

/** Keepa's Product Finder (/query) and category list, on the HTTP client only. */
export interface KeepaFinder {
  productFinder(selection: Record<string, unknown>): Promise<FinderResult>;
  rootCategories(): Promise<{ categories: { id: number; name: string; products: number | null }[]; tokensUsed: number }>;
}

export const hasFinder = (k: KeepaClient): k is KeepaClient & KeepaFinder => typeof (k as Partial<KeepaFinder>).productFinder === "function";

/** Stub unless KEEPA_API_KEY looks like a real key (64 alphanumerics). */
export function getKeepa(env: NodeJS.ProcessEnv = process.env): KeepaClient {
  const key = env.KEEPA_API_KEY?.trim();
  if (env.KEEPA_MODE === "stub" || !key || !/^[a-z0-9]{64}$/i.test(key)) return new StubKeepaClient();
  return new HttpKeepaClient(key);
}
