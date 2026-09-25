import "server-only";
import { SCAN_CAP } from "../check/seller";
import type { RunStats } from "../eta";
import type { ColumnMapping, NormalizedRow } from "../ingest/mapping";
import { getKeepa } from "../keepa/client";
import { addDailyTokens } from "../keepaLedger";
import { brandKey } from "../brands";
import { chunks, db, loadProfile, must } from "./db";
import { ingest } from "./ingest";

const DAY = 86_400_000;
/** A storefront list is reused for this long before Keepa is asked again. */
export const STOREFRONT_TTL_MS = 7 * DAY;
/** What Keepa charges for a storefront: 1 for the seller, 9 for its ASIN list. */
export const STOREFRONT_TOKENS = 10;
/** Keepa tokens per ASIN: history for every row, and the Buy Box data for rows that pass every other gate. */
const HISTORY_TOKENS = 1;
const BUYBOX_TOKENS = 3;

interface SellerRow {
  seller_id: string;
  name: string | null;
  business_name: string | null;
  rating_pct: number | null;
  rating_count: number | null;
  storefront_size: number | null;
  brands: { brand: string; count: number }[] | null;
  buy_box_ownership_pct: number | null;
  asin_list: string[] | null;
  asin_total: number | null;
  storefront_fetched_at: string | null;
  storefront_unbilled_tokens: number | null;
  last_scan_run_id: string | null;
  last_scan_at: string | null;
}

const fresh = (s: SellerRow | null) => !!s?.storefront_fetched_at && Date.now() - Date.parse(s.storefront_fetched_at) < STOREFRONT_TTL_MS && !!s.asin_list;

async function stored(sellerId: string): Promise<SellerRow | null> {
  return must(await db().from("keepa_sellers").select("*").eq("seller_id", sellerId).maybeSingle(), "seller") as SellerRow | null;
}

/**
 * The seller's storefront: from the 7-day cache, or (with `lookup`) from Keepa for 10 tokens.
 * Null when it isn't cached and `lookup` wasn't allowed.
 */
export async function storefront(sellerId: string, lookup: boolean): Promise<{ seller: SellerRow; cached: boolean } | null> {
  const cur = await stored(sellerId);
  if (fresh(cur)) return { seller: cur!, cached: true };
  if (!lookup) return null;
  const keepa = getKeepa();
  if (!keepa.available || !keepa.storefront) throw new Error("Keepa isn't set up (KEEPA_API_KEY)");
  const sf = await keepa.storefront(sellerId);
  if (!sf) throw new Error(`Keepa doesn't know seller ${sellerId} on Amazon UK`);
  const p = sf.profile;
  const row = {
    seller_id: sellerId, name: p.name, business_name: sf.businessName, rating_pct: p.ratingPct, rating_count: p.ratingCount,
    storefront_size: p.storefrontSize, brands: p.brands, buy_box_ownership_pct: sf.buyBoxOwnershipPct, fetched_at: new Date().toISOString(),
    asin_list: sf.asins, asin_total: sf.asins.length, storefront_fetched_at: new Date().toISOString(),
    storefront_unbilled_tokens: (cur?.storefront_unbilled_tokens ?? 0) + sf.tokensUsed,
  };
  const saved = must(await db().from("keepa_sellers").upsert(row, { onConflict: "seller_id" }).select("*").single(), "seller") as SellerRow;
  return { seller: saved, cached: false };
}

export interface SellerSummary {
  sellerId: string;
  name: string | null;
  businessName: string | null;
  ratingPct: number | null;
  ratingCount: number | null;
  storefrontSize: number | null;
  buyBoxOwnershipPct: number | null;
  /** Largest brands on the storefront, by listing count. */
  brands: { brand: string; count: number }[];
  fetchedAt: string | null;
  lastScan: { runId: string; at: string | null } | null;
}

const summary = (s: SellerRow): SellerSummary => ({
  sellerId: s.seller_id, name: s.name, businessName: s.business_name, ratingPct: s.rating_pct, ratingCount: s.rating_count,
  storefrontSize: s.storefront_size, buyBoxOwnershipPct: s.buy_box_ownership_pct, brands: (s.brands ?? []).slice(0, 10),
  fetchedAt: s.storefront_fetched_at, lastScan: s.last_scan_run_id ? { runId: s.last_scan_run_id, at: s.last_scan_at } : null,
});

export interface ScanPreview {
  seller: SellerSummary;
  /** The list came from the 7-day cache: looking it up again costs nothing. */
  cached: boolean;
  asins: { total: number; scanned: number; more: number };
  /** Keepa tokens the scan will spend. */
  tokens: {
    /** Charged for the storefront lookup, not yet on any run. */
    storefront: number;
    /** History for ASINs without a snapshot inside the profile's max age (1 each). */
    history: number;
    /** Up to this much more for the Buy Box data of rows that pass every other gate (3 each). */
    buyBoxEach: number;
    /** ASINs whose history is already fresh (no tokens). */
    fresh: number;
  };
  /** Keepa's balance now (free to ask). */
  tokensLeft: number | null;
}

/**
 * What a scan would screen and cost. Without `lookup`, only a cached storefront is used (null
 * otherwise): the page asks before spending the 10 tokens of a lookup.
 */
export async function scanPreview(sellerId: string, opts: { lookup: boolean; profileId?: string | null }): Promise<ScanPreview | null> {
  const sf = await storefront(sellerId, opts.lookup);
  if (!sf) return null;
  const list = sf.seller.asin_list ?? [];
  const scanned = list.slice(0, SCAN_CAP);
  const profile = await loadProfile(opts.profileId);
  const since = new Date(Date.now() - Math.max(0, profile.config.keepaMaxAgeDays ?? 7) * DAY).toISOString();
  const have = new Set<string>();
  for (const c of chunks(scanned, 200)) {
    const rows = must(await db().from("keepa_snapshots").select("asin").in("asin", c).gte("fetched_at", since), "snapshots") as { asin: string }[];
    for (const r of rows) have.add(r.asin);
  }
  const keepa = getKeepa();
  const status = keepa.available ? await keepa.tokenStatus().catch(() => null) : null;
  return {
    seller: summary(sf.seller),
    cached: sf.cached,
    asins: { total: list.length, scanned: scanned.length, more: Math.max(0, list.length - scanned.length) },
    tokens: {
      storefront: sf.seller.storefront_unbilled_tokens ?? 0,
      history: (scanned.length - have.size) * HISTORY_TOKENS,
      buyBoxEach: BUYBOX_TOKENS,
      fresh: have.size,
    },
    tokensLeft: status?.tokensLeft ?? null,
  };
}

/**
 * Scan a seller: its storefront's ASINs (up to 2,000) become a run exactly like Check ASINs
 * with no cost. Products are created by ASIN; the catalog is read as the run goes.
 */
export async function startScan(sellerId: string, profileId?: string | null): Promise<{ runId: string; asins: number; more: number }> {
  const sf = await storefront(sellerId, true);
  const s = sf!.seller;
  const list = s.asin_list ?? [];
  if (!list.length) throw new Error(`Keepa lists no ASINs on ${s.name ?? sellerId}'s storefront`);
  const asins = list.slice(0, SCAN_CAP);
  const d = db();

  // One product per ASIN: an existing one (any EAN), else one known by its ASIN only.
  const products = new Map<string, { id: string; ean: string; title: string | null }>();
  for (const c of chunks(asins, 200)) {
    const rows = must(await d.from("products").select("id, ean, asin, title").in("asin", c), "products") as { id: string; ean: string; asin: string; title: string | null }[];
    for (const r of rows) if (!products.has(r.asin)) products.set(r.asin, r);
  }
  const missing = asins.filter((a) => !products.has(a));
  for (const c of chunks(missing, 500)) {
    const rows = must(await d.from("products").insert(c.map((a) => ({ ean: a, asin: a }))).select("id, ean, asin, title"), "insert products") as { id: string; ean: string; asin: string; title: string | null }[];
    for (const r of rows) products.set(r.asin, r);
  }

  const rows: NormalizedRow[] = asins.map((a, i) => {
    const p = products.get(a)!;
    return {
      ean: p.ean, productId: p.id, unitCost: 0, unitCostGbp: 0, costKnown: false, packUnits: 1, moq: 1, stock: null,
      // The listing's own title: its pack is the listing's, so nothing is scaled.
      title: p.title, brand: null, category: null, sourceRow: i + 1, eanValid: true,
    };
  });
  const name = `Seller scan · ${s.name ?? sellerId}`;
  const scan: NonNullable<RunStats["scan"]> = { sellerId, sellerName: s.name, asins: asins.length, more: list.length - asins.length };
  const { runId } = await ingest({
    profileId,
    name,
    stats: { scan },
    files: [{
      fileName: name,
      supplier: { name: "Manual", vatBasis: "ex_vat", vatRate: 20, currency: "GBP" },
      keepSupplier: true,
      sourceType: "manual",
      headers: [],
      fingerprint: "",
      mapping: { headerRow: 0, columns: {}, pricePer: "unit" } as unknown as ColumnMapping,
      fx: { rate: 1, date: new Date().toISOString().slice(0, 10) },
      rows,
    }],
  });

  // The storefront lookup's tokens go on this run, so the Keepa totals include them.
  const unbilled = s.storefront_unbilled_tokens ?? 0;
  if (unbilled > 0) {
    const run = must(await d.from("runs").select("token_cost, stats").eq("id", runId).single(), "run") as { token_cost: number; stats: RunStats };
    const stages = { history: 0, buyBox: 0, lookup: 0, sellers: 0, ...(run.stats.keepaStages ?? {}) };
    stages.sellers += unbilled;
    must(await d.from("runs").update({
      token_cost: (run.token_cost ?? 0) + unbilled,
      stats: { ...run.stats, keepaByDay: addDailyTokens(run.stats.keepaByDay, unbilled), keepaStages: stages },
    }).eq("id", runId), "run tokens");
  }
  must(await d.from("keepa_sellers").update({ last_scan_run_id: runId, last_scan_at: new Date().toISOString(), storefront_unbilled_tokens: 0 }).eq("seller_id", sellerId), "seller");
  return { runId, asins: asins.length, more: scan.more };
}

export interface ScannedSeller extends SellerSummary {
  asins: number;
  /** The last scan's results. */
  results: { pass: number; warn: number; fail: number; pending: number; holdsBuyBox: number } | null;
}

/** Sellers whose storefront has been scanned, newest scan first, with how the last scan came out. */
export async function scannedSellers(): Promise<ScannedSeller[]> {
  const d = db();
  const sellers = must(
    await d.from("keepa_sellers").select("*").not("storefront_fetched_at", "is", null).order("last_scan_at", { ascending: false, nullsFirst: false }).limit(200),
    "sellers",
  ) as SellerRow[];
  const out: ScannedSeller[] = [];
  for (const s of sellers) {
    let results: ScannedSeller["results"] = null;
    if (s.last_scan_run_id) {
      const rows = must(
        await d.from("results").select("status, verdict, bb:inputs->market->>buyBoxSellerId").eq("run_id", s.last_scan_run_id),
        "results",
      ) as { status: string; verdict: string | null; bb: string | null }[];
      results = { pass: 0, warn: 0, fail: 0, pending: 0, holdsBuyBox: 0 };
      for (const r of rows) {
        if (r.status === "pending") results.pending++;
        else if (r.verdict === "pass" || r.verdict === "warn" || r.verdict === "fail") results[r.verdict]++;
        if (r.bb === s.seller_id) results.holdsBuyBox++;
      }
    }
    let brands = s.brands ?? [];
    // No brand breakdown from Keepa: count the scanned products' brands instead.
    if (!brands.length && s.asin_list?.length) brands = await brandMix(s.asin_list.slice(0, SCAN_CAP));
    out.push({ ...summary({ ...s, brands }), asins: s.asin_total ?? s.asin_list?.length ?? 0, results });
  }
  return out;
}

async function brandMix(asins: string[]): Promise<{ brand: string; count: number }[]> {
  const counts = new Map<string, { brand: string; count: number }>();
  for (const c of chunks(asins, 200)) {
    const rows = must(await db().from("products").select("asin, brand").in("asin", c).not("brand", "is", null), "brands") as { brand: string }[];
    for (const r of rows) {
      const k = brandKey(r.brand);
      if (!k) continue;
      const cur = counts.get(k) ?? { brand: r.brand, count: 0 };
      cur.count++;
      counts.set(k, cur);
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 10);
}
