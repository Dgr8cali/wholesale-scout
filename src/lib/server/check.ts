import "server-only";
import { parseCheckInput, type CheckLine } from "../check/parse";
import { economics, hurdlePrice, maxLandedCost, referralCategoryFor, unitCostFromLanded } from "../fees/engine";
import type { ProfileConfig } from "../screening/config";
import type { ColumnMapping, NormalizedRow } from "../ingest/mapping";
import { listingPack } from "../screening/pack";
import { applyLinks } from "../spapi/parse";
import type { CatalogMatch, RestrictionLink } from "../spapi/types";
import { getSpApi } from "../spapi/client";
import { estSales, firstOrderFigures, share, type StoredMarket } from "../ui/metrics";
import { activeRateCard, db, loadProfile, must } from "./db";
import { ingest } from "./ingest";
import { processRun } from "./process";

/** VAT rate assumed on a pasted cost's goods (the landed cost is converted back with it). */
const CHECK_VAT = 20;

export interface CheckRequest {
  /** One ASIN, EAN or Amazon link per line, optionally with a landed cost. */
  text: string;
  /** Supplier to file the offers under; "Manual" when blank. */
  supplier?: string | null;
  profileId?: string | null;
}

/** What an ASIN check run keeps in its stats, to list and re-run it. */
export interface CheckStats {
  input: string;
  supplier: string;
  codes: string[];
}

/**
 * An ASIN check: the pasted lines become a run exactly as an upload does (supplier, offers,
 * results), so the same gates, fees, Keepa and gating checks run and it lands in Runs. ASINs
 * are read from the catalog up front, so the row starts matched; EANs are matched as usual.
 * A line with no cost is screened without the fee and budget gates.
 */
export async function startCheck(req: CheckRequest): Promise<{ runId: string; lines: number; errors: string[] }> {
  const parsed = parseCheckInput(req.text ?? "");
  const errors = [...parsed.errors];
  if (!parsed.lines.length) throw new Error(errors[0] ?? "Paste at least one ASIN, EAN or Amazon link");
  const d = db();
  const [profile, card] = await Promise.all([loadProfile(req.profileId), activeRateCard()]);
  const supplier = req.supplier?.trim() || "Manual";

  // ASINs: the catalog item for each, and a product matched to it.
  const asinLines = parsed.lines.filter((l) => l.kind === "asin");
  const spapi = getSpApi();
  let catalog = new Map<string, CatalogMatch>();
  if (spapi && asinLines.length) catalog = await spapi.catalogByAsins(asinLines.map((l) => l.code));
  const productFor = new Map<string, { id: string; ean: string; title: string | null }>();
  for (const l of asinLines) {
    const c = catalog.get(l.code);
    if (spapi && !c) {
      errors.push(`line ${l.line}: ${l.code} isn't on Amazon UK`);
      continue;
    }
    productFor.set(l.code, await upsertAsinProduct(l.code, c ?? null, card));
  }

  const rows: NormalizedRow[] = [];
  for (const l of parsed.lines) {
    if (l.kind === "asin" && !productFor.has(l.code)) continue;
    const cost = costOf(l, profile.config.fees);
    if ("error" in cost) {
      errors.push(`line ${l.line}: ${cost.error}`);
      continue;
    }
    const p = l.kind === "asin" ? productFor.get(l.code)! : null;
    rows.push({
      ean: p?.ean ?? l.code,
      productId: p?.id,
      unitCost: cost.unit,
      unitCostGbp: cost.unit,
      costKnown: cost.known,
      packUnits: 1,
      moq: 1,
      stock: null,
      // An ASIN's cost is for the listing as sold: giving the offer the listing's own title
      // makes its pack match the listing's, so nothing is scaled.
      title: p?.title ?? null,
      brand: null,
      category: null,
      sourceRow: l.line,
      eanValid: true,
    });
  }
  if (!rows.length) throw new Error(errors[0] ?? "Nothing to check");

  const codes = parsed.lines.filter((l) => rows.some((r) => r.sourceRow === l.line)).map((l) => l.code);
  const source = `ASIN check · ${codes.length <= 3 ? codes.join(", ") : `${codes.slice(0, 2).join(", ")} +${codes.length - 2}`}`;
  const check: CheckStats = { input: req.text, supplier, codes };
  const { runId } = await ingest({
    profileId: profile.id,
    name: source,
    stats: { check },
    files: [{
      fileName: source,
      supplier: { name: supplier, vatBasis: "ex_vat", vatRate: CHECK_VAT, currency: "GBP" },
      keepSupplier: true,
      headers: [],
      fingerprint: "",
      mapping: { headerRow: 0, columns: {}, pricePer: "unit" } as unknown as ColumnMapping,
      fx: { rate: 1, date: new Date().toISOString().slice(0, 10) },
      rows,
    }],
  });
  // A check is someone waiting: it goes first on Keepa.
  await d.from("runs").update({ keepa_first_at: new Date().toISOString() }).eq("id", runId);
  return { runId, lines: rows.length, errors };
}

/** A line's ex-VAT unit cost from its landed cost, or 0 with no cost given. */
function costOf(l: CheckLine, fees: Parameters<typeof unitCostFromLanded>[2]): { unit: number; known: boolean } | { error: string } {
  if (l.landedGbp == null) return { unit: 0, known: false };
  const unit = unitCostFromLanded(l.landedGbp, { goodsVatRatePct: CHECK_VAT }, fees);
  if (unit == null) return { error: `£${l.landedGbp.toFixed(2)} landed doesn't cover inbound and prep (£${(fees.inboundPerUnit + fees.prepPerUnit).toFixed(2)})` };
  return { unit, known: true };
}

/** The product for an ASIN, created or refreshed from its catalog item. EAN: the listing's, else the ASIN. */
async function upsertAsinProduct(asin: string, c: CatalogMatch | null, card: Awaited<ReturnType<typeof activeRateCard>>) {
  const d = db();
  const existing = must(await d.from("products").select("id, ean, title").eq("asin", asin).limit(1), "product") as { id: string; ean: string; title: string | null }[];
  const ean = existing[0]?.ean ?? c?.eans.find((e) => /^\d{13}$/.test(e)) ?? c?.eans[0] ?? asin;
  const fields = c ? {
    title: c.title, brand: c.brand, category: c.category, dims_cm: c.dimsCm, weight_g: c.weightG, sales_rank: c.salesRank,
    parent_asin: c.parentAsin, variation_count: c.variationCount, image_url: c.imageUrl ?? "",
    pack_attrs: c.pack ?? null, pack_count: listingPack(c.title, c.pack).count, amazon_dg: c.dg ?? null,
    referral_category: referralCategoryFor(c.category, card), catalog_updated_at: new Date().toISOString(),
  } : {};
  if (existing[0]) {
    if (c) must(await d.from("products").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", existing[0].id), "update product");
    return { id: existing[0].id, ean, title: c?.title ?? existing[0].title };
  }
  const row = must(await d.from("products").insert({ ean, asin, ...fields }).select("id").single(), "insert product") as { id: string };
  return { id: row.id, ean, title: c?.title ?? null };
}

/**
 * Work on a check until it's screened or `waitMs` is up (a single ASIN takes a few seconds;
 * Keepa can make it wait longer). Returns whether it finished; the chain carries on if not.
 */
export async function runCheckFor(runId: string, waitMs: number): Promise<boolean> {
  const until = Date.now() + waitMs;
  let idle = 0;
  while (Date.now() < until - 1_000) {
    const p = await processRun(runId, { budgetMs: Math.max(2_000, until - Date.now()) });
    if (p.done) return true;
    // Busy elsewhere, waiting on Keepa tokens or paused: more calls now won't help.
    if (p.busy || p.paused || !p.progressed) idle++;
    else idle = 0;
    if (idle >= 2) break;
  }
  return false;
}

export interface VerdictCard {
  runId: string;
  resultId: string | null;
  /** Still being screened: the card fills in as data arrives. */
  pending: boolean;
  asin: string | null;
  ean: string | null;
  title: string | null;
  imageUrl: string | null;
  amazonUrl: string | null;
  verdict: "pass" | "warn" | "fail" | null;
  failedGate: string | null;
  score: number | null;
  band: string | null;
  why: string | null;
  costKnown: boolean;
  landed: number | null;
  profit: number | null;
  roi: number | null;
  margin: number | null;
  sellPrice: number | null;
  priceSource: string | null;
  /** With a cost: the sell price that clears the floors. Without: the most it can cost landed. */
  hurdle: { kind: "price" | "landed"; value: number | null };
  buyBox: number | null;
  salesPerMonth: number | null;
  sellers: number | null;
  amazon: { sellingNow: boolean; lastSeenDays: number | null } | null;
  yourSharePerMonth: number | null;
  orderQty: number | null;
  monthsToSell: number | null;
  fees: { referral: number | null; fba: number | null; total: number | null; source: string | null } | null;
  gating: { status: string; message: string | null; applyUrl: string | null } | null;
  keepaHistory: boolean;
  gates: { gate: string; label: string; status: string; detail: string }[];
  runUrl: string;
}

type ResultRow = {
  id: string; status: string; verdict: VerdictCard["verdict"]; failed_gate: string | null; score: number | null; band: string | null; why: string | null;
  landed_cost: number | null; profit: number | null; roi: number | null; margin: number | null; sell_price: number | null; price_source: string | null;
  hurdle_price: number | null; gate_outcomes: VerdictCard["gates"] | null;
  fees: { referral?: number | null; fba?: number | null; total?: number | null; source?: string | null } | null;
  inputs: { market?: (StoredMarket & { amazonNow?: boolean | null }) | null; maxLandedGbp?: number | null; restriction?: { status: string; message: string; links?: RestrictionLink[] } | null; pack?: { ratio: number } | null } | null;
  product: { asin: string | null; ean: string; title: string | null; image_url: string | null } | null;
  offer: { moq: number | null; cost_known?: boolean; unit_cost_gbp?: number } | null;
};

/** The compact verdict for a check's (first) row: the card on the run page and the extension's JSON. */
export async function verdictCard(runId: string): Promise<VerdictCard | null> {
  const d = db();
  const run = must(await d.from("runs").select("id, status, profile_snapshot").eq("id", runId).maybeSingle(), "run") as
    { id: string; status: string; profile_snapshot: ProfileConfig } | null;
  if (!run) return null;
  const r = (must(
    await d.from("results").select("id, status, verdict, failed_gate, score, band, why, landed_cost, profit, roi, margin, sell_price, price_source, hurdle_price, gate_outcomes, fees, inputs, product_id, offer_id")
      .eq("run_id", runId).order("score", { ascending: false, nullsFirst: false }).limit(1),
    "result",
  ) as unknown as (ResultRow & { product_id: string; offer_id: string })[])[0];
  if (r) {
    const [p, o] = await Promise.all([
      d.from("products").select("asin, ean, title, image_url, dims_cm, weight_g, referral_category").eq("id", r.product_id).maybeSingle(),
      d.from("offers").select("moq, cost_known, unit_cost_gbp").eq("id", r.offer_id).maybeSingle(),
    ]);
    r.product = p.data as ResultRow["product"];
    r.offer = o.data as ResultRow["offer"];
    if (r.status === "done") await fillIn(r, run.profile_snapshot);
  }
  const m = r?.inputs?.market ?? null;
  const costKnown = r?.offer?.cost_known !== false;
  const lineCap = (run.profile_snapshot.budget * run.profile_snapshot.gates.budgetFit.maxLineSharePct) / 100;
  const k = r?.inputs?.pack;
  const moq = r?.offer?.moq == null ? null : k && k.ratio !== 1 ? Math.max(1, Math.ceil(r.offer.moq / k.ratio)) : r.offer.moq;
  const order = r && costKnown && r.score != null ? firstOrderFigures(m, r.landed_cost, moq, lineCap) : null;
  const restriction = r?.inputs?.restriction ?? null;
  const asin = r?.product?.asin ?? null;
  return {
    runId,
    resultId: r?.id ?? null,
    pending: !r || r.status === "pending" || run.status !== "done",
    asin,
    ean: r?.product?.ean && r.product.ean !== asin ? r.product.ean : null,
    title: r?.product?.title ?? null,
    imageUrl: r?.product?.image_url || null,
    amazonUrl: asin ? `https://www.amazon.co.uk/dp/${asin}` : null,
    verdict: r?.status === "done" ? r.verdict : null,
    failedGate: r?.failed_gate ?? null,
    score: r?.score == null ? null : Number(r.score),
    band: r?.band ?? null,
    why: r?.why ?? null,
    costKnown,
    landed: num(r?.landed_cost),
    profit: num(r?.profit),
    roi: num(r?.roi),
    margin: num(r?.margin),
    sellPrice: num(r?.sell_price),
    priceSource: r?.price_source ?? null,
    hurdle: costKnown ? { kind: "price", value: num(r?.hurdle_price) } : { kind: "landed", value: num(r?.inputs?.maxLandedGbp) },
    buyBox: num(m?.currentBuyBox),
    salesPerMonth: estSales(m).value,
    sellers: m?.fbaOffers ?? m?.offersNow ?? null,
    amazon: m ? { sellingNow: !!m.amazonNow || m.amazonLastSeenDays === 0, lastSeenDays: m.amazonLastSeenDays ?? null } : null,
    yourSharePerMonth: share(m).value,
    orderQty: order?.qty.value ?? null,
    monthsToSell: order?.months.value ?? null,
    fees: r?.fees ? { referral: num(r.fees.referral), fba: num(r.fees.fba), total: num(r.fees.total), source: r.fees.source ?? null } : null,
    gating: restriction ? { status: restriction.status, message: restriction.message || null, applyUrl: applyLinks(restriction.links)[0]?.resource ?? null } : null,
    keepaHistory: !!m?.hasHistory,
    gates: (r?.gate_outcomes ?? []).map((g) => ({ gate: g.gate, label: g.label, status: g.status, detail: g.detail })),
    runUrl: `/runs/${runId}`,
  };
}

/**
 * A row that failed early never reached the fee and gating checks; a check still wants them
 * (they don't depend on the verdict). Fees and the hurdle come from the rate card at the
 * row's sell price; gating from Amazon, once, kept on the row for next time.
 */
async function fillIn(r: ResultRow, cfg: ProfileConfig) {
  const m = r.inputs?.market;
  const price = num(r.sell_price);
  const costKnown = r.offer?.cost_known !== false;
  const unit = costKnown ? Number(r.offer?.unit_cost_gbp ?? 0) : 0;
  if (price != null && (r.fees == null || (costKnown ? r.profit == null : r.inputs?.maxLandedGbp == null))) {
    const card = await activeRateCard();
    const p = r.product as ResultRow["product"] & { dims_cm?: { l: number; w: number; h: number } | null; weight_g?: number | null; referral_category?: string | null };
    const item = {
      referralCategory: p?.referral_category ?? null,
      dimsCm: p?.dims_cm ?? (m as { packageDims?: { l: number; w: number; h: number } | null } | undefined)?.packageDims ?? null,
      weightG: p?.weight_g != null ? Number(p.weight_g) : (m as { packageWeightG?: number | null } | undefined)?.packageWeightG ?? null,
      goodsVatRatePct: CHECK_VAT,
    };
    const f = cfg.gates.fees;
    const floors = { minProfit: f.minProfit, minRoiPct: f.minRoiPct, minMarginPct: f.minMarginPct };
    const e = economics(price, unit, item, card, cfg.fees);
    const r2 = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100);
    r.fees ??= { referral: r2(e.fees.referral), fba: r2(e.fees.fba), total: r2(e.fees.totalFees), source: e.fees.source };
    if (costKnown) {
      r.profit ??= r2(e.profit);
      r.roi ??= r2(e.roi);
      r.margin ??= r2(e.margin);
      r.landed_cost ??= r2(e.landed.total);
      r.hurdle_price ??= hurdlePrice(unit, item, card, cfg.fees, floors);
    } else {
      r.inputs = { ...r.inputs, maxLandedGbp: r.inputs?.maxLandedGbp ?? maxLandedCost(price, item, card, cfg.fees, floors) };
    }
  }
  const asin = r.product?.asin;
  const spapi = getSpApi();
  if (!r.inputs?.restriction && asin && spapi) {
    try {
      const x = await spapi.getListingsRestrictions(asin);
      const restriction = { status: x.status, message: x.reasons.map((y) => y.message).join(" "), links: x.reasons.flatMap((y) => y.links) };
      r.inputs = { ...r.inputs, restriction };
      if (x.status !== "unknown") await db().from("results").update({ inputs: r.inputs }).eq("id", r.id);
    } catch {
      // Gating stays unknown on the card; the verdict doesn't depend on it.
    }
  }
}

const num = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** The last `limit` checks, newest first, with what was pasted and how they came out. */
export async function recentChecks(limit = 20) {
  const d = db();
  const runs = must(
    await d.from("runs").select("id, name, source, status, started_at, row_count, stats").not("stats->check", "is", null)
      .is("archived_at", null).order("started_at", { ascending: false }).limit(limit),
    "checks",
  ) as { id: string; name: string | null; source: string; status: string; started_at: string; row_count: number; stats: { check: CheckStats } }[];
  const verdicts = new Map<string, { pass: number; warn: number; fail: number; pending: number; score: number | null }>();
  if (runs.length) {
    const rows = must(await d.from("results").select("run_id, status, verdict, score").in("run_id", runs.map((r) => r.id)), "results") as
      { run_id: string; status: string; verdict: string | null; score: number | null }[];
    for (const x of rows) {
      const v = verdicts.get(x.run_id) ?? { pass: 0, warn: 0, fail: 0, pending: 0, score: null };
      if (x.status === "pending") v.pending++;
      else if (x.verdict === "pass" || x.verdict === "warn" || x.verdict === "fail") v[x.verdict]++;
      if (x.score != null) v.score = Math.max(v.score ?? -Infinity, Number(x.score));
      verdicts.set(x.run_id, v);
    }
  }
  return runs.map((r) => ({
    id: r.id, name: r.name || r.source, status: r.status, startedAt: r.started_at, rows: r.row_count,
    input: r.stats.check.input, supplier: r.stats.check.supplier, codes: r.stats.check.codes,
    summary: verdicts.get(r.id) ?? null,
  }));
}
