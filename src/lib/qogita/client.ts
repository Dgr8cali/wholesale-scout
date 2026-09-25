/**
 * Qogita buyer API (https://api.qogita.com; the "internal" endpoints behind the web app).
 *
 * Auth: POST /auth/login/ returns a JWT that lasts about five minutes. It's cached per
 * process, renewed a minute before it expires, and renewed once on any 401.
 * Rate limits: a 429 carries Retry-After (seconds); we wait that long and retry.
 *
 * Found by probing, where the docs disagree: product search honours snake_case
 * `category_name` (a leaf category, repeatable) and `brand_name` (repeatable), not the
 * documented camelCase names; it has no price, delivery or MOV filters; `next` links come
 * back as http://. Prices are per piece in the account currency; `unit` is the case size;
 * `estimatedDeliveryTime` is in weeks. Offers take `max_mov_filter` and
 * `max_estimated_delivery_time_filter`.
 */

const QOGITA_API = "https://api.qogita.com";

export interface Money { amount: string; currency: string }

export interface QogitaProduct {
  availability: "in_stock" | "out_of_stock";
  gtin: string;
  name: string;
  brand: string | null;
  category: string | null;
  imageUrl?: string | null;
  productUrl: string;
  price?: Money;
  unit?: number;
  inventory?: number;
  offerCount?: number;
  totalInventory?: number;
  isPreOrder?: boolean;
  estimatedDeliveryTime?: number | null;
}

export interface QogitaCategory { name: string; slug: string; path: string[] }

export interface QogitaTier { tierPrice: Money; tierMov: Money; movProgress?: string; isActive?: boolean }
export interface QogitaOffer {
  qid: string;
  unit: number;
  inventory: number;
  seller: string;
  estimatedDeliveryTime: number | null;
  minExpectedDeliveryTime?: number | null;
  maxExpectedDeliveryTime?: number | null;
  quantityInCart?: number;
  isTopSeller?: boolean;
  tieredPrices: QogitaTier[];
}

export interface QogitaAllocation {
  qid: string;
  fid: string;
  mov: Money;
  subtotal: Money;
  movProgress: string;
  isMovMet?: boolean;
  estimatedDeliveryTime?: number | null;
}
export interface QogitaAllocationLine {
  qid: string;
  offerQid?: string;
  quantity: number;
  [k: string]: unknown;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** The variant FID is the 32-hex segment of a product link: /products/<fid>/<slug>/. */
export function variantFid(productUrl: string | null | undefined): string | null {
  return productUrl?.match(/\/products\/([0-9a-f]{32})(?:\/|$)/i)?.[1] ?? null;
}

export class QogitaError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

// One token per process, shared by every client instance (each request builds a client).
let tokenCache: { token: string; exp: number; email: string } | null = null;
let loginInFlight: Promise<string> | null = null;

export class QogitaClient {
  constructor(
    private readonly email: string,
    private readonly password: string,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
    private readonly log: (msg: string) => void = (m) => console.log(m),
  ) {}

  private async login(force = false): Promise<string> {
    if (!force && tokenCache && tokenCache.email === this.email && tokenCache.exp - Date.now() > 60_000) return tokenCache.token;
    // Concurrent requests share one login.
    loginInFlight ??= (async () => {
      const res = await this.fetchImpl(`${QOGITA_API}/auth/login/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: this.email, password: this.password }),
      });
      const body = (await res.json().catch(() => ({}))) as { accessToken?: string; accessExp?: number; message?: string };
      if (!res.ok || !body.accessToken) throw new QogitaError(`Qogita login failed (${res.status}): ${body.message ?? "check QOGITA_EMAIL and QOGITA_PASSWORD"}`, res.status);
      tokenCache = { token: body.accessToken, exp: body.accessExp ?? Date.now() + 4 * 60_000, email: this.email };
      return body.accessToken;
    })().finally(() => { loginInFlight = null; });
    return loginInFlight;
  }

  /** A JSON request with auth, one re-login on 401, and Retry-After on 429. */
  async request<T>(pathOrUrl: string, init: { method?: string; json?: unknown } = {}): Promise<T> {
    const url = pathOrUrl.startsWith("http") ? pathOrUrl.replace(/^http:\/\//, "https://") : `${QOGITA_API}${pathOrUrl}`;
    let relogged = false;
    for (let attempt = 0; ; attempt++) {
      const token = await this.login();
      const res = await this.fetchImpl(url, {
        method: init.method ?? "GET",
        headers: { Authorization: `Bearer ${token}`, ...(init.json !== undefined ? { "content-type": "application/json" } : {}) },
        body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
      });
      if (res.status === 401 && !relogged) {
        relogged = true;
        await this.login(true);
        continue;
      }
      if (res.status === 429 && attempt < 6) {
        const wait = Math.min(120, Math.max(1, Number(res.headers.get("retry-after")) || 5));
        this.log(`[qogita] 429 on ${new URL(url).pathname}; waiting ${wait}s`);
        await this.sleep(wait * 1000);
        continue;
      }
      if (res.status === 204) return undefined as T;
      const text = await res.text();
      let body: unknown = null;
      try { body = text ? JSON.parse(text) : null; } catch { body = text; }
      if (!res.ok) {
        const msg = (body as { message?: string; detail?: string } | null)?.message ?? (body as { detail?: string } | null)?.detail ?? String(text).slice(0, 200);
        throw new QogitaError(`Qogita ${init.method ?? "GET"} ${new URL(url).pathname} failed (${res.status}): ${msg}`, res.status);
      }
      return body as T;
    }
  }

  /** In-stock products for these leaf categories and brands, page by page (500 a page). */
  async *products(q: { categoryNames?: string[]; brandNames?: string[]; gtin?: string }): AsyncGenerator<{ count: number; results: QogitaProduct[] }> {
    const p = new URLSearchParams({ stockAvailability: "in_stock", page_size: "500" });
    for (const c of q.categoryNames ?? []) p.append("category_name", c);
    for (const b of q.brandNames ?? []) p.append("brand_name", b);
    if (q.gtin) p.set("gtin", q.gtin);
    let next: string | null = `/public/buyers/products/?${p}`;
    while (next) {
      const page: { count: number; next: string | null; results: QogitaProduct[] } = await this.request(next);
      yield { count: page.count, results: page.results ?? [] };
      next = page.next;
    }
  }

  /** Every category (the API lists leaves with their full path), 20 a page. */
  async categories(): Promise<QogitaCategory[]> {
    const out: QogitaCategory[] = [];
    let next: string | null = "/categories/?page_size=100";
    while (next) {
      const page: { next: string | null; results: QogitaCategory[] } = await this.request(next);
      out.push(...page.results.map((c) => ({ name: c.name, slug: c.slug, path: c.path })));
      next = page.next;
    }
    return out;
  }

  /** A brand by its slug ("La Roche-Posay" → "la-roche-posay"); null when Qogita has none. */
  async brandBySlug(slug: string): Promise<{ name: string; slug: string; variantCount?: number } | null> {
    try {
      const page: { results: { name: string; slug: string; variantCount?: number }[] } = await this.request(`/brands/?slug=${encodeURIComponent(slug)}`);
      return page.results?.[0] ?? null;
    } catch (e) {
      // An unknown slug is a 400 "Invalid Brand Slug(s)".
      if (e instanceof QogitaError && e.status === 400) return null;
      throw e;
    }
  }

  /** Every offer for a variant, and how many Qogita left out for the MOV or delivery limit. */
  async variantOffers(fid: string, f: { maxMov?: number | null; maxWeeks?: number | null } = {}): Promise<{ offers: QogitaOffer[]; excluded: number }> {
    const p = new URLSearchParams();
    if (f.maxMov != null) p.set("max_mov_filter", String(f.maxMov));
    if (f.maxWeeks != null) p.set("max_estimated_delivery_time_filter", String(f.maxWeeks));
    const body: { offers: QogitaOffer[]; numberOfExcludedOffers?: number } = await this.request(`/buyers/variants/${fid}/offers/${p.size ? `?${p}` : ""}`);
    return { offers: body.offers ?? [], excluded: body.numberOfExcludedOffers ?? 0 };
  }

  // Cart: allocations (one per supplier) hold allocation lines.
  async allocations(): Promise<QogitaAllocation[]> {
    return (await this.request<{ results: QogitaAllocation[] }>("/buyers/carts/active/allocations/")).results ?? [];
  }
  async allocationLines(allocationFid: string): Promise<QogitaAllocationLine[]> {
    return (await this.request<{ results: QogitaAllocationLine[] }>(`/buyers/carts/active/allocations/${allocationFid}/lines/`)).results ?? [];
  }
  async addLine(offerQid: string, quantity: number): Promise<unknown> {
    return this.request("/carts/active/lines/", { method: "POST", json: { offerQid, quantity } });
  }
  async updateLine(allocationQid: string, lineQid: string, quantity: number): Promise<unknown> {
    return this.request(`/carts/active/allocations/${allocationQid}/lines/${lineQid}/`, { method: "PATCH", json: { quantity } });
  }
  async deleteLine(allocationQid: string, lineQid: string): Promise<void> {
    await this.request(`/carts/active/allocations/${allocationQid}/lines/${lineQid}/`, { method: "DELETE" });
  }
}

/** The configured client, or null when QOGITA_EMAIL / QOGITA_PASSWORD aren't set. */
export function getQogita(): QogitaClient | null {
  const email = process.env.QOGITA_EMAIL, password = process.env.QOGITA_PASSWORD;
  return email && password ? new QogitaClient(email, password) : null;
}

/** For tests: forget the cached token. */
export function __resetQogitaToken() {
  tokenCache = null;
  loginInFlight = null;
}
