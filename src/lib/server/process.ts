import "server-only";
import { brandKey } from "../brands";
import { computeFees, economics, referralCategoryFor } from "../fees/engine";
import type { RateCard } from "../fees/rateCard";
import { estimateEta, type Eta, type RunStats } from "../eta";
import { addDailyTokens } from "../keepaLedger";
import { keepaOwner } from "./keepaTurn";
import { getKeepa, type KeepaProduct, type KeepaResponseMeta, type KeepaSummary, type KeepaTokens, type OnKeepaResponse, type SellerProfile } from "../keepa/client";
import { dormancy, trimSeries, type Dormancy } from "../keepa/summarize";
import type { Point } from "../keepa/types";
import { isDormant } from "../screening/dormant";
import { getQogita, variantFid } from "../qogita/client";
import { chooseOffer, toSupplierOffer, type QogitaOffers, type SupplierOffer } from "../qogita/offers";
import { GATE_ORDER, withDefaults, type GateId, type ProfileConfig } from "../screening/config";
import { resolveScoringPrice, runGates, verdictOf, type GateRun, type MarketData, type ScreenContext, type SellerView } from "../screening/gates";
import type { CategoryRule } from "../screening/rules";
import { winScore } from "../screening/score";
import { getSpApi, type CatalogMatch, type CompetitivePrice, type LookupTrace } from "../spapi/client";
import type { ListingOffers } from "../spapi/types";
import { activeRateCard, chunks, db, loadProfile, loadRules, must } from "./db";
import { productKey, waiversFor } from "./overrides";

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
  /** Main image URL; '' when looked up and Amazon has none; null when not looked up. */
  image_url?: string | null;
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
  /** Qogita: the product link (the variant FID is in it). */
  external_ref?: string | null;
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
type Stage = "row" | "priced" | "enriched" | "account" | "buybox";
/** row: text only; priced: matched and priced, waiting on Keepa; enriched: history in; account: done. */
// "buybox": passed every other gate on stage-1 history; waiting for Keepa's Buy Box data (stage 2).
const STAGE_RANK: Record<Stage, number> = { row: 0, priced: 1, enriched: 2, account: 3, buybox: 3 };

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
  /** Qogita supplier offers for a row that passed every gate (see qogita/offers). */
  qogita?: QogitaOffers | null;
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
  qogita: QogitaOffers | null;
  /** Gates waived for this product. */
  waivers: Map<GateId, string | null>;
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
  // Qogita: once the supplier offers are in, cost, case size and MOV are the chosen supplier's
  // (the cheapest whose MOV fits this profile's budget), not the headline price from the search.
  const q = row.qogita ? chooseOffer(row.qogita.offers, cfg.budget, row.qogita.fxRate).chosen : null;
  return {
    brandApproval: approved.get(brandKey(p.brand ?? o.brand)) ?? null,
    now: new Date(),
    card,
    rules,
    text: [o.title, o.brand, o.category, p.title].filter(Boolean).join(" · "),
    sheet: { brand: o.brand, title: o.title },
    listing: row.match?.asin ? { brand: p.brand, title: p.title } : undefined,
    amazonCategory: p.category,
    offer: q ? {
      unitCostGbp: q.basePrice * row.qogita!.fxRate,
      moq: q.unit,
      goodsVatRatePct: Number(s.vat_rate),
      supplierMovGbp: q.baseMov * row.qogita!.fxRate,
    } : {
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
    waivers: row.waivers,
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

/** A screened row's result columns: verdict, gates, money, score, why and the inputs behind them. */
function resultFields(row: Row, run: GateRun, cfg: ProfileConfig, ctx: ScreenContext) {
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
    qogita: row.qogita ? { ...row.qogita, ...pick(row.qogita, cfg) } : null,
  };
  return {
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
  };
}

async function saveFlags(row: Row, run: GateRun) {
  if (run.ruleMatches.length) {
    must(await db().from("products").update({ compliance_flags: run.ruleMatches }).eq("id", row.product.id), "flags");
  }
}

async function finalize(row: Row, run: GateRun, cfg: ProfileConfig, ctx: ScreenContext) {
  must(await db().from("results").update(resultFields(row, run, cfg, ctx)).eq("id", row.resultId), "save result");
  await saveFlags(row, run);
}

/**
 * Save many screened rows in one request per 200 (an upsert on id updates only the columns
 * given): a re-screen of thousands of rows fits in a function's time limit this way.
 */
async function saveResults(runId: string, items: { row: Row; run: GateRun; ctx: ScreenContext }[], cfg: ProfileConfig) {
  for (const c of chunks(items, 200)) {
    const payload = c.map(({ row, run, ctx }) => ({ id: row.resultId, run_id: runId, product_id: row.product.id, offer_id: row.offer.id, ...resultFields(row, run, cfg, ctx) }));
    const res = await db().from("results").upsert(payload, { onConflict: "id" });
    // One bad row shouldn't lose the batch: fall back to saving them one by one.
    if (res.error) await mapLimit(c, 10, ({ row, run, ctx }) => safely(row, () => finalize(row, run, cfg, ctx)));
  }
  await mapLimit(items.filter((x) => x.run.ruleMatches.length), 10, ({ row, run }) => saveFlags(row, run));
}

type Approved = Map<string, { status: "approved"; date: string | null }>;

/** Brands recorded as approved on the Brands page, by normalised brand key. */
async function approvedBrands(): Promise<Approved> {
  const rows = must(await db().from("brand_approvals").select("brand_key, status_date").eq("status", "approved"), "brand approvals") as
    { brand_key: string; status_date: string | null }[];
  return new Map(rows.map((r) => [r.brand_key, { status: "approved", date: r.status_date }]));
}

/** How old a Keepa snapshot may be and still be used instead of fetching. */
const maxAgeMs = (cfg: ProfileConfig) => Math.max(0, cfg.keepaMaxAgeDays ?? 7) * DAY;

/** Latest Keepa summary per ASIN fetched within `maxAge`. */
async function freshSnapshots(asins: string[], maxAge: number = KEEPA_TTL): Promise<Map<string, KeepaSummary>> {
  const out = new Map<string, KeepaSummary>();
  const since = new Date(Date.now() - maxAge).toISOString();
  for (const c of chunks([...new Set(asins)])) {
    const snaps = must(
      await db().from("keepa_snapshots").select("asin, fetched_at, summary").in("asin", c).gte("fetched_at", since).order("fetched_at", { ascending: false }),
      "snapshots",
    ) as { asin: string; summary: KeepaSummary }[];
    // Newest first; a snapshot with the Buy Box data beats a newer history-only one (it has everything).
    for (const x of snaps) {
      const cur = out.get(x.asin);
      if (!cur || (cur.buyBoxFetched === false && x.summary.buyBoxFetched !== false)) out.set(x.asin, x.summary);
    }
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
async function attachKeepa(
  rows: Row[], alreadyFetched: Map<string, KeepaProduct>, onResponse: OnKeepaResponse,
  opts: { buyBox?: boolean; maxAgeMs?: number } = {},
): Promise<{ summaries: Map<string, KeepaSummary>; exhausted: boolean }> {
  const keepa = getKeepa();
  const withAsin = rows.filter((r) => r.match?.asin);
  const asins = [...new Set(withAsin.map((r) => r.match!.asin!))];
  const summaries = await freshSnapshots(asins, opts.maxAgeMs);
  // Stage 2 needs a snapshot with the Buy Box data; a history-only one doesn't count.
  if (opts.buyBox) for (const [a, snap] of summaries) if (snap.buyBoxFetched === false) summaries.delete(a);
  const products = new Map<string, KeepaProduct>();
  for (const [asin, k] of alreadyFetched) if (!summaries.has(asin)) products.set(asin, k);

  const need = asins.filter((a) => !summaries.has(a) && !products.has(a));
  let exhausted: { refillInMs: number | null } | undefined;
  if (keepa.available && need.length) {
    try {
      const res = await keepa.lookupByAsins(need, onResponse, { buyBox: opts.buyBox ?? true });
      for (const [asin, k] of res.byAsin) products.set(asin, k);
      exhausted = res.exhausted;
    } catch (e) {
      for (const r of withAsin) if (need.includes(r.match!.asin!)) r.dataNotes.push(`Keepa lookup failed: ${(e as Error).message}.`);
    }
  }

  // Several at a time: one by one, a batch of 100 snapshots took long enough to overrun the call.
  await mapLimit([...products], 8, async ([asin, k]) => {
    try {
      await saveSnapshot(k);
    } catch (e) {
      console.error(`[keepa] storing snapshot for ${asin} failed: ${(e as Error).message}`);
      for (const r of withAsin) if (r.match!.asin === asin) r.dataNotes.push(`Keepa snapshot not stored: ${(e as Error).message}.`);
    }
    summaries.set(asin, k.summary);
  });
  if (products.size) {
    for (const c of chunks([...products.keys()])) {
      await db().from("products").update({ keepa_updated_at: new Date().toISOString() }).in("asin", c);
    }
    // Keepa's image where the catalog gave none (or the product predates images).
    for (const r of withAsin) {
      const k = products.get(r.match!.asin!);
      if (k?.imageUrl && !r.product.image_url) {
        await db().from("products").update({ image_url: k.imageUrl }).eq("id", r.product.id);
        r.product.image_url = k.imageUrl;
      }
    }
  }
  return { summaries, exhausted: !!exhausted };
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
  const tried = trace.attempts.map((a) => (a.code.startsWith("batch") ? `an ${a.identifiersType} ${a.code}` : `${a.identifiersType} ${a.code}`));
  return `search miss: tried ${tried.join(", ")}; Amazon returned no items`;
}

interface PendingRow {
  id: string;
  product_id: string;
  offer_id: string;
  inputs: StoredInputs | null;
}

/** Build rows from results, with their product, offer, supplier and any stored inputs. */
async function loadRows(results: PendingRow[], maxAge: number = KEEPA_TTL): Promise<Row[]> {
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

  // A Keepa snapshot within the profile's max age (any run's) beats stored market data without history.
  const keepaFresh = await freshSnapshots(products.map((p) => p.asin).filter((a): a is string => !!a), maxAge);
  const waivers = await waiversFor(products.map((p) => p.ean));

  const rows = results.map((r) => {
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
      qogita: i?.qogita ?? null,
      // A waiver made before the ASIN was known (EAN only) covers every ASIN of that EAN.
      waivers: new Map([...(waivers.get(productKey(product.ean, null)) ?? []), ...(waivers.get(productKey(product.ean, product.asin)) ?? [])]),
      dataNotes: i?.notes ?? [],
      notes: [],
    };
  });
  await backfillDormancy(rows);
  return rows;
}

/**
 * Dormant rows screened before the history figures they need were kept (last Buy Box,
 * 12-month rank drops, days without a seller): work them out from the latest stored
 * snapshot's series. No Keepa calls.
 */
async function backfillDormancy(rows: { match: { asin: string | null } | null; market: MarketData | null }[]): Promise<void> {
  const need = rows.filter((r) => r.match?.asin && isDormant(r.market) && r.market!.lastOfferDaysAgo === undefined);
  if (!need.length) return;
  const series = new Map<string, Dormancy>();
  const now = Date.now();
  for (const c of chunks([...new Set(need.map((r) => r.match!.asin!))], 50)) {
    const snaps = must(
      await db().from("keepa_snapshots").select("asin, fetched_at, rank_series, buybox_series, offer_count_series").in("asin", c).order("fetched_at", { ascending: false }),
      "snapshot series",
    ) as { asin: string; fetched_at: string; rank_series: Point[] | null; buybox_series: Point[] | null; offer_count_series: Point[] | null }[];
    for (const x of snaps) {
      if (series.has(x.asin)) continue;
      // As of when it was fetched, so "days without a seller" doesn't count the time since as unknown.
      const d = dormancy({ rank: nums(x.rank_series), buyBox: nums(x.buybox_series), offerCount: nums(x.offer_count_series) }, Math.min(now, Date.parse(x.fetched_at)));
      const since = Math.floor((now - Date.parse(x.fetched_at)) / DAY);
      series.set(x.asin, { ...d, lastOfferDaysAgo: d.lastOfferDaysAgo == null ? null : d.lastOfferDaysAgo + Math.max(0, since) });
    }
  }
  for (const r of need) {
    const d = series.get(r.match!.asin!);
    if (d) r.market = { ...r.market!, ...d };
  }
}

/** Stored series come back from JSON with nulls where Keepa had no value. */
const nums = (s: Point[] | null): Point[] => (s ?? []).map(([t, v]) => [t, v == null ? NaN : v]);

/**
 * Re-run every gate and the score for every row of a run with the profile as saved now, from
 * the data stored when it was screened: no Amazon or Keepa calls. Rows that never collected
 * data a gate now needs go back to pending for the processor to fetch just that; with
 * storedOnly they're re-evaluated on what they have instead (a gate without its data is
 * skipped), so no row keeps results from an older config.
 *
 * Works for up to `budgetMs` a call and reports what's left: rows still dated before the
 * re-screen started. Call again with `continuing` to carry on.
 */
export async function rescreenRun(
  runId: string,
  profileId?: string | null,
  opts: { resultIds?: string[]; storedOnly?: boolean; budgetMs?: number; continuing?: boolean } = {},
): Promise<{ rescored: number; requeued: number; remaining: number; profile: { name: string; savedAt: string | null } }> {
  const deadline = Date.now() + (opts.budgetMs ?? 40_000);
  const d = db();
  const runRow = must(await d.from("runs").select("id, profile_id, profile_snapshot, stats").eq("id", runId).single(), "run") as {
    id: string; profile_id: string | null; profile_snapshot: ProfileConfig; stats?: RunStats | null;
  };
  const stats: RunStats = { ...(runRow.stats ?? {}) };
  let cfg: ProfileConfig;
  let job = stats.rescreen;
  if (opts.continuing && job && !job.finishedAt) {
    // Carry on with the config the re-screen started with.
    cfg = withDefaults(runRow.profile_snapshot);
  } else {
    const profile = await loadProfile(profileId || runRow.profile_id);
    cfg = profile.config;
    job = { startedAt: new Date().toISOString(), finishedAt: null, storedOnly: !!opts.storedOnly, resultIds: opts.resultIds ?? null, rescored: 0, requeued: 0 };
    stats.rescreen = job;
    stats.profile = { id: profile.id, name: profile.name, savedAt: profile.updated_at ?? null, appliedAt: job.startedAt };
    await updateRun(runId, { profile_id: profile.id, profile_snapshot: cfg, status: "processing", finished_at: null }, { stats });
  }
  const [card, rules, approved] = await Promise.all([activeRateCard(), loadRules(), approvedBrands()]);
  const keepaLive = getKeepa().available;
  const middle = GATE_ORDER.filter((g) => g !== "gating" && g !== "fees");

  // Rows not yet re-screened: finished (or errored) and last written before this re-screen began.
  const todo = async () => {
    const out: (PendingRow & { status: string })[] = [];
    for (let from = 0; ; from += 1000) {
      const page = must(
        await d.from("results").select("id, product_id, offer_id, inputs, status, updated_at").eq("run_id", runId).range(from, from + 999),
        "results",
      ) as (PendingRow & { status: string; updated_at: string })[];
      out.push(...page.filter((r) => r.status !== "pending" && r.updated_at <= job!.startedAt && (!job!.resultIds || job!.resultIds.includes(r.id))));
      if (page.length < 1000) break;
    }
    return out;
  };

  let rescored = 0, requeued = 0;
  const left = await todo();
  while (left.length && Date.now() < deadline) {
    const batch = left.splice(0, 250);
    const rows = await loadRows(batch, maxAgeMs(cfg));
    const requeue: string[] = [];
    // Stored-data-only and nothing stored to re-screen from: marked seen, left as it is.
    const untouched: string[] = [];
    const work: { row: Row; run: GateRun; ctx: ScreenContext }[] = [];
    rows.forEach((row, i) => {
      if (!batch[i].inputs || batch[i].status !== "done") {
        if (!job!.storedOnly) requeue.push(row.resultId);
        else if (batch[i].inputs) work.push({ row, ...gated(row) });
        else untouched.push(row.resultId);
        return;
      }
      const ctx = context(row, card, rules, cfg, approved);
      const fetchNeeded = (() => {
        const pre = runGates(ctx, cfg, ["compliance", "budgetFit"]);
        if (pre.failedGate) return false;
        if (STAGE_RANK[row.stage] < STAGE_RANK.enriched) return true;
        // Keepa is live and this listing has no history yet (and no snapshot within the max age): fetch it once.
        if (keepaLive && row.match?.asin && !row.market?.hasHistory) return true;
        if (runGates(ctx, cfg, middle).failedGate) return false;
        if (STAGE_RANK[row.stage] < STAGE_RANK.account || needsRestrictionCheck(row)) return true;
        const full = runGates(ctx, cfg);
        // Passes everything on stage-1 history: needs the Buy Box data before a verdict.
        if (!full.failedGate && wantsBuyBox(row, keepaLive)) return true;
        return keepaLive && needsSellers(row, full, cfg);
      })();
      if (fetchNeeded && !job!.storedOnly) requeue.push(row.resultId);
      else work.push({ row, ...gated(row) });
    });
    await saveResults(runId, work, cfg);
    for (const c of chunks(requeue)) {
      must(await d.from("results").update({ status: "pending", updated_at: new Date().toISOString() }).in("id", c), "requeue");
    }
    for (const c of chunks(untouched)) {
      must(await d.from("results").update({ updated_at: new Date().toISOString() }).in("id", c), "seen");
    }
    rescored += work.length;
    requeued += requeue.length;
  }

  function gated(row: Row) {
    const ctx = context(row, card, rules, cfg, approved);
    return { ctx, run: runGates(ctx, cfg) };
  }

  // Counts for the whole run (a partial re-screen touches only some rows).
  const remaining = left.length;
  job.rescored += rescored;
  job.requeued += requeued;
  if (!remaining) job.finishedAt = new Date().toISOString();
  stats.rescreen = job;
  const p = await runProgress(runId);
  await updateRun(runId, {
    processed_count: p.processed,
    row_count: p.total,
    ...(p.done && !remaining ? { status: "done", finished_at: new Date().toISOString() } : {}),
  }, { stats });
  return { rescored, requeued, remaining, profile: { name: stats.profile?.name ?? "", savedAt: stats.profile?.savedAt ?? null } };
}

// ---------------------------------------------------------------------------------------
// Background processing. A run moves through three stages, each on its own rate limits,
// run side by side on different rows:
//   lookup  — row gates, SP-API catalog and pricing, match and early price-band checks
//   keepa   — history for rows still standing, paced by Keepa's token balance
//   account — gating (parallel), Amazon's fee estimates (20 per call), sellers, final score
// One worker per run holds a lease; each call works for a time budget, parks what's left,
// and the route hands on to the next call.
// ---------------------------------------------------------------------------------------

export interface RunProgress {
  done: boolean;
  processed: number;
  total: number;
  /** Pending rows waiting on Amazon (lookup or account checks) and on Keepa tokens. */
  waiting: { amazon: number; keepa: number };
  /** When Keepa should have tokens again, if rows are waiting on it. */
  keepaResumeAt: string | null;
  /** Rows finished or moved on by this call. */
  progressed: number;
  /** Estimated time left (see lib/eta). */
  eta: Eta;
  /** Another call holds the run's lease. */
  busy?: boolean;
  /** A re-screen in progress: rows it hasn't reached yet. */
  rescreen?: { left: number; startedAt: string } | null;
  /** The run is paused: no call works on it until it's resumed. */
  paused?: boolean;
  /** When it was paused. */
  pausedAt?: string | null;
  /** Whose turn it is on Keepa (one run at a time), and whether it's this run's. */
  keepaTurn?: { owner: { id: string; name: string | null; source: string } | null; mine: boolean };
  /** False until the lease migration is run: then only the run page drives the run, one call at a time. */
  leased?: boolean;
}

const BATCH = { lookup: 100, keepa: 100, account: 60 };
/** Keepa tokens a product: history only (stage 1), and with Buy Box data (stage 2). */
const KEEPA_HISTORY_TOKENS = 1;
const KEEPA_BUYBOX_TOKENS = 3;

/**
 * The Keepa queue's order: rate-card profit at the current price, best first, so scarce tokens
 * go to the likeliest winners. Rows without a price go last.
 */
function keepaPriority(row: Row, card: RateCard, rules: CategoryRule[], cfg: ProfileConfig, approved: Approved): number {
  const price = row.market?.currentBuyBox;
  if (price == null || !(price > 0)) return -Infinity;
  const ctx = context(row, card, rules, cfg, approved);
  const item = { referralCategory: ctx.product.referralCategory, dimsCm: ctx.product.dimsCm, weightG: ctx.product.weightG, goodsVatRatePct: ctx.offer.goodsVatRatePct };
  return economics(price, ctx.offer.unitCostGbp, item, card, cfg.fees, { date: ctx.now }).profit ?? -Infinity;
}

/** Rows that passed every other gate on stage-1 history and now need the Buy Box data. */
const wantsBuyBox = (row: Row, keepaLive: boolean) => keepaLive && !!row.match?.asin && !!row.market?.hasHistory && row.market.buyBoxFetched === false;

/** Rows a call keeps in memory between stages. */
interface Queues {
  lookup: Row[];
  keepa: Row[];
  account: Row[];
}

const sleepMs = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

/** Run `fn` over items, at most `limit` at a time. */
async function mapLimit<T>(items: T[], limit: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

/** Pending rows of a run, and how many wait on Keepa (stage "priced"). */
export async function runProgress(runId: string, extra: Partial<RunProgress> = {}): Promise<RunProgress> {
  const d = db();
  const [{ count: total }, { count: pending }, { count: keepa }, { count: buyBox }, run] = await Promise.all([
    d.from("results").select("id", { count: "exact", head: true }).eq("run_id", runId),
    d.from("results").select("id", { count: "exact", head: true }).eq("run_id", runId).eq("status", "pending"),
    d.from("results").select("id", { count: "exact", head: true }).eq("run_id", runId).eq("status", "pending").eq("inputs->>stage", "priced"),
    d.from("results").select("id", { count: "exact", head: true }).eq("run_id", runId).eq("status", "pending").eq("inputs->>stage", "buybox"),
    d.from("runs").select("*").eq("id", runId).single(),
  ]);
  const t = total ?? 0, p = pending ?? 0, bb = buyBox ?? 0, k = (keepa ?? 0) + bb;
  const r = run.data as { resume_after?: string | null; stats?: RunStats | null } | null;
  // A re-screen still going: rows last written before it started haven't been re-screened yet.
  const job = r?.stats?.rescreen;
  let rescreenLeft = 0;
  if (job && !job.finishedAt) {
    rescreenLeft = (await d.from("results").select("id", { count: "exact", head: true }).eq("run_id", runId).neq("status", "pending").lte("updated_at", job.startedAt)).count ?? 0;
  }
  const resume = r?.resume_after ?? null;
  const waiting = { amazon: p - k, keepa: k };
  const pausedAt = (r as { paused_at?: string | null } | null)?.paused_at ?? null;
  const owner = k > 0 ? await keepaOwner().catch(() => null) : null;
  return {
    paused: !!pausedAt,
    pausedAt,
    keepaTurn: { owner, mine: !owner || owner.id === runId },
    done: p === 0 && rescreenLeft === 0,
    rescreen: job && !job.finishedAt ? { left: rescreenLeft, startedAt: job.startedAt } : null,
    processed: t - p,
    total: t,
    waiting,
    keepaResumeAt: k > 0 ? resume : null,
    eta: estimateEta(waiting, r?.stats, k > 0 ? resume : null, Date.now(), (k - bb) * KEEPA_HISTORY_TOKENS + bb * KEEPA_BUYBOX_TOKENS),
    progressed: 0,
    ...extra,
  };
}

/**
 * Save the stats the processor owns (throughput, Keepa's figures, the daily token ledger) over
 * what's stored now, so a re-screen running alongside keeps its own progress record.
 */
async function saveOwnStats(runId: string, own: RunStats) {
  const cur = await db().from("runs").select("stats").eq("id", runId).maybeSingle();
  const stored = ((cur.data as { stats?: RunStats | null } | null)?.stats ?? {}) as RunStats;
  await updateRun(runId, {}, { stats: { ...stored, amazonPerMin: own.amazonPerMin, keepa: own.keepa, keepaByDay: own.keepaByDay, keepaStages: own.keepaStages } });
}

/** A write refused because a column isn't there yet: retry without the optional fields. */
async function updateRun(runId: string, fields: Record<string, unknown>, optional: Record<string, unknown> = {}) {
  const d = db();
  const res = await d.from("runs").update({ ...fields, ...optional }).eq("id", runId);
  if (res.error && schemaMissing(res.error.message) && Object.keys(optional).length) {
    // A column isn't migrated yet: keep the required fields, drop the optional ones.
    if (Object.keys(fields).length) must(await d.from("runs").update(fields).eq("id", runId), "run");
    return;
  }
  must(res, "run");
}

/** Take the run's lease for `ms`. false: someone else has it. null: leases not migrated yet. */
async function claimLease(runId: string, ms: number): Promise<boolean | null> {
  const now = new Date().toISOString();
  const res = await db().from("runs").update({ lease_until: new Date(Date.now() + ms).toISOString() })
    .eq("id", runId).or(`lease_until.is.null,lease_until.lt.${now}`).select("id");
  if (res.error) {
    if (schemaMissing(res.error.message)) return null;
    throw new Error(`lease: ${res.error.message}`);
  }
  return (res.data ?? []).length > 0;
}

/**
 * Work on a run for up to `budgetMs`: take the lease, run the three stages side by side until
 * nothing's left or time's up (waiting for Keepa tokens inside the budget when that's all
 * that's left), park unfinished rows, and report progress.
 */
export async function processRun(runId: string, opts: { budgetMs?: number } = {}): Promise<RunProgress> {
  const budget = opts.budgetMs ?? 45_000;
  const deadline = Date.now() + budget;
  // Stop starting new work this close to the end: enough to park rows and report.
  const margin = Math.min(3_000, budget * 0.1);
  const d = db();
  const runRow = must(await d.from("runs").select("*").eq("id", runId).single(), "run") as {
    id: string; status: string; profile_snapshot: ProfileConfig; token_cost: number; stats?: RunStats | null;
  };
  const stats: RunStats = { ...(runRow.stats ?? {}) };
  if (runRow.status === "done" && !(await runProgress(runId)).waiting.amazon && !(await runProgress(runId)).waiting.keepa) {
    return runProgress(runId);
  }
  // Paused: nothing runs and nothing is spent until it's resumed.
  if ((runRow as { paused_at?: string | null }).paused_at) return runProgress(runId);
  const lease = await claimLease(runId, budget + 30_000);
  if (lease === false) return runProgress(runId, { busy: true });
  // One run on Keepa at a time: another run's turn means this call leaves Keepa rows waiting.
  const owner = getKeepa().available ? await keepaOwner().catch(() => null) : null;
  const myKeepaTurn = !owner || owner.id === runId;
  const pausedNow = async () => !!((await d.from("runs").select("paused_at").eq("id", runId).maybeSingle()).data as { paused_at?: string | null } | null)?.paused_at;

  let progressed = 0;
  let keepaWaitUntil: number | null = null;
  try {
    if (runRow.status !== "processing") await updateRun(runId, { status: "processing", finished_at: null });
    const cfg = withDefaults(runRow.profile_snapshot);
    const [card, rules, approved] = await Promise.all([activeRateCard(), loadRules(), approvedBrands()]);
    const spapi = getSpApi();
    const keepa = getKeepa();
    const recordTokens = (meta: KeepaResponseMeta) => {
      // Saved with the run's stats after each batch; the dashboard sums today's across runs.
      stats.keepaByDay = addDailyTokens(stats.keepaByDay, meta.tokensConsumed);
      // And by stage, for the run header: history (stage 1), Buy Box (stage 2), EAN lookups, sellers.
      const st = { history: 0, buyBox: 0, lookup: 0, sellers: 0, ...(stats.keepaStages ?? {}) };
      const which = meta.kind === "seller" ? "sellers" : meta.kind === "code" ? "lookup" : meta.buyBox === false ? "history" : "buyBox";
      st[which] += meta.tokensConsumed;
      stats.keepaStages = st;
      return addRunTokens(runId, meta.tokensConsumed);
    };
    const env: StageEnv = { runId, cfg, card, rules, approved, spapi, keepa, recordTokens };

    const pending: PendingRow[] = [];
    for (let from = 0; ; from += 1000) {
      const page = must(
        await d.from("results").select("id, product_id, offer_id, inputs").eq("run_id", runId).eq("status", "pending").range(from, from + 999),
        "pending",
      ) as PendingRow[];
      pending.push(...page);
      if (page.length < 1000) break;
    }
    const q: Queues = { lookup: [], keepa: [], account: [] };
    for (const row of await loadRows(pending, maxAgeMs(cfg))) route(row, q, env);

    // Start a batch only if it can finish before the deadline: a batch can take 15–20 s (a Keepa
    // call plus saving its snapshots), and a call killed at the platform limit never saves its
    // progress or schedules the next one.
    let lastBatchMs = 0;
    const headroom = () => Math.max(Math.min(5_000, budget * 0.1), lastBatchMs * 1.5);
    while (Date.now() + headroom() < deadline - margin) {
      // Pause takes effect after the batch in hand.
      if (await pausedNow()) break;
      const a = q.lookup.splice(0, BATCH.lookup);
      const c = q.account.splice(0, BATCH.account);
      const keepaReady: boolean = keepa.available && myKeepaTurn && (keepaWaitUntil == null || Date.now() >= keepaWaitUntil);
      if (keepaReady && q.keepa.length > 1) {
        const score = new Map(q.keepa.map((r) => [r, keepaPriority(r, card, rules, cfg, approved)]));
        q.keepa.sort((x, y) => score.get(y)! - score.get(x)!);
      }
      const b: Row[] = keepaReady ? q.keepa.splice(0, BATCH.keepa) : [];
      if (!a.length && !b.length && !c.length) {
        // Only rows waiting on Keepa tokens: wait for the refill inside the budget.
        if (q.keepa.length && keepaWaitUntil != null && keepaWaitUntil + headroom() < deadline - margin) {
          await sleepMs(keepaWaitUntil - Date.now());
          continue;
        }
        break;
      }
      const started = performance.now();
      const batchStart = Date.now();
      const [la, kb, ac]: [Awaited<ReturnType<typeof stageLookup>>, Awaited<ReturnType<typeof stageKeepa>>, StageOut] =
        await Promise.all([stageLookup(a, env), stageKeepa(b, env), stageAccount(c, env)]);
      progressed += la.finished + kb.finished + ac.finished + la.next.length + kb.next.length;
      for (const row of [...la.next, ...kb.next, ...ac.next]) route(row, q, env);
      // Throughput for the time-left estimate: rows that left the Amazon queue this batch
      // (finished, or handed to Keepa), per minute, smoothed across batches.
      const leftAmazon = la.finished + ac.finished + la.next.filter((r) => r.stage === "priced").length;
      // performance.now(): a fast batch can take under a millisecond, which Date.now() reads as 0.
      const minutes = (performance.now() - started) / 60_000;
      if ((a.length || c.length) && minutes > 0) {
        const measured = leftAmazon / minutes;
        stats.amazonPerMin = stats.amazonPerMin ? 0.5 * stats.amazonPerMin + 0.5 * measured : measured;
      }
      if (kb.tokens) stats.keepa = { ...kb.tokens, at: new Date().toISOString() };
      await saveOwnStats(runId, stats);
      q.lookup.push(...la.added);
      q.keepa.unshift(...kb.deferred);
      lastBatchMs = Math.max(lastBatchMs * 0.5, Date.now() - batchStart);
      if (kb.waitUntil != null) keepaWaitUntil = kb.waitUntil;
      else if (kb.next.length) keepaWaitUntil = null;
    }

    // Park what's left, with what it has collected so far.
    await mapLimit([...q.lookup, ...q.keepa, ...q.account], 10, (row) => safely(row, () => park(row)));
  } finally {
    const p = await runProgress(runId);
    await updateRun(
      runId,
      {
        processed_count: p.processed,
        row_count: p.total,
        ...(p.done ? { status: "done", finished_at: new Date().toISOString() } : {}),
      },
      {
        lease_until: null,
        resume_after: keepaWaitUntil != null && p.waiting.keepa ? new Date(keepaWaitUntil).toISOString() : null,
        ...(progressed ? { last_progress_at: new Date().toISOString() } : {}),
      },
    );
  }
  return runProgress(runId, { progressed, leased: lease === true });
}

interface StageEnv {
  runId: string;
  cfg: ProfileConfig;
  card: RateCard;
  rules: CategoryRule[];
  approved: Approved;
  spapi: ReturnType<typeof getSpApi>;
  keepa: ReturnType<typeof getKeepa>;
  recordTokens: OnKeepaResponse;
}

interface StageOut {
  /** Rows finished (a verdict saved). */
  finished: number;
  /** Rows moved on to a later stage. */
  next: Row[];
}

/** Put a row in the queue its stage calls for. */
function route(row: Row, q: Queues, env: StageEnv) {
  if (row.stage === "buybox") (env.keepa.available ? q.keepa : q.account).push(row);
  else if (STAGE_RANK[row.stage] < STAGE_RANK.enriched && row.stage !== "priced") q.lookup.push(row);
  else if (env.keepa.available && row.match?.asin && !row.market?.hasHistory) {
    row.stage = "priced";
    q.keepa.push(row);
  } else q.account.push(row);
}

/** Save a row that's still in progress: its inputs so far, still pending. */
async function park(row: Row) {
  const inputs: StoredInputs = {
    v: 1, stage: row.stage, match: row.match, market: row.market, hazmat: row.hazmat,
    restriction: row.restriction, amazonFees: row.amazonFees, lookup: row.lookup, sellers: row.sellers, notes: row.dataNotes,
    qogita: row.qogita,
  };
  must(await db().from("results").update({ inputs, status: "pending", updated_at: new Date().toISOString() }).eq("id", row.resultId), "park");
}

/** Save verdicts in parallel. */
async function finishAll(items: { row: Row; run: GateRun; ctx: ScreenContext }[], cfg: ProfileConfig) {
  await mapLimit(items, 10, ({ row, run, ctx }) => safely(row, () => finalize(row, run, cfg, ctx)));
  return items.length;
}

/**
 * The scoring price can only fail the price band before Keepa if the failure is certain:
 * under the "lower of current and median" rule the price can't rise above today's Buy Box,
 * so a Buy Box under the floor fails whatever the median; under "current" either end is final.
 */
/**
 * Gates that current offers (SP-API, free) already settle, so the row needn't wait for Keepa:
 * Amazon selling now, and an FBA seller count outside the range, each only when its gate is
 * set to fail; and a Buy Box that fails the price band whatever the history says.
 */
function certainBeforeKeepa(row: Row, cfg: ProfileConfig): GateId[] {
  const m = row.market;
  if (!m || m.hasHistory) return [];
  const out: GateId[] = [];
  if (earlyPriceFail(row, cfg)) out.push("priceBand");
  if (cfg.gates.amazonPresence.mode === "fail" && m.amazonNow) out.push("amazonPresence");
  const c = cfg.gates.competition;
  if (c.mode === "fail" && m.fbaOffers != null && (m.fbaOffers < c.minSellers || m.fbaOffers > c.maxSellers)) out.push("competition");
  return out;
}

function earlyPriceFail(row: Row, cfg: ProfileConfig): boolean {
  const g = cfg.gates.priceBand;
  const bb = row.market?.currentBuyBox;
  if (g.mode !== "fail" || bb == null || row.market?.hasHistory) return false;
  if (cfg.scoringPrice === "lower") return bb < g.min;
  if (cfg.scoringPrice === "current") return bb < g.min || bb > g.max;
  return false;
}

/** Stage 1: row gates, catalog match, current price, and the checks those make possible. */
async function stageLookup(rows: Row[], env: StageEnv): Promise<StageOut & { added: Row[] }> {
  const { cfg, card, rules, approved, spapi, keepa, runId } = env;
  const d = db();
  if (!rows.length) return { finished: 0, next: [], added: [] };
  const done: { row: Row; run: GateRun; ctx: ScreenContext }[] = [];
  const addedIds: string[] = [];

  // Row gates first: a failure here costs no API call.
  const pre: GateId[] = ["compliance", "budgetFit"];
  let live: Row[] = [];
  for (const row of rows) {
    const ctx = context(row, card, rules, cfg, approved);
    const run = runGates(ctx, cfg, pre);
    if (run.failedGate) done.push({ row, run, ctx });
    else live.push(row);
  }

  for (const r of live) r.dataNotes = r.dataNotes.filter((n) => !/lookup failed|Keepa/i.test(n));
  const needCatalog = live.filter((r) => !r.product.asin || !FRESH(r.product.catalog_updated_at, CATALOG_TTL));
  let catalog = new Map<string, CatalogMatch[]>();
  let traces = new Map<string, LookupTrace>();
  if (spapi && needCatalog.length) {
    try {
      ({ matches: catalog, traces } = await spapi.lookupEans([...new Set(needCatalog.map((r) => r.product.ean))]));
    } catch (e) {
      for (const r of needCatalog) r.dataNotes.push(`Catalog lookup failed: ${(e as Error).message}.`);
    }
  }
  let keepaByEan = new Map<string, KeepaProduct[]>();
  const fetched = new Map<string, KeepaProduct>();
  const unresolved = live.filter((r) => !r.product.asin && !catalog.get(r.product.ean)?.length);
  if (keepa.available && unresolved.length) {
    try {
      const res = await keepa.lookupByEans([...new Set(unresolved.map((r) => r.product.ean))], env.recordTokens, { buyBox: false });
      keepaByEan = res.byEan;
      for (const [asin, k] of res.byAsin) fetched.set(asin, k);
    } catch (e) {
      for (const r of unresolved) r.dataNotes.push(`Keepa lookup failed: ${(e as Error).message}.`);
    }
  }

  const resolved: Row[] = [];
  await mapLimit(live, 10, (row) => safely(row, async () => {
    const extras = await resolveRow(row, { catalog, traces, keepaByEan, needCatalog, spapi: !!spapi, keepaLive: keepa.available, card, runId });
    addedIds.push(...extras);
    resolved.push(row);
  }));
  live = resolved;

  // History already on hand (a snapshot within the max age, or found by EAN just now), else SP-API pricing.
  const cached = await freshSnapshots(live.map((r) => r.match?.asin).filter((a): a is string => !!a), maxAgeMs(cfg));
  for (const [asin, k] of fetched) {
    try {
      await saveSnapshot(k);
    } catch (e) {
      console.error(`[keepa] storing snapshot for ${asin} failed: ${(e as Error).message}`);
    }
    cached.set(asin, k.summary);
  }
  const noHistory = live.filter((r) => r.match?.asin && !cached.has(r.match.asin));
  let pricing = new Map<string, CompetitivePrice>();
  if (spapi && noHistory.length) {
    try {
      pricing = await spapi.getCompetitivePricing([...new Set(noHistory.map((r) => r.match!.asin!))]);
    } catch (e) {
      for (const r of noHistory) r.dataNotes.push(`Pricing lookup failed: ${(e as Error).message}.`);
    }
  }
  // Rows headed for Keepa: who's selling now (free) settles some gates first.
  let offers = new Map<string, ListingOffers>();
  const bound = keepa.available ? noHistory.filter((r) => r.match?.asin) : [];
  if (spapi && bound.length) {
    try {
      offers = await spapi.getItemOffersBatch([...new Set(bound.map((r) => r.match!.asin!))]);
    } catch (e) {
      console.error(`[spapi] item offers failed: ${(e as Error).message}`);
    }
  }
  const next: Row[] = [];
  for (const row of live) {
    const asin = row.match?.asin;
    if (asin) {
      const snap = cached.get(asin);
      row.market = snap ? marketFromKeepa(snap) : marketFromSpApi(pricing.get(asin), row.product.sales_rank);
      const o = offers.get(asin);
      if (o && row.market && !row.market.hasHistory) {
        row.market = {
          ...row.market,
          amazonNow: o.amazon,
          // SP-API counts Amazon's own offer as FBA; the competition range is about other sellers.
          fbaOffers: o.fbaOffers != null ? Math.max(0, o.fbaOffers - (o.amazon ? 1 : 0)) : row.market.fbaOffers,
          offersNow: o.totalOffers ?? row.market.offersNow,
          currentBuyBox: o.buyBox ?? row.market.currentBuyBox,
        };
      }
    }
    row.stage = "enriched";
    const ctx = context(row, card, rules, cfg, approved);
    // No listing, or what current offers already settle: done before any Keepa token.
    const certain = certainBeforeKeepa(row, cfg);
    const early = runGates(ctx, cfg, GATE_ORDER.filter((g) => [...pre, "matchQuality", ...certain].includes(g)));
    if (early.failedGate && certain.includes(early.failedGate)) row.notes.push("Ruled out from current offers before any Keepa token.");
    if (early.failedGate) {
      done.push({ row, run: early, ctx });
      continue;
    }
    if (keepa.available && asin && !row.market?.hasHistory) {
      row.stage = "priced";
      next.push(row);
      continue;
    }
    const mid = runGates(ctx, cfg, GATE_ORDER.filter((g) => g !== "gating" && g !== "fees"));
    if (mid.failedGate) done.push({ row, run: mid, ctx });
    else next.push(row);
  }

  const finished = await finishAll(done, cfg);
  const added = addedIds.length
    ? await loadRows(must(await d.from("results").select("id, product_id, offer_id, inputs").in("id", addedIds), "added") as PendingRow[], maxAgeMs(cfg))
    : [];
  return { finished, next, added };
}

/** Stage 2: Keepa history, as many rows as the token balance covers; the rest wait. */
async function stageKeepa(rows: Row[], env: StageEnv): Promise<StageOut & { deferred: Row[]; waitUntil: number | null; tokens?: KeepaTokens }> {
  const { cfg, card, rules, approved, keepa } = env;
  if (!rows.length) return { finished: 0, next: [], deferred: [], waitUntil: null };
  let tokens: KeepaTokens | undefined;

  // Stage 1 (history, 1 token) for rows with none; stage 2 (with Buy Box, 3 tokens) for rows that
  // passed everything else. Snapshots within the max age cost nothing.
  const stage2 = (r: Row) => r.stage === "buybox";
  const fresh = await freshSnapshots(rows.map((r) => r.match!.asin!), maxAgeMs(cfg));
  const covered = (r: Row) => { const s = fresh.get(r.match!.asin!); return !!s && (!stage2(r) || s.buyBoxFetched !== false); };
  const need = rows.filter((r) => !covered(r));
  const cost = (r: Row) => (stage2(r) ? KEEPA_BUYBOX_TOKENS : KEEPA_HISTORY_TOKENS);
  let take = rows;
  let deferred: Row[] = [];
  let waitUntil: number | null = null;
  if (need.length) {
    const status = await keepa.tokenStatus();
    if (status) tokens = status;
    if (status) {
      // Take rows in queue order (best first) while the balance covers them.
      let left = status.tokensLeft;
      const allowed = new Set<Row>();
      const seen = new Map<string, number>();
      for (const r of need) {
        const key = `${r.match!.asin}:${stage2(r)}`;
        if (seen.has(key)) { allowed.add(r); continue; }
        if (left < cost(r)) break;
        left -= cost(r);
        seen.set(key, 1);
        allowed.add(r);
      }
      if (allowed.size < need.length) {
        take = rows.filter((r) => covered(r) || allowed.has(r));
        deferred = rows.filter((r) => !take.includes(r));
        // Next batch of up to 20: wait for the next refill, plus whole minutes beyond it.
        const want = deferred.slice(0, 20).reduce((a, r) => a + cost(r), 0);
        const short = Math.max(0, want - Math.max(0, left));
        const minutes = Math.max(0, Math.ceil(short / Math.max(1, status.refillRate)) - 1);
        waitUntil = Date.now() + status.refillInMs + minutes * 60_000;
      }
    }
  }
  if (!take.length) return { finished: 0, next: [], deferred, waitUntil, tokens };

  const one = take.filter((r) => !stage2(r)), two = take.filter(stage2);
  const [h, bb] = await Promise.all([
    attachKeepa(one, new Map(), env.recordTokens, { buyBox: false, maxAgeMs: maxAgeMs(cfg) }),
    attachKeepa(two, new Map(), env.recordTokens, { buyBox: true, maxAgeMs: maxAgeMs(cfg) }),
  ]);
  const done: { row: Row; run: GateRun; ctx: ScreenContext }[] = [];
  const next: Row[] = [];
  for (const row of take) {
    const res = stage2(row) ? bb : h;
    const snap = res.summaries.get(row.match!.asin!);
    if (!snap && res.exhausted) {
      deferred.push(row);
      waitUntil ??= Date.now() + 60_000;
      continue;
    }
    if (stage2(row)) {
      // Stage 2: the Buy Box data is in (or couldn't be had); back to the account stage for the verdict.
      if (snap) row.market = marketFromKeepa(snap);
      if (row.market?.buyBoxFetched === false) row.market = { ...row.market, buyBoxFetched: true };
      row.stage = "account";
      next.push(row);
      continue;
    }
    if (snap) row.market = marketFromKeepa(snap);
    row.stage = "enriched";
    const ctx = context(row, card, rules, cfg, approved);
    const mid = runGates(ctx, cfg, GATE_ORDER.filter((g) => g !== "gating" && g !== "fees"));
    if (mid.failedGate) done.push({ row, run: mid, ctx });
    else next.push(row);
  }
  return { finished: await finishAll(done, cfg), next, deferred, waitUntil, tokens };
}

/** Stage 3: your account — gating in parallel, Amazon's fees 20 at a time, sellers, verdict. */
const isQogita = (row: Row) => row.supplier.name === "Qogita";

/** The chosen offer and why, for the stored inputs (the expanded row highlights it). */
function pick(q: QogitaOffers, cfg: ProfileConfig): Pick<QogitaOffers, "chosen" | "reason"> {
  const c = chooseOffer(q.offers, cfg.budget, q.fxRate);
  return { chosen: c.chosen?.qid ?? null, reason: c.reason };
}

/** The MOV and delivery limits of the Qogita pull that made this run (none before the migration). */
async function pullLimits(runId: string): Promise<{ movLimit: number | null; maxWeeks: number | null }> {
  const res = await db().from("qogita_pulls").select("preset:qogita_presets(filters)").eq("run_id", runId).limit(1);
  const f = (res.data?.[0] as { preset?: { filters?: { movLimit?: number | null; maxDeliveryWeeks?: number | null } } } | undefined)?.preset?.filters;
  return { movLimit: f?.movLimit ?? null, maxWeeks: f?.maxDeliveryWeeks ?? null };
}

/**
 * Qogita rows that passed every gate: fetch every supplier's offer for the variant (within the
 * pull's MOV and delivery limits) so the budget gate can use the chosen supplier's real MOV.
 */
async function attachQogitaOffers(rows: Row[], env: StageEnv): Promise<void> {
  if (!rows.length) return;
  const q = getQogita();
  if (!q) {
    for (const row of rows) row.notes.push("Qogita offers not checked: QOGITA_EMAIL / QOGITA_PASSWORD not set.");
    return;
  }
  const limits = await pullLimits(env.runId).catch(() => ({ movLimit: null, maxWeeks: null }));
  await mapLimit(rows, 3, async (row) => {
    try {
      let fid = variantFid(row.offer.external_ref);
      if (!fid) {
        // Before the migration the link isn't stored: find the variant by its GTIN.
        for await (const page of q.products({ gtin: row.product.ean })) { fid = variantFid(page.results[0]?.productUrl); break; }
      }
      if (!fid) throw new Error("no Qogita product for this EAN");
      const raw = await q.variantOffers(fid, { maxMov: limits.movLimit, maxWeeks: limits.maxWeeks });
      const offers = raw.offers.map(toSupplierOffer).filter((o): o is SupplierOffer => !!o);
      const base: QogitaOffers = {
        fid, currency: String(row.offer.currency ?? "EUR"), fxRate: Number(row.offer.fx_rate), fetchedAt: new Date().toISOString(),
        movLimit: limits.movLimit, offers, chosen: null, reason: "", excluded: raw.excluded,
      };
      row.qogita = { ...base, ...pick(base, env.cfg) };
    } catch (e) {
      row.notes.push(`Qogita offers not checked: ${(e as Error).message}.`);
    }
  });
}

async function stageAccount(rows: Row[], env: StageEnv): Promise<StageOut> {
  const { cfg, card, rules, approved, spapi, keepa } = env;
  if (!rows.length) return { finished: 0, next: [] };
  if (spapi) {
    // Parallel up to Amazon's burst; the client's token bucket holds it to 5 a second.
    await mapLimit(rows.filter((r) => r.match?.asin && needsRestrictionCheck(r)), 10, async (row) => {
      try {
        const r = await spapi.getListingsRestrictions(row.match!.asin!);
        row.restriction = {
          status: r.status,
          message: r.reasons.map((x) => x.message).filter(Boolean).join(" "),
          links: r.reasons.flatMap((x) => x.links),
        };
      } catch (e) {
        row.restriction = { status: "unknown", message: `Restriction check failed: ${(e as Error).message}` };
      }
    });
    const priced = rows
      .map((row) => ({ row, price: resolveScoringPrice(row.market, cfg).price }))
      .filter((x): x is { row: Row; price: number } =>
        !!x.row.match?.asin && x.price != null && x.row.restriction?.status !== "blocked" &&
        !(x.row.amazonFees && Math.abs(x.row.amazonFees.price - x.price) < 0.005));
    if (priced.length) {
      try {
        const est = await spapi.getMyFeesEstimates(priced.map((x) => ({ asin: x.row.match!.asin!, price: x.price })));
        est.forEach((f, i) => {
          if (f.ok && f.referral != null && f.fba != null) priced[i].row.amazonFees = { price: priced[i].price, referral: f.referral, fba: f.fba };
        });
      } catch (e) {
        for (const x of priced) x.row.notes.push(`Amazon fee estimate failed, rate card used: ${(e as Error).message}.`);
      }
    }
  }
  const passing = rows.filter((row) => needsSellers(row, runGates(context(row, card, rules, cfg, approved), cfg), cfg));
  if (passing.length && keepa.available) {
    const { profiles, note } = await sellerProfiles(passing.flatMap((r) => wantedSellers(r, cfg).map((s) => s.sellerId)), env.recordTokens);
    for (const row of passing) {
      row.sellers = sellerViews(row, cfg, profiles);
      if (note) row.notes.push(note);
      if (row.sellers.some((s) => !s.name && s.storefrontSize == null)) row.sellers = null;
    }
  }
  // Stage 2: rows that pass every gate on stage-1 history go back for Keepa's Buy Box data (3 tokens)
  // before a verdict: gate 7's top-seller share, and the Buy Box price itself.
  const stage2: Row[] = [];
  rows = rows.filter((row) => {
    if (wantsBuyBox(row, keepa.available) && !runGates(context(row, card, rules, cfg, approved), cfg).failedGate) {
      row.stage = "buybox";
      stage2.push(row);
      return false;
    }
    return true;
  });
  await attachQogitaOffers(rows.filter((row) => isQogita(row) && !row.qogita && !runGates(context(row, card, rules, cfg, approved), cfg).failedGate), env);
  const done = rows.map((row) => {
    row.stage = "account";
    const ctx = context(row, card, rules, cfg, approved);
    return { row, run: runGates(ctx, cfg), ctx };
  });
  return { finished: await finishAll(done, cfg), next: stage2 };
}

/**
 * Match a row's EAN to its listing(s) and update the product. An EAN with several ASINs
 * keeps them all: extra ones become new products and join the run; their result ids are
 * returned so the same call can pick them up.
 */
async function resolveRow(
  row: Row,
  x: {
    catalog: Map<string, CatalogMatch[]>; traces: Map<string, LookupTrace>; keepaByEan: Map<string, KeepaProduct[]>;
    needCatalog: Row[]; spapi: boolean; keepaLive: boolean; card: RateCard; runId: string;
  },
): Promise<string[]> {
  const d = db();
  const p = row.product;
  const cat = x.catalog.get(p.ean) ?? [];
  const kp = x.keepaByEan.get(p.ean) ?? [];
  if (!x.spapi && !x.keepaLive) return [];
  const catalogChecked = x.needCatalog.includes(row) && x.spapi;
  const asins = [...new Set([...cat.map((c) => c.asin), ...kp.map((k) => k.asin), ...(p.asin ? [p.asin] : [])])];
  const primary = p.asin ?? asins[0] ?? null;
  const trace = x.traces.get(p.ean);
  if (trace) row.lookup = trace;
  row.match = { asin: primary, asinCount: Math.max(1, asins.length, row.match?.asinCount ?? 0), looked: true };
  if (!primary && trace?.outcome === "api_error") {
    // Amazon didn't answer, so this isn't a verdict on the product: leave it retryable.
    const err = trace.attempts.find((a) => a.error)?.error ?? "no response";
    throw new Error(`Catalog lookup failed for EAN ${p.ean}: ${err}. Re-screen to retry.`);
  }
  if (!primary) {
    row.match.note = missNote(trace);
    if (catalogChecked) must(await d.from("products").update({ catalog_updated_at: new Date().toISOString() }).eq("id", p.id), "product");
    return [];
  }
  const c = cat.find((y) => y.asin === primary);
  const k = kp.find((y) => y.asin === primary);
  const update: Partial<Product> & { updated_at: string } = { asin: primary, updated_at: new Date().toISOString() };
  if (c) {
    Object.assign(update, {
      title: c.title ?? p.title, brand: c.brand ?? p.brand, category: c.category ?? p.category,
      dims_cm: c.dimsCm ?? p.dims_cm, weight_g: c.weightG ?? p.weight_g, sales_rank: c.salesRank,
      parent_asin: c.parentAsin, variation_count: c.variationCount, catalog_updated_at: new Date().toISOString(),
      image_url: c.imageUrl ?? p.image_url ?? "",
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
      image_url: update.image_url || k.imageUrl || p.image_url || "",
    });
  }
  update.referral_category = referralCategoryFor((update.category ?? p.category) as string | null, x.card);
  must(await d.from("products").update(update).eq("id", p.id), "update product");
  row.product = { ...p, ...update } as Product;

  const added: string[] = [];
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
      { run_id: x.runId, product_id: productId, offer_id: newOffer.id },
      { onConflict: "run_id,product_id", ignoreDuplicates: true },
    ).select("id");
    if (inserted.error) throw new Error(`queue ASIN ${extra}: ${inserted.error.message}`);
    added.push(...((inserted.data ?? []) as { id: string }[]).map((r) => r.id));
  }
  return added;
}
