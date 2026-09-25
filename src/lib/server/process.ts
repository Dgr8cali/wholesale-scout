import "server-only";
import { brandKey } from "../brands";
import { computeFees, referralCategoryFor } from "../fees/engine";
import type { RateCard } from "../fees/rateCard";
import { getKeepa, type KeepaProduct, type KeepaResponseMeta, type KeepaSummary, type OnKeepaResponse, type SellerProfile } from "../keepa/client";
import { trimSeries } from "../keepa/summarize";
import { GATE_ORDER, withDefaults, type GateId, type ProfileConfig } from "../screening/config";
import { resolveScoringPrice, runGates, verdictOf, type GateRun, type MarketData, type ScreenContext, type SellerView } from "../screening/gates";
import type { CategoryRule } from "../screening/rules";
import { winScore } from "../screening/score";
import { getSpApi, type CatalogMatch, type CompetitivePrice, type LookupTrace } from "../spapi/client";
import { activeRateCard, chunks, db, loadProfile, loadRules, must } from "./db";

const DAY = 86_400_000;
const CATALOG_TTL = 7 * DAY;
const KEEPA_TTL = DAY;

interface Product {
  id: string;
  ean: string;
  asin: string | null;
  title: string | null;
  brand: string | null;
  category: string | null;
  referral_category: string | null;
  dims_cm: { l: number; w: number; h: number } | null;
  weight_g: number | null;
  parent_asin: string | null;
  variation_count: number | null;
  sales_rank: number | null;
  compliance_flags: unknown;
  catalog_updated_at: string | null;
  keepa_updated_at: string | null;
}

interface Offer {
  id: string;
  product_id: string;
  supplier_id: string;
  unit_cost_gbp: number;
  fx_rate: number;
  moq: number | null;
  title: string | null;
  brand: string | null;
  category: string | null;
  [k: string]: unknown;
}

interface Supplier {
  id: string;
  name: string;
  vat_rate: number;
  mov: number | null;
  delivery_days: number | null;
  rating: number | null;
}

/** How far a row's data collection got: row text only, matched and priced, account checked. */
type Stage = "row" | "enriched" | "account";
const STAGE_RANK: Record<Stage, number> = { row: 0, enriched: 1, account: 2 };

/** What a result was screened on, stored so Re-screen can re-run gates without fetching. */
export interface StoredInputs {
  v: 1;
  stage: Stage;
  match: ScreenContext["match"];
  market: MarketData | null;
  hazmat: string[];
  restriction: ScreenContext["restriction"];
  /** Amazon's fee estimate and the sell price it was quoted at. */
  amazonFees: { price: number; referral: number; fba: number } | null;
  /** How the EAN was resolved: attempts, and the raw response when it missed. */
  lookup?: LookupTrace | null;
  /** Top Buy Box sellers with their Keepa profiles (rows that passed every gate). */
  sellers?: SellerView[] | null;
  notes: string[];
}

interface Row {
  resultId: string;
  product: Product;
  offer: Offer;
  supplier: Supplier;
  stage: Stage;
  match: ScreenContext["match"];
  market: MarketData | null;
  hazmat: string[];
  restriction: ScreenContext["restriction"];
  amazonFees: StoredInputs["amazonFees"];
  lookup: LookupTrace | null;
  sellers: SellerView[] | null;
  /** Lookup notes that belong to the row's data (kept across re-screens). */
  dataNotes: string[];
  /** Notes about this screening pass only. */
  notes: string[];
}

const FRESH = (ts: string | null, ttl: number) => !!ts && Date.now() - Date.parse(ts) < ttl;

function marketFromKeepa(s: KeepaSummary): MarketData {
  return { hasHistory: true, ...s };
}

function marketFromSpApi(p: CompetitivePrice | undefined, rank: number | null): MarketData | null {
  if (!p && rank == null) return null;
  return {
    hasHistory: false,
    historyDays: null,
    rankNow: p?.salesRank ?? rank,
    rankDrops30d: null,
    monthlySold: null,
    avgRank90d: null,
    rankTrendPct12m: null,
    currentBuyBox: p?.buyBox ?? null,
    medianBuyBox12m: null,
    bbSlopePctYr: null,
    bbVolatilityPct: null,
    offersNow: p?.newOffers ?? null,
    offers90dAgo: null,
    fbaOffers: null,
    amazonLastSeenDays: null,
    topSellerBbSharePct: null,
    reviewJumpPct: null,
    youngerThanParent: null,
  };
}

/** Package size for the fee engine: the SP-API catalog's, else Keepa's, else none (tier assumed). */
function size(p: Product, m: MarketData | null): Pick<ScreenContext["product"], "dimsCm" | "weightG" | "dimsSource"> {
  const weight = p.weight_g == null ? null : Number(p.weight_g);
  if (p.dims_cm && weight != null) return { dimsCm: p.dims_cm, weightG: weight, dimsSource: "catalog" };
  const dims = p.dims_cm ?? m?.packageDims ?? null;
  const w = weight ?? m?.packageWeightG ?? null;
  if (dims && w != null) return { dimsCm: dims, weightG: w, dimsSource: "keepa" };
  return { dimsCm: dims, weightG: w, dimsSource: null };
}

/**
 * Amazon's fee applies only at the price it was quoted for; at any other scoring price
 * (a changed profile rule, say) the rate card is used instead.
 */
function feesAt(row: Row, cfg: ProfileConfig): ScreenContext["amazonFees"] {
  const f = row.amazonFees;
  if (!f) return null;
  const price = resolveScoringPrice(row.market, cfg).price;
  return price != null && Math.abs(price - f.price) < 0.005 ? { referral: f.referral, fba: f.fba } : null;
}

function context(row: Row, card: RateCard, rules: CategoryRule[], cfg: ProfileConfig, approved: Approved): ScreenContext {
  const p = row.product, o = row.offer, s = row.supplier;
  return {
    brandApproval: approved.get(brandKey(p.brand ?? o.brand)) ?? null,
    now: new Date(),
    card,
    rules,
    text: [o.title, o.brand, o.category, p.title].filter(Boolean).join(" · "),
    sheet: { brand: o.brand, title: o.title },
    listing: row.match?.asin ? { brand: p.brand, title: p.title } : undefined,
    amazonCategory: p.category,
    offer: {
      unitCostGbp: Number(o.unit_cost_gbp),
      moq: o.moq,
      goodsVatRatePct: Number(s.vat_rate),
      supplierMovGbp: s.mov == null ? null : Number(s.mov) * Number(o.fx_rate),
    },
    match: row.match,
    product: {
      brand: p.brand ?? o.brand,
      referralCategory: p.referral_category ?? referralCategoryFor(p.category, card),
      ...size(p, row.market),
      keepaDims: row.market?.packageDims ?? null,
      keepaWeightG: row.market?.packageWeightG ?? null,
      // Keepa knows the whole variation family; the catalog only lists a parent's children.
      variationCount: row.market?.variationCount ?? p.variation_count,
      hazmat: row.hazmat,
    },
    sellers: row.sellers ?? undefined,
    market: row.market,
    restriction: row.restriction,
    amazonFees: feesAt(row, cfg),
  };
}

const r2 = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100);

/**
 * Referral and FBA fee at the scoring price, ex-VAT and ex-DSF, from each source that has
 * one: Amazon's estimate (SP-API), Keepa's, and the rate card.
 */
function feeComparison(price: number, ctx: ScreenContext, cfg: ProfileConfig) {
  const item = { referralCategory: ctx.product.referralCategory, dimsCm: ctx.product.dimsCm, weightG: ctx.product.weightG, goodsVatRatePct: ctx.offer.goodsVatRatePct };
  const card = computeFees(price, item, ctx.card, cfg.fees, { date: ctx.now });
  const m = ctx.market;
  return {
    amazon: ctx.amazonFees ? { referral: r2(ctx.amazonFees.referral), fba: r2(ctx.amazonFees.fba) } : null,
    keepa: m?.fbaFee != null || m?.referralFeePct != null
      ? {
          referral: m?.referralFeePct != null ? r2(Math.max((price * m.referralFeePct) / 100, ctx.card.referral.minimumFee)) : null,
          fba: m?.fbaFee ?? null,
        }
      : null,
    rateCard: { referral: r2(card.referralBase), fba: r2(card.fbaBase), tier: card.tier?.name ?? null },
  };
}

async function finalize(row: Row, run: GateRun, cfg: ProfileConfig, ctx: ScreenContext) {
  const w = winScore(ctx, run, cfg, { deliveryDays: row.supplier.delivery_days, supplierRating: row.supplier.rating });
  const e = run.economics;
  const notes = [...row.dataNotes, ...row.notes];
  if (row.amazonFees && !ctx.amazonFees && e && run.outcomes.some((o) => o.gate === "fees")) {
    notes.push(`Amazon's fee was quoted at £${row.amazonFees.price.toFixed(2)}; rate card used at £${e.price.toFixed(2)}.`);
  }
  const why = notes.length ? `${w.why} ${notes.join(" ")}` : w.why;
  const inputs: StoredInputs = {
    v: 1, stage: row.stage, match: row.match, market: row.market, hazmat: row.hazmat,
    restriction: row.restriction, amazonFees: row.amazonFees, lookup: row.lookup, sellers: row.sellers, notes: row.dataNotes,
  };
  must(
    await db().from("results").update({
      status: "done",
      verdict: verdictOf(run.outcomes),
      failed_gate: run.failedGate,
      gate_outcomes: run.outcomes,
      fees: e ? {
        source: e.fees.source,
        referralCategory: e.fees.referralCategory,
        referralPct: e.fees.referralPct,
        referral: r2(e.fees.referral),
        fba: r2(e.fees.fba),
        storage: r2(e.fees.storage),
        returns: r2(e.fees.returns),
        total: r2(e.fees.totalFees),
        tier: e.fees.tier?.name ?? null,
        fbaSource: e.fees.fbaSource,
        dimsEstimated: e.fees.dimsEstimated,
        dimsSource: ctx.product.dimsSource ?? null,
        outputVat: r2(e.outputVat),
        compare: feeComparison(e.price, ctx, cfg),
      } : null,
      sell_price: r2(run.scoringPrice),
      price_source: run.priceSource,
      landed_cost: e ? Math.round(e.landed.total * 10000) / 10000 : null,
      profit: e?.profit ?? null,
      roi: e?.roi ?? null,
      margin: e?.margin ?? null,
      hurdle_price: run.hurdlePrice,
      score: w.score,
      group_scores: Object.fromEntries(Object.entries(w.groups).map(([k, g]) => [k, g.score == null ? null : Math.round(g.score)])),
      why,
      band: w.band,
      inputs,
      error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", row.resultId),
    "save result",
  );
  if (run.ruleMatches.length) {
    must(await db().from("products").update({ compliance_flags: run.ruleMatches }).eq("id", row.product.id), "flags");
  }
}

type Approved = Map<string, { status: "approved"; date: string | null }>;

/** Brands recorded as approved on the Brands page, by normalised brand key. */
async function approvedBrands(): Promise<Approved> {
  const rows = must(await db().from("brand_approvals").select("brand_key, status_date").eq("status", "approved"), "brand approvals") as
    { brand_key: string; status_date: string | null }[];
  return new Map(rows.map((r) => [r.brand_key, { status: "approved", date: r.status_date }]));
}

/** Latest Keepa summary per ASIN fetched in the last 24 hours. */
async function freshSnapshots(asins: string[]): Promise<Map<string, KeepaSummary>> {
  const out = new Map<string, KeepaSummary>();
  const since = new Date(Date.now() - KEEPA_TTL).toISOString();
  for (const c of chunks([...new Set(asins)])) {
    const snaps = must(
      await db().from("keepa_snapshots").select("asin, fetched_at, summary").in("asin", c).gte("fetched_at", since).order("fetched_at", { ascending: false }),
      "snapshots",
    ) as { asin: string; summary: KeepaSummary }[];
    for (const x of snaps) if (!out.has(x.asin)) out.set(x.asin, x.summary);
  }
  return out;
}

/** Keep what the gates read: the last ~15 months (a year, plus the 90 days before it for rank trend). */
const SNAPSHOT_DAYS = 460;

/** A write refused because the table or column isn't there yet (a migration not yet run). */
const schemaMissing = (msg: string) => /does not exist|could not find the .* (column|table)|schema cache/i.test(msg);

async function saveSnapshot(k: KeepaProduct): Promise<void> {
  const since = Date.now() - SNAPSHOT_DAYS * DAY;
  const base = {
    asin: k.asin,
    rank_series: trimSeries(k.series.rank, since),
    buybox_series: trimSeries(k.series.buyBox, since),
    new_series: trimSeries(k.series.newPrice, since),
    offer_count_series: trimSeries(k.series.offerCount, since),
    amazon_series: trimSeries(k.series.amazon, since),
    review_count_series: trimSeries(k.series.reviewCount, since),
    summary: k.summary,
  };
  const extras = {
    monthly_sold: k.summary.monthlySold ?? null,
    keepa_rank_drops_30d: k.summary.keepaRankDrops30 ?? null,
    package: k.dimsCm || k.weightG ? { ...(k.dimsCm ?? {}), weight_g: k.weightG } : null,
    fba_fee: k.summary.fbaFee ?? null,
    referral_fee_pct: k.summary.referralFeePct ?? null,
    variation_count: k.variationCount,
    buybox_seller_history: k.buyBoxSellers.filter(([t], i, all) => t >= Date.now() - 365 * DAY || all[i + 1]?.[0] >= Date.now() - 365 * DAY),
  };
  let res = await db().from("keepa_snapshots").insert({ ...base, ...extras });
  if (res.error && schemaMissing(res.error.message)) {
    // Extra columns not migrated yet: store the snapshot without them (the summary carries them).
    console.error(`[keepa] snapshot extras not stored (run migration 20260926000300): ${res.error.message}`);
    res = await db().from("keepa_snapshots").insert(base);
  }
  if (res.error) throw new Error(res.error.message);
}

/** Add Keepa's tokensConsumed to the run's total straight away, so a later failure can't lose it. */
async function addRunTokens(runId: string, tokens: number): Promise<void> {
  if (!tokens) return;
  const d = db();
  const cur = must(await d.from("runs").select("token_cost").eq("id", runId).single(), "run tokens") as { token_cost: number };
  must(await d.from("runs").update({ token_cost: (cur.token_cost ?? 0) + tokens }).eq("id", runId), "run tokens");
}

/**
 * Keepa history for rows with an ASIN. Never re-fetches an ASIN with a snapshot under
 * 24 hours old. New snapshots are stored one ASIN at a time before any gate runs; if a
 * store fails, the fetched data is still used and the failure is logged and noted.
 */
async function attachKeepa(rows: Row[], alreadyFetched: Map<string, KeepaProduct>, onResponse: OnKeepaResponse): Promise<Map<string, KeepaSummary>> {
  const keepa = getKeepa();
  const withAsin = rows.filter((r) => r.match?.asin);
  const asins = [...new Set(withAsin.map((r) => r.match!.asin!))];
  const summaries = await freshSnapshots(asins);
  const products = new Map<string, KeepaProduct>();
  for (const [asin, k] of alreadyFetched) if (!summaries.has(asin)) products.set(asin, k);

  const need = asins.filter((a) => !summaries.has(a) && !products.has(a));
  let exhausted: { refillInMs: number | null } | undefined;
  if (keepa.available && need.length) {
    try {
      const res = await keepa.lookupByAsins(need, onResponse);
      for (const [asin, k] of res.byAsin) products.set(asin, k);
      exhausted = res.exhausted;
    } catch (e) {
      for (const r of withAsin) if (need.includes(r.match!.asin!)) r.dataNotes.push(`Keepa lookup failed: ${(e as Error).message}.`);
    }
  }

  for (const [asin, k] of products) {
    try {
      await saveSnapshot(k);
    } catch (e) {
      console.error(`[keepa] storing snapshot for ${asin} failed: ${(e as Error).message}`);
      for (const r of withAsin) if (r.match!.asin === asin) r.dataNotes.push(`Keepa snapshot not stored: ${(e as Error).message}.`);
    }
    summaries.set(asin, k.summary);
  }
  if (products.size) {
    for (const c of chunks([...products.keys()])) {
      await db().from("products").update({ keepa_updated_at: new Date().toISOString() }).in("asin", c);
    }
  }
  if (exhausted) {
    const wait = exhausted.refillInMs != null ? ` (refill in ${Math.ceil(exhausted.refillInMs / 1000)}s)` : "";
    for (const r of withAsin) {
      if (!summaries.has(r.match!.asin!)) r.dataNotes.push(`Keepa out of tokens${wait}: history not checked. Re-screen after the refill.`);
    }
  }
  return summaries;
}

const SELLER_TTL = 7 * DAY;

/** The top Buy Box sellers this row would look up (by 365-day share). */
function wantedSellers(row: Row, cfg: ProfileConfig): { sellerId: string; sharePct: number }[] {
  return (row.market?.topSellers ?? []).slice(0, cfg.sellerLookup.topN);
}

/** Sellers need looking up: the row passed every gate, the lookup is on, and it hasn't been done. */
function needsSellers(row: Row, run: GateRun, cfg: ProfileConfig): boolean {
  return !run.failedGate && cfg.sellerLookup.enabled && !row.sellers && wantedSellers(row, cfg).length > 0;
}

/** Seller profiles from the cache (under 7 days old), then Keepa for the rest (1 token each). */
async function sellerProfiles(ids: string[], onResponse: OnKeepaResponse): Promise<{ profiles: Map<string, SellerProfile>; note: string | null }> {
  const d = db();
  const profiles = new Map<string, SellerProfile>();
  const since = new Date(Date.now() - SELLER_TTL).toISOString();
  for (const c of chunks([...new Set(ids)])) {
    const res = await d.from("keepa_sellers").select("*").in("seller_id", c).gte("fetched_at", since);
    if (res.error) {
      console.error(`[keepa] seller cache unavailable (run migration 20260926000300): ${res.error.message}`);
      break;
    }
    const cached = (res.data ?? []) as
      { seller_id: string; name: string | null; rating_pct: number | null; rating_count: number | null; storefront_size: number | null; brands: SellerProfile["brands"] }[];
    for (const x of cached) {
      profiles.set(x.seller_id, { sellerId: x.seller_id, name: x.name, ratingPct: x.rating_pct, ratingCount: x.rating_count, storefrontSize: x.storefront_size, brands: x.brands ?? [] });
    }
  }
  const need = [...new Set(ids)].filter((id) => !profiles.has(id));
  let note: string | null = null;
  const keepa = getKeepa();
  if (need.length && keepa.available) {
    try {
      const res = await keepa.lookupSellers(need, onResponse);
      for (const [id, p] of res.profiles) {
        profiles.set(id, p);
        const saved = await d.from("keepa_sellers").upsert({
          seller_id: id, name: p.name, rating_pct: p.ratingPct, rating_count: p.ratingCount,
          storefront_size: p.storefrontSize, brands: p.brands, fetched_at: new Date().toISOString(),
        }, { onConflict: "seller_id" });
        if (saved.error) console.error(`[keepa] storing seller ${id} failed: ${saved.error.message}`);
      }
      if (res.exhausted) note = "Keepa out of tokens: some seller profiles not looked up. Re-screen after the refill.";
    } catch (e) {
      note = `Seller lookup failed: ${(e as Error).message}.`;
    }
  }
  return { profiles, note };
}

/** A row's top sellers with profiles, and how much of each storefront is this product's brand. */
function sellerViews(row: Row, cfg: ProfileConfig, profiles: Map<string, SellerProfile>): SellerView[] {
  const brand = brandKey(row.product.brand ?? row.offer.brand);
  return wantedSellers(row, cfg).map(({ sellerId, sharePct }) => {
    const p = profiles.get(sellerId);
    // No brand breakdown from Keepa means unknown, not 0%.
    const count = brand && p?.brands.length ? p.brands.filter((b) => brandKey(b.brand) === brand).reduce((a, b) => a + b.count, 0) : null;
    return {
      sellerId, sharePct,
      name: p?.name ?? null, ratingPct: p?.ratingPct ?? null, ratingCount: p?.ratingCount ?? null,
      storefrontSize: p?.storefrontSize ?? null,
      brandSharePct: count != null && p?.storefrontSize ? Math.round((count / p.storefrontSize) * 1000) / 10 : null,
    };
  });
}

/** Run `fn` for a row; if it throws, mark that result as an error so the run can finish. */
async function safely(row: Row, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    await db().from("results").update({ status: "error", error: (e as Error).message, updated_at: new Date().toISOString() }).eq("id", row.resultId);
  }
}

/**
 * Gating needs checking when it never was, or when an approval-needed / blocked result was
 * stored before Amazon's "apply" links were kept (so the button can be shown).
 */
function needsRestrictionCheck(row: Row): boolean {
  const r = row.restriction;
  return !r || ((r.status === "approval_required" || r.status === "blocked") && r.links === undefined);
}

/** "search miss: tried a batch of 20, EAN 3264680023323, UPC …; Amazon returned no items". */
function missNote(trace: LookupTrace | undefined): string | undefined {
  if (!trace) return undefined;
  const tried = trace.attempts.map((a) => (a.code.startsWith("batch") ? `a ${a.code}` : `${a.identifiersType} ${a.code}`));
  return `search miss: tried ${tried.join(", ")}; Amazon returned no items`;
}

interface PendingRow {
  id: string;
  product_id: string;
  offer_id: string;
  inputs: StoredInputs | null;
}

/** Build rows from results, with their product, offer, supplier and any stored inputs. */
async function loadRows(results: PendingRow[]): Promise<Row[]> {
  const d = db();
  const byId = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
  const products: Product[] = [], offers: Offer[] = [], suppliers: Supplier[] = [];
  for (const c of chunks([...new Set(results.map((r) => r.product_id))])) {
    products.push(...(must(await d.from("products").select("*").in("id", c), "products") as Product[]));
  }
  for (const c of chunks([...new Set(results.map((r) => r.offer_id))])) {
    offers.push(...(must(await d.from("offers").select("*").in("id", c), "offers") as Offer[]));
  }
  for (const c of chunks([...new Set(offers.map((o) => o.supplier_id))])) {
    suppliers.push(...(must(await d.from("suppliers").select("*").in("id", c), "suppliers") as Supplier[]));
  }
  const P = byId(products), O = byId(offers), S = byId(suppliers);

  // How many ASINs each EAN has, from the products table. A row whose catalog data is fresh
  // skips the lookup, so without this it would count only its own ASIN and never reach the
  // multi-ASIN checks (doubtful match) — on a second upload, or on Re-screen of stored rows.
  const siblings = new Map<string, number>();
  for (const c of chunks([...new Set(products.map((p) => p.ean))])) {
    const rows = must(await d.from("products").select("ean, asin").in("ean", c), "sibling ASINs") as { ean: string; asin: string | null }[];
    for (const x of rows) if (x.asin) siblings.set(x.ean, (siblings.get(x.ean) ?? 0) + 1);
  }

  // A Keepa snapshot under 24 hours old beats stored market data without history.
  const keepaFresh = await freshSnapshots(products.map((p) => p.asin).filter((a): a is string => !!a));

  return results.map((r) => {
    const offer = O.get(r.offer_id)!;
    const product = P.get(r.product_id)!;
    const i = r.inputs?.v === 1 ? r.inputs : null;
    const snap = product.asin ? keepaFresh.get(product.asin) : undefined;
    const stored = i?.match ?? (product.asin ? { asin: product.asin, asinCount: 1, looked: true } : null);
    const match = stored?.asin ? { ...stored, asinCount: Math.max(stored.asinCount, siblings.get(product.ean) ?? 0) } : stored;
    return {
      resultId: r.id, product, offer, supplier: S.get(offer.supplier_id)!,
      stage: i?.stage ?? "row",
      match,
      market: snap && !i?.market?.hasHistory ? marketFromKeepa(snap) : i?.market ?? null,
      hazmat: i?.hazmat ?? [],
      restriction: i?.restriction ?? null,
      amazonFees: i?.amazonFees ?? null,
      lookup: i?.lookup ?? null,
      sellers: i?.sellers ?? null,
      dataNotes: i?.notes ?? [],
      notes: [],
    };
  });
}

/**
 * Re-run gates and score for every row of a run with the current profile, from the data
 * stored when it was screened: no Amazon or Keepa calls. Rows that never collected the
 * data a gate now needs (they stopped early last time, or were screened before inputs
 * were stored) go back to pending, and the processor fetches only what they lack.
 */
export async function rescreenRun(runId: string, profileId?: string | null): Promise<{ rescored: number; requeued: number }> {
  const d = db();
  const runRow = must(await d.from("runs").select("id, profile_id").eq("id", runId).single(), "run") as { id: string; profile_id: string | null };
  const profile = await loadProfile(profileId || runRow.profile_id);
  const cfg = profile.config;
  const [card, rules, approved] = await Promise.all([activeRateCard(), loadRules(), approvedBrands()]);

  const all: (PendingRow & { status: string })[] = [];
  for (let from = 0; ; from += 1000) {
    const page = must(
      await d.from("results").select("id, product_id, offer_id, inputs, status").eq("run_id", runId).range(from, from + 999),
      "results",
    ) as (PendingRow & { status: string })[];
    all.push(...page);
    if (page.length < 1000) break;
  }

  must(await d.from("runs").update({ profile_id: profile.id, profile_snapshot: cfg, status: "processing", finished_at: null }).eq("id", runId), "run");

  const rows = await loadRows(all);
  const keepaLive = getKeepa().available;
  const requeue: string[] = [];
  const work: (() => Promise<void>)[] = [];
  const middle = GATE_ORDER.filter((g) => g !== "gating" && g !== "fees");
  rows.forEach((row, i) => {
    if (!all[i].inputs || all[i].status !== "done") {
      requeue.push(row.resultId);
      return;
    }
    const ctx = context(row, card, rules, cfg, approved);
    const pre = runGates(ctx, cfg, ["compliance", "budgetFit"]);
    if (pre.failedGate) return void work.push(() => safely(row, () => finalize(row, pre, cfg, ctx)));
    if (STAGE_RANK[row.stage] < STAGE_RANK.enriched) return void requeue.push(row.resultId);
    // Keepa is live and this listing has no history yet (and none under 24h to read): fetch it once.
    if (keepaLive && row.match?.asin && !row.market?.hasHistory) return void requeue.push(row.resultId);
    const mid = runGates(ctx, cfg, middle);
    if (mid.failedGate) return void work.push(() => safely(row, () => finalize(row, mid, cfg, ctx)));
    if (STAGE_RANK[row.stage] < STAGE_RANK.account || needsRestrictionCheck(row)) return void requeue.push(row.resultId);
    const full = runGates(ctx, cfg);
    if (keepaLive && needsSellers(row, full, cfg)) return void requeue.push(row.resultId);
    work.push(() => safely(row, () => finalize(row, full, cfg, ctx)));
  });

  for (let i = 0; i < work.length; i += 10) await Promise.all(work.slice(i, i + 10).map((f) => f()));
  for (const c of chunks(requeue)) {
    must(await d.from("results").update({ status: "pending", updated_at: new Date().toISOString() }).in("id", c), "requeue");
  }
  const done = requeue.length === 0;
  must(
    await d.from("runs").update({
      processed_count: all.length - requeue.length,
      row_count: all.length,
      ...(done ? { status: "done", finished_at: new Date().toISOString() } : {}),
    }).eq("id", runId),
    "run progress",
  );
  return { rescored: work.length, requeued: requeue.length };
}

/** Screen the next `limit` pending rows of a run. The page calls this until `done`. */
export async function processRun(runId: string, limit = 20): Promise<{ done: boolean; processed: number; total: number }> {
  const d = db();
  const runRow = must(await d.from("runs").select("*").eq("id", runId).single(), "run") as {
    id: string; status: string; profile_snapshot: ProfileConfig; row_count: number; token_cost: number;
  };
  const counts = async () => {
    const [{ count: total }, { count: pending }] = await Promise.all([
      d.from("results").select("id", { count: "exact", head: true }).eq("run_id", runId),
      d.from("results").select("id", { count: "exact", head: true }).eq("run_id", runId).eq("status", "pending"),
    ]);
    return { total: total ?? 0, pending: pending ?? 0 };
  };
  if (runRow.status === "done") {
    const c = await counts();
    return { done: true, processed: c.total - c.pending, total: c.total };
  }
  if (runRow.status === "pending") must(await d.from("runs").update({ status: "processing" }).eq("id", runId), "run status");

  const cfg = withDefaults(runRow.profile_snapshot);
  const [card, rules, approved] = await Promise.all([activeRateCard(), loadRules(), approvedBrands()]);
  const spapi = getSpApi();
  const keepa = getKeepa();
  // Keepa's own tokensConsumed, added to the run as each response arrives.
  const recordTokens = (meta: KeepaResponseMeta) => addRunTokens(runId, meta.tokensConsumed);

  const pending = must(
    await d.from("results").select("id, product_id, offer_id, inputs").eq("run_id", runId).eq("status", "pending").limit(limit),
    "pending",
  ) as PendingRow[];

  if (pending.length) {
    let rows = await loadRows(pending);

    // Stage 1 — gates that need only the row: compliance and budget fit. No API calls yet.
    const pre: GateId[] = ["compliance", "budgetFit"];
    const survivors: Row[] = [];
    for (const row of rows) {
      await safely(row, async () => {
        const ctx = context(row, card, rules, cfg, approved);
        const run = runGates(ctx, cfg, pre);
        if (run.failedGate) await finalize(row, run, cfg, ctx);
        else survivors.push(row);
      });
    }
    // Rows re-queued by Re-screen keep what was already fetched for them.
    const enrichedBefore = survivors.filter((r) => STAGE_RANK[r.stage] >= STAGE_RANK.enriched);
    rows = survivors.filter((r) => STAGE_RANK[r.stage] < STAGE_RANK.enriched);

    // Stage 2 — match and enrich: SP-API catalog by EAN, Keepa history (24-hour cache).
    // Notes from an earlier pass's failed lookups are cleared before this pass looks again.
    for (const r of rows) r.dataNotes = r.dataNotes.filter((n) => !/lookup failed|Keepa/i.test(n));
    // Unmatched EANs are always asked again: a miss isn't cached.
    const needCatalog = rows.filter((r) => !r.product.asin || !FRESH(r.product.catalog_updated_at, CATALOG_TTL));
    let catalog = new Map<string, CatalogMatch[]>();
    let traces = new Map<string, LookupTrace>();
    if (spapi && needCatalog.length) {
      try {
        ({ matches: catalog, traces } = await spapi.lookupEans([...new Set(needCatalog.map((r) => r.product.ean))]));
      } catch (e) {
        for (const r of needCatalog) r.dataNotes.push(`Catalog lookup failed: ${(e as Error).message}.`);
      }
    }

    // Keepa by EAN only where neither the catalog nor an earlier match found a listing;
    // everything with an ASIN gets its history by ASIN below.
    let keepaByEan = new Map<string, KeepaProduct[]>();
    const fetched = new Map<string, KeepaProduct>();
    const unresolved = rows.filter((r) => !r.product.asin && !catalog.get(r.product.ean)?.length);
    if (keepa.available && unresolved.length) {
      try {
        const res = await keepa.lookupByEans([...new Set(unresolved.map((r) => r.product.ean))], recordTokens);
        keepaByEan = res.byEan;
        for (const [asin, k] of res.byAsin) fetched.set(asin, k);
      } catch (e) {
        for (const r of unresolved) r.dataNotes.push(`Keepa lookup failed: ${(e as Error).message}.`);
      }
    }

    // Resolve ASINs. An EAN that maps to several ASINs keeps them all: extra ones become
    // new products with the same offer and join this run as pending rows.
    const resolved: Row[] = [];
    for (const row of rows) await safely(row, async () => {
      const p = row.product;
      const cat = catalog.get(p.ean) ?? [];
      const kp = keepaByEan.get(p.ean) ?? [];
      const looked = !!spapi || keepa.available;
      if (!looked) return void resolved.push(row);
      const catalogChecked = needCatalog.includes(row) && spapi;
      const asins = [...new Set([...cat.map((c) => c.asin), ...kp.map((k) => k.asin), ...(p.asin ? [p.asin] : [])])];
      const primary = p.asin ?? asins[0] ?? null;
      const trace = traces.get(p.ean);
      if (trace) row.lookup = trace;
      row.match = { asin: primary, asinCount: Math.max(1, asins.length, row.match?.asinCount ?? 0), looked: true };
      if (!primary && trace?.outcome === "api_error") {
        // Amazon didn't answer, so this isn't a verdict on the product: leave it retryable.
        const err = trace.attempts.find((a) => a.error)?.error ?? "no response";
        throw new Error(`Catalog lookup failed for EAN ${p.ean}: ${err}. Re-screen to retry.`);
      }
      resolved.push(row);
      if (!primary) {
        row.match.note = missNote(trace);
        if (catalogChecked) must(await d.from("products").update({ catalog_updated_at: new Date().toISOString() }).eq("id", p.id), "product");
        return;
      }
      const c = cat.find((x) => x.asin === primary);
      const k = kp.find((x) => x.asin === primary);
      const update: Partial<Product> & { updated_at: string } = { asin: primary, updated_at: new Date().toISOString() };
      if (c) {
        Object.assign(update, {
          title: c.title ?? p.title, brand: c.brand ?? p.brand, category: c.category ?? p.category,
          dims_cm: c.dimsCm ?? p.dims_cm, weight_g: c.weightG ?? p.weight_g, sales_rank: c.salesRank,
          parent_asin: c.parentAsin, variation_count: c.variationCount, catalog_updated_at: new Date().toISOString(),
        });
        row.hazmat = [...c.hazmat, ...(c.batteries ? ["batteries"] : [])];
      }
      if (k) {
        Object.assign(update, {
          title: update.title ?? k.title ?? p.title, brand: update.brand ?? k.brand ?? p.brand,
          category: update.category ?? k.category ?? p.category,
          dims_cm: update.dims_cm ?? k.dimsCm ?? p.dims_cm, weight_g: update.weight_g ?? k.weightG ?? p.weight_g,
          parent_asin: update.parent_asin ?? k.parentAsin, variation_count: update.variation_count ?? k.variationCount,
          keepa_updated_at: new Date().toISOString(),
        });
      }
      update.referral_category = referralCategoryFor((update.category ?? p.category) as string | null, card);
      must(await d.from("products").update(update).eq("id", p.id), "update product");
      row.product = { ...p, ...update } as Product;

      for (const extra of asins.filter((a) => a !== primary)) {
        const existing = must(await d.from("products").select("id").eq("ean", p.ean).eq("asin", extra).maybeSingle(), "product") as { id: string } | null;
        const productId = existing?.id ?? (must(
          await d.from("products").insert({ ean: p.ean, asin: extra, title: p.title, brand: p.brand }).select("id").single(),
          "insert product",
        ) as { id: string }).id;
        const { id: _omit, ...offerCopy } = row.offer;
        void _omit;
        const newOffer = must(await d.from("offers").insert({ ...offerCopy, product_id: productId }).select("id").single(), "copy offer") as { id: string };
        const inserted = await d.from("results").upsert(
          { run_id: runId, product_id: productId, offer_id: newOffer.id },
          { onConflict: "run_id,product_id", ignoreDuplicates: true },
        );
        if (inserted.error) throw new Error(`queue ASIN ${extra}: ${inserted.error.message}`);
      }
    });
    rows = resolved;

    // Keepa history for every row in this chunk that has an ASIN and no history yet,
    // including rows Re-screen sent back. Stored before any gate runs.
    for (const r of enrichedBefore) r.dataNotes = r.dataNotes.filter((n) => !/Keepa/i.test(n));
    const snapshots = await attachKeepa([...enrichedBefore, ...rows], fetched, recordTokens);

    // Market data: Keepa history, else SP-API's current Buy Box and offer count.
    const noHistory = rows.filter((r) => r.match?.asin && !snapshots.has(r.match.asin));
    let pricing = new Map<string, CompetitivePrice>();
    if (spapi && noHistory.length) {
      try {
        pricing = await spapi.getCompetitivePricing([...new Set(noHistory.map((r) => r.match!.asin!))]);
      } catch (e) {
        for (const r of noHistory) r.dataNotes.push(`Pricing lookup failed: ${(e as Error).message}.`);
      }
    }
    for (const row of rows) {
      const asin = row.match?.asin;
      if (!asin) continue;
      const snap = snapshots.get(asin);
      row.market = snap ? marketFromKeepa(snap) : marketFromSpApi(pricing.get(asin), row.product.sales_rank);
    }
    for (const row of enrichedBefore) {
      const snap = row.match?.asin ? snapshots.get(row.match.asin) : undefined;
      if (snap) row.market = marketFromKeepa(snap);
    }
    for (const row of rows) row.stage = "enriched";
    rows = [...enrichedBefore, ...rows];

    // Stage 3 — every gate except gating and fees, on the enriched rows.
    const middle = GATE_ORDER.filter((g) => g !== "gating" && g !== "fees");
    const stage3: Row[] = [];
    for (const row of rows) {
      await safely(row, async () => {
        const ctx = context(row, card, rules, cfg, approved);
        const run = runGates(ctx, cfg, middle);
        if (run.failedGate) await finalize(row, run, cfg, ctx);
        else stage3.push(row);
      });
    }

    // Stage 4 — your account: gating, and Amazon's own fee at the scoring price.
    if (spapi) {
      for (const row of stage3) {
        if (!row.match?.asin || !needsRestrictionCheck(row)) continue;
        try {
          const r = await spapi.getListingsRestrictions(row.match.asin);
          row.restriction = {
            status: r.status,
            message: r.reasons.map((x) => x.message).filter(Boolean).join(" "),
            links: r.reasons.flatMap((x) => x.links),
          };
        } catch (e) {
          row.restriction = { status: "unknown", message: `Restriction check failed: ${(e as Error).message}` };
        }
      }
      const priced = stage3
        .map((row) => ({ row, price: resolveScoringPrice(row.market, cfg).price }))
        .filter((x): x is { row: Row; price: number } =>
          !!x.row.match?.asin && x.price != null && x.row.restriction?.status !== "blocked" &&
          !(x.row.amazonFees && Math.abs(x.row.amazonFees.price - x.price) < 0.005));
      for (const c of chunks(priced, 20)) {
        try {
          const est = await spapi.getMyFeesEstimates(c.map((x) => ({ asin: x.row.match!.asin!, price: x.price })));
          est.forEach((f, i) => {
            if (f.ok && f.referral != null && f.fba != null) c[i].row.amazonFees = { price: c[i].price, referral: f.referral, fba: f.fba };
          });
        } catch (e) {
          for (const x of c) x.row.notes.push(`Amazon fee estimate failed, rate card used: ${(e as Error).message}.`);
        }
      }
    }
    // Rows that pass every gate: profile their top Buy Box sellers (cached 7 days), then re-run
    // the gates so a likely brand distributor is flagged.
    const passing = stage3.filter((row) => needsSellers(row, runGates(context(row, card, rules, cfg, approved), cfg), cfg));
    if (passing.length && keepa.available) {
      const { profiles, note } = await sellerProfiles(passing.flatMap((r) => wantedSellers(r, cfg).map((s) => s.sellerId)), recordTokens);
      for (const row of passing) {
        row.sellers = sellerViews(row, cfg, profiles);
        if (note) row.notes.push(note);
        if (row.sellers.some((s) => !s.name && s.storefrontSize == null)) row.sellers = null; // not looked up: try again next time
      }
    }
    for (const row of stage3) {
      await safely(row, async () => {
        row.stage = "account";
        const ctx = context(row, card, rules, cfg, approved);
        await finalize(row, runGates(ctx, cfg), cfg, ctx);
      });
    }
  }

  const c = await counts();
  const done = c.pending === 0;
  must(
    await d.from("runs").update({
      processed_count: c.total - c.pending,
      row_count: c.total,
      ...(done ? { status: "done", finished_at: new Date().toISOString() } : {}),
    }).eq("id", runId),
    "run progress",
  );
  return { done, processed: c.total - c.pending, total: c.total };
}
