/**
 * Keepa clients behind one interface.
 *
 * - StubKeepaClient: the default until a real key is set. Returns nothing, and the
 *   Keepa-dependent gates report "not checked" rather than failing rows.
 * - HttpKeepaClient: the Keepa product API (amazon.co.uk = domain 2), EAN lookups in
 *   batches of up to 100. Written to Keepa's documented response format; exercise it
 *   against a real key before trusting it on a full sheet.
 */
import { decodeSeries, summarize } from "./summarize";
import type { KeepaClient, KeepaLookup, KeepaProduct } from "./types";

export * from "./types";

export class StubKeepaClient implements KeepaClient {
  readonly available = false;
  readonly name = "stub";
  async lookupByEans(): Promise<KeepaLookup> {
    return { byEan: new Map(), tokensUsed: 0 };
  }
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
  stats?: { offerCountFBA?: number } | null;
  /** Amazon's "bought in past month" (e.g. 200 for "200+"); absent or -1 when not shown. */
  monthlySold?: number | null;
}

export function parseKeepaProduct(p: RawKeepaProduct, now = Date.now()): KeepaProduct {
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
  return {
    asin: p.asin,
    eans: [...(p.eanList ?? []), ...(p.upcList ?? [])],
    title: p.title ?? null,
    brand: p.brand ?? null,
    category: p.categoryTree?.[0]?.name ?? null,
    dimsCm: dims,
    weightG: p.packageWeight && p.packageWeight > 0 ? p.packageWeight : null,
    parentAsin: p.parentAsin ?? null,
    variationCount: p.variations?.length ?? null,
    series,
    summary: summarize({
      now,
      ...series,
      fbaOfferCount: p.stats?.offerCountFBA ?? null,
      buyBoxSellers,
      monthlySold: p.monthlySold ?? null,
    }),
  };
}

export class HttpKeepaClient implements KeepaClient {
  readonly available = true;
  readonly name = "keepa";
  constructor(private readonly key: string, private readonly fetchImpl: typeof fetch = fetch) {}

  async lookupByEans(eans: string[]): Promise<KeepaLookup> {
    const byEan = new Map<string, KeepaProduct[]>();
    let tokensUsed = 0;
    for (let i = 0; i < eans.length; i += 100) {
      const chunk = eans.slice(i, i + 100);
      const url = new URL("https://api.keepa.com/product");
      url.search = new URLSearchParams({
        key: this.key,
        domain: "2",
        code: chunk.join(","),
        stats: "365",
        history: "1",
        buybox: "1",
      }).toString();
      const res = await this.fetchImpl(url);
      const body = (await res.json()) as { products?: RawKeepaProduct[]; tokensConsumed?: number; error?: { message?: string } };
      if (!res.ok) throw new Error(`Keepa ${res.status}: ${body.error?.message ?? "request failed"}`);
      tokensUsed += body.tokensConsumed ?? 0;
      for (const raw of body.products ?? []) {
        const product = parseKeepaProduct(raw);
        for (const ean of chunk) {
          if (product.eans.some((e) => e.replace(/^0+/, "") === ean.replace(/^0+/, ""))) {
            byEan.set(ean, [...(byEan.get(ean) ?? []), product]);
          }
        }
      }
    }
    return { byEan, tokensUsed };
  }
}

/** Stub unless KEEPA_API_KEY looks like a real key (64 alphanumerics). */
export function getKeepa(env: NodeJS.ProcessEnv = process.env): KeepaClient {
  const key = env.KEEPA_API_KEY?.trim();
  if (env.KEEPA_MODE === "stub" || !key || !/^[a-z0-9]{64}$/i.test(key)) return new StubKeepaClient();
  return new HttpKeepaClient(key);
}
