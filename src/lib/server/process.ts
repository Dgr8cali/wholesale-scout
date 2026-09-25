import "server-only";
import { referralCategoryFor } from "../fees/engine";
import type { RateCard } from "../fees/rateCard";
import { getKeepa, type KeepaProduct, type KeepaSummary } from "../keepa/client";
import { GATE_ORDER, withDefaults, type GateId, type ProfileConfig } from "../screening/config";
import { resolveScoringPrice, runGates, verdictOf, type GateRun, type MarketData, type ScreenContext } from "../screening/gates";
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

function context(row: Row, card: RateCard, rules: CategoryRule[], cfg: ProfileConfig): ScreenContext {
  const p = row.product, o = row.offer, s = row.supplier;
  return {
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
      dimsCm: p.dims_cm,
      weightG: p.weight_g == null ? null : Number(p.weight_g),
      variationCount: p.variation_count,
      hazmat: row.hazmat,
    },
    market: row.market,
    restriction: row.restriction,
    amazonFees: feesAt(row, cfg),
  };
}

const r2 = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100);

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
    restriction: row.restriction, amazonFees: row.amazonFees, lookup: row.lookup, notes: row.dataNotes,
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
        outputVat: r2(e.outputVat),
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
  return results.map((r) => {
    const offer = O.get(r.offer_id)!;
    const product = P.get(r.product_id)!;
    const i = r.inputs?.v === 1 ? r.inputs : null;
    return {
      resultId: r.id, product, offer, supplier: S.get(offer.supplier_id)!,
      stage: i?.stage ?? "row",
      match: i?.match ?? (product.asin ? { asin: product.asin, asinCount: 1, looked: true } : null),
      market: i?.market ?? null,
      hazmat: i?.hazmat ?? [],
      restriction: i?.restriction ?? null,
      amazonFees: i?.amazonFees ?? null,
      lookup: i?.lookup ?? null,
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
  const [card, rules] = await Promise.all([activeRateCard(), loadRules()]);

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
  const requeue: string[] = [];
  const work: (() => Promise<void>)[] = [];
  const middle = GATE_ORDER.filter((g) => g !== "gating" && g !== "fees");
  rows.forEach((row, i) => {
    if (!all[i].inputs || all[i].status !== "done") {
      requeue.push(row.resultId);
      return;
    }
    const ctx = context(row, card, rules, cfg);
    const pre = runGates(ctx, cfg, ["compliance", "budgetFit"]);
    if (pre.failedGate) return void work.push(() => safely(row, () => finalize(row, pre, cfg, ctx)));
    if (STAGE_RANK[row.stage] < STAGE_RANK.enriched) return void requeue.push(row.resultId);
    const mid = runGates(ctx, cfg, middle);
    if (mid.failedGate) return void work.push(() => safely(row, () => finalize(row, mid, cfg, ctx)));
    if (STAGE_RANK[row.stage] < STAGE_RANK.account || needsRestrictionCheck(row)) return void requeue.push(row.resultId);
    const full = runGates(ctx, cfg);
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
  const [card, rules] = await Promise.all([activeRateCard(), loadRules()]);
  const spapi = getSpApi();
  const keepa = getKeepa();

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
        const ctx = context(row, card, rules, cfg);
        const run = runGates(ctx, cfg, pre);
        if (run.failedGate) await finalize(row, run, cfg, ctx);
        else survivors.push(row);
      });
    }
    // Rows re-queued by Re-screen keep what was already fetched for them.
    const enrichedBefore = survivors.filter((r) => STAGE_RANK[r.stage] >= STAGE_RANK.enriched);
    rows = survivors.filter((r) => STAGE_RANK[r.stage] < STAGE_RANK.enriched);

    // Stage 2 — match and enrich: SP-API catalog by EAN, Keepa history (24-hour cache).
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

    const snapshots = new Map<string, KeepaSummary>();
    const knownAsins = rows.map((r) => r.product.asin).filter((a): a is string => !!a);
    if (knownAsins.length) {
      const snaps = must(
        await d.from("keepa_snapshots").select("asin, fetched_at, summary").in("asin", knownAsins)
          .gte("fetched_at", new Date(Date.now() - KEEPA_TTL).toISOString()).order("fetched_at", { ascending: false }),
        "snapshots",
      ) as { asin: string; summary: KeepaSummary }[];
      for (const s of snaps) if (!snapshots.has(s.asin)) snapshots.set(s.asin, s.summary);
    }
    let keepaByEan = new Map<string, KeepaProduct[]>();
    const needKeepa = rows.filter((r) => !r.product.asin || !snapshots.has(r.product.asin));
    if (keepa.available && needKeepa.length) {
      try {
        const res = await keepa.lookupByEans([...new Set(needKeepa.map((r) => r.product.ean))]);
        keepaByEan = res.byEan;
        if (res.tokensUsed) must(await d.from("runs").update({ token_cost: runRow.token_cost + res.tokensUsed }).eq("id", runId), "tokens");
        const snapRows = [...res.byEan.values()].flat().map((k) => ({
          asin: k.asin,
          rank_series: k.series.rank,
          buybox_series: k.series.buyBox,
          new_series: k.series.newPrice,
          offer_count_series: k.series.offerCount,
          amazon_series: k.series.amazon,
          review_count_series: k.series.reviewCount,
          summary: k.summary,
        }));
        if (snapRows.length) must(await d.from("keepa_snapshots").insert(snapRows), "save snapshots");
        for (const k of [...res.byEan.values()].flat()) snapshots.set(k.asin, k.summary);
      } catch (e) {
        for (const r of needKeepa) r.dataNotes.push(`Keepa lookup failed: ${(e as Error).message}.`);
      }
    }

    // Resolve ASINs. An EAN that maps to several ASINs keeps them all: extra ones become
    // new products with the same offer and join this run as pending rows.
    const resolved: Row[] = [];
    for (const row of rows) await safely(row, async () => {
      row.dataNotes = row.dataNotes.filter((n) => !/lookup failed/i.test(n));
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
      row.match = { asin: primary, asinCount: Math.max(1, asins.length), looked: true };
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
    for (const row of rows) row.stage = "enriched";
    rows = [...enrichedBefore, ...rows];

    // Stage 3 — every gate except gating and fees, on the enriched rows.
    const middle = GATE_ORDER.filter((g) => g !== "gating" && g !== "fees");
    const stage3: Row[] = [];
    for (const row of rows) {
      await safely(row, async () => {
        const ctx = context(row, card, rules, cfg);
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
    for (const row of stage3) {
      await safely(row, async () => {
        row.stage = "account";
        const ctx = context(row, card, rules, cfg);
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
