import "server-only";
import { brandKey } from "../brands";
import { landedCost, maxLandedCost, type FeeOptions } from "../fees/engine";
import { judge, type JudgeInput, type Judgement } from "../product";
import { GATE_LABELS, type GateId } from "../screening/config";
import { isDormant } from "../screening/dormant";
import type { SeriesPoint } from "../sparkline";
import { activeRateCard, chunks, db, loadProfile, must } from "./db";
import { listDocuments } from "./documents";
import type { DocumentRow } from "../documents";

/** What the run page reads of a product and an offer (the same shape, so the row details work). */
const PRODUCT = "id, ean, asin, title, brand, category, referral_category, image_url, competitor_stock, sc_dg, dg_lookup, amazon_dg, dims_cm, weight_g, sales_rank, parent_asin, variation_count";
const RESULT = `*, product:products(${PRODUCT}), offer:offers(id, unit_cost, currency, unit_cost_gbp, cost_known, moq, pack_units, stock, title, source_ref, supplier:suppliers(id, name)), run:runs(id, name, source, started_at, profile:profiles(name))`;

type Row = Record<string, unknown>;

export interface ProductOffer {
  id: string; supplier: { id: string; name: string } | null; unitCostGbp: number | null; costKnown: boolean;
  landedGbp: number | null; moq: number | null; packUnits: number | null; stock: number | null; seenAt: string; title: string | null; sourceRef: string | null;
}

export interface ProductView {
  asin: string;
  /** The listing's products (one per EAN seen with it). */
  products: Row[];
  /** The latest finished screening, shaped like a run page row. */
  latest: Row | null;
  judgement: Judgement;
  /** Every finished screening, newest first. */
  history: { id: string; runId: string; runName: string; profile: string | null; at: string; verdict: string | null; score: number | null; failedGate: string | null; sellPrice: number | null; profit: number | null }[];
  keepa: { fetchedAt: string; rank: SeriesPoint[]; buyBox: SeriesPoint[]; offers: SeriesPoint[]; amazon: SeriesPoint[] } | null;
  offers: ProductOffer[];
  maxLandedGbp: number | null;
  approval: { status: string; requirement: string | null; status_date: string | null } | null;
  documents: DocumentRow[];
  favourite: Row | null;
  waivers: { gate: string; label: string; reason: string | null; created_at: string }[];
}

const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** Everything the app knows about one ASIN, for its page. Null when no product has it. */
export async function productView(asin: string): Promise<ProductView | null> {
  const d = db();
  const products = must(await d.from("products").select(PRODUCT).eq("asin", asin).order("updated_at", { ascending: false }), "products") as Row[];
  if (!products.length) return null;
  const ids = products.map((p) => p.id as string);
  const eans = products.map((p) => p.ean as string);
  const brand = (products.find((p) => p.brand)?.brand as string | undefined) ?? null;

  const results: Row[] = [];
  for (const c of chunks(ids)) {
    results.push(...(must(await d.from("results").select(RESULT).in("product_id", c).eq("status", "done").order("updated_at", { ascending: false }).limit(200), "results") as Row[]));
  }
  results.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  const latest = results[0] ?? null;

  const [snap, offers, profile, approvals, documents, favs, overrides] = await Promise.all([
    d.from("keepa_snapshots").select("fetched_at, rank_series, buybox_series, offer_count_series, amazon_series").eq("asin", asin).order("fetched_at", { ascending: false }).limit(1)
      .then((r) => (must(r, "snapshot") as Row[])[0] ?? null),
    d.from("offers").select("id, unit_cost_gbp, cost_known, moq, pack_units, stock, seen_at, title, source_ref, supplier:suppliers(id, name, vat_rate)").in("product_id", ids).order("seen_at", { ascending: false }).limit(200)
      .then((r) => must(r, "offers") as Row[]),
    loadProfile(null),
    brand ? d.from("brand_approvals").select("status, requirement, status_date").eq("brand_key", brandKey(brand)).maybeSingle().then((r) => must(r, "approval") as ProductView["approval"]) : Promise.resolve(null),
    brand ? listDocuments({ brand }) : Promise.resolve([] as DocumentRow[]),
    d.from("favourites").select("*").in("ean", eans).then((r) => must(r, "favourites") as Row[]),
    d.from("gate_overrides").select("gate, reason, created_at, asin").in("ean", eans).then((r) => must(r, "waivers") as Row[]),
  ]);

  // Each supplier's newest offer, with what it costs landed on the default profile.
  const bySupplier = new Map<string, Row>();
  for (const o of offers) {
    const key = ((o.supplier as Row | null)?.id as string | undefined) ?? String(o.id);
    if (!bySupplier.has(key)) bySupplier.set(key, o);
  }
  const offerList: ProductOffer[] = [...bySupplier.values()].map((o) => {
    const s = o.supplier as { id: string; name: string; vat_rate: number | null } | null;
    const cost = num(o.unit_cost_gbp);
    const known = o.cost_known !== false && cost != null && cost > 0;
    return {
      id: o.id as string, supplier: s ? { id: s.id, name: s.name } : null, unitCostGbp: known ? cost : null, costKnown: known,
      landedGbp: known ? Math.round(landedCost(cost!, { goodsVatRatePct: num(s?.vat_rate) ?? 20 }, profile.config.fees).total * 100) / 100 : null,
      moq: num(o.moq), packUnits: num(o.pack_units), stock: num(o.stock), seenAt: o.seen_at as string, title: (o.title as string) ?? null, sourceRef: (o.source_ref as string) ?? null,
    };
  }).sort((a, b) => (a.landedGbp ?? Infinity) - (b.landedGbp ?? Infinity));

  const inputs = (latest?.inputs ?? null) as { market?: JudgeInput["market"] & Record<string, unknown>; maxLandedGbp?: number | null; amazonFees?: FeeOptions["amazon"] } | null;
  // The most a unit can cost landed at the latest sell price and still clear the default
  // profile's floors: stored for checks without a cost, worked out here for the rest.
  let maxLanded = num(inputs?.maxLandedGbp);
  const price = num(latest?.sell_price);
  if (maxLanded == null && price != null && latest) {
    const lp = latest.product as { referral_category?: string | null; dims_cm?: { l: number; w: number; h: number } | null; weight_g?: number | null } | null;
    const mk = inputs?.market as { packageDims?: { l: number; w: number; h: number } | null; packageWeightG?: number | null } | undefined;
    const f = profile.config.gates.fees;
    maxLanded = maxLandedCost(price,
      { referralCategory: lp?.referral_category ?? null, dimsCm: lp?.dims_cm ?? mk?.packageDims ?? null, weightG: lp?.weight_g != null ? Number(lp.weight_g) : mk?.packageWeightG ?? null, goodsVatRatePct: 20 },
      await activeRateCard(), profile.config.fees, { minProfit: f.minProfit, minRoiPct: f.minRoiPct, minMarginPct: f.minMarginPct },
      inputs?.amazonFees ? { amazon: inputs.amazonFees } : undefined);
  }
  const m = inputs?.market ?? null;
  const gates = (latest?.gate_outcomes ?? []) as { gate: string; label: string; status: string; detail: string; tags?: string[] }[];
  const gating = gates.find((g) => g.gate === "gating");
  const fees = latest?.fees as { compare?: { amazon: { referral: number | null; fba: number | null } | null; rateCard: { referral: number | null; fba: number | null } } } | null;
  const sum = (x: { referral: number | null; fba: number | null } | null | undefined) => (x && x.referral != null && x.fba != null ? x.referral + x.fba : null);
  const approval = approvals ?? null;
  const input: JudgeInput = {
    verdict: (latest?.verdict as JudgeInput["verdict"]) ?? null,
    failedGate: latest?.failed_gate ? { label: GATE_LABELS[latest.failed_gate as GateId] ?? String(latest.failed_gate), detail: gates.find((g) => g.gate === latest.failed_gate)?.detail ?? "" } : null,
    warns: gates.filter((g) => g.status === "warn").map((g) => ({ label: g.label, detail: g.detail })),
    gating: approval?.status === "approved" ? "approved"
      : gating?.tags?.includes("BLOCKED") ? "blocked" : gating?.tags?.includes("APPROVAL") ? "approval_required" : gating ? "open" : null,
    costKnown: (latest?.offer as Row | null)?.cost_known !== false && latest?.landed_cost != null,
    checkedAt: (latest?.updated_at as string) ?? null,
    market: m,
    keepaAt: (snap?.fetched_at as string) ?? null,
    fees: fees?.compare ? { amazon: sum(fees.compare.amazon), rateCard: sum(fees.compare.rateCard) } : null,
    dormant: m ? isDormant({ ...(m as Record<string, unknown>), currentBuyBox: (m as { currentBuyBox?: number | null }).currentBuyBox ?? null, rankNow: (m as { rankNow?: number | null }).rankNow ?? null } as Parameters<typeof isDormant>[0]) : false,
  };

  const favourite = favs.find((f) => f.asin === asin) ?? favs.find((f) => f.asin == null) ?? null;
  return {
    asin,
    products,
    latest,
    judgement: judge(input),
    history: results.map((r) => {
      const run = r.run as { id: string; name: string | null; source: string; profile: { name: string } | null } | null;
      return {
        id: r.id as string, runId: (run?.id ?? r.run_id) as string, runName: run?.name ?? run?.source ?? "run", profile: run?.profile?.name ?? null,
        at: r.updated_at as string, verdict: (r.verdict as string) ?? null, score: num(r.score), failedGate: (r.failed_gate as string) ?? null,
        sellPrice: num(r.sell_price), profit: num(r.profit),
      };
    }),
    keepa: snap ? {
      fetchedAt: snap.fetched_at as string,
      rank: (snap.rank_series as SeriesPoint[]) ?? [], buyBox: (snap.buybox_series as SeriesPoint[]) ?? [],
      offers: (snap.offer_count_series as SeriesPoint[]) ?? [], amazon: (snap.amazon_series as SeriesPoint[]) ?? [],
    } : null,
    offers: offerList,
    maxLandedGbp: maxLanded == null ? null : Math.round(maxLanded * 100) / 100,
    approval,
    documents,
    favourite,
    waivers: overrides.filter((o) => o.asin == null || o.asin === asin)
      .map((o) => ({ gate: o.gate as string, label: GATE_LABELS[o.gate as GateId] ?? String(o.gate), reason: (o.reason as string) ?? null, created_at: o.created_at as string })),
  };
}

/** Find a product by ASIN, EAN or title words: up to 20 matches, newest first. */
export async function findProducts(q: string): Promise<{ asin: string; ean: string; title: string | null; brand: string | null; image_url: string | null }[]> {
  const s = q.trim();
  if (!s) return [];
  const d = db();
  const cols = "asin, ean, title, brand, image_url";
  let rows: Row[];
  if (/^[A-Z0-9]{10}$/i.test(s)) rows = must(await d.from("products").select(cols).eq("asin", s.toUpperCase()).limit(20), "products") as Row[];
  else if (/^\d{8,14}$/.test(s)) rows = must(await d.from("products").select(cols).eq("ean", s).limit(20), "products") as Row[];
  else rows = must(await d.from("products").select(cols).ilike("title", `%${s.replace(/[%_]/g, "")}%`).not("asin", "is", null).order("updated_at", { ascending: false }).limit(40), "products") as Row[];
  const seen = new Set<string>();
  return rows.filter((r) => r.asin && !seen.has(r.asin as string) && seen.add(r.asin as string)).slice(0, 20) as never;
}

export interface ProductListItem {
  asin: string; ean: string; title: string | null; brand: string | null; image_url: string | null;
  verdict: string | null; priced: boolean; sell_price: number | null; max_landed: number | null; fba_sellers: number | null;
  share_month: number | null; screened_at: string | null; bought: boolean;
}

/**
 * Every product the app has screened, one per ASIN, newest screening first (from the brand map:
 * each product's latest result on the default profile). Filters: text (ASIN, EAN, title or
 * brand), verdict, bought. 50 a page.
 */
export async function listProducts(q: { text?: string | null; verdict?: string | null; bought?: boolean; page?: number }): Promise<{ items: ProductListItem[]; more: boolean }> {
  const d = db();
  const PAGE = 50;
  const page = Math.max(0, q.page ?? 0);
  const boughtAsins = (must(await d.from("purchases").select("asin"), "purchases") as { asin: string }[]).map((p) => p.asin);
  let query = d.from("brand_products")
    .select("asin, ean, title, brand, image_url, verdict, priced, sell_price, max_landed, fba_sellers, share_month, result_updated_at")
    .not("asin", "is", null);
  const text = q.text?.trim().replace(/[%_,()]/g, " ").trim();
  if (text) {
    if (/^[A-Z0-9]{10}$/i.test(text) && /[A-Z]/i.test(text)) query = query.eq("asin", text.toUpperCase());
    else if (/^\d{8,14}$/.test(text)) query = query.eq("ean", text);
    else query = query.or(`title.ilike.%${text}%,brand.ilike.%${text}%`);
  }
  if (q.verdict && ["pass", "warn", "fail"].includes(q.verdict)) query = query.eq("verdict", q.verdict);
  if (q.bought) query = query.in("asin", boughtAsins.length ? boughtAsins : ["-"]);
  // A little extra per page: several EANs can share an ASIN, and only one is shown.
  const rows = must(await query.order("result_updated_at", { ascending: false, nullsFirst: false }).range(page * PAGE, page * PAGE + PAGE + 20), "products") as Record<string, unknown>[];
  const seen = new Set<string>();
  const bought = new Set(boughtAsins);
  const items: ProductListItem[] = [];
  for (const r of rows) {
    const asin = r.asin as string;
    if (seen.has(asin)) continue;
    seen.add(asin);
    items.push({
      asin, ean: r.ean as string, title: (r.title as string) ?? null, brand: (r.brand as string) ?? null, image_url: (r.image_url as string) ?? null,
      verdict: (r.verdict as string) ?? null, priced: !!r.priced, sell_price: num(r.sell_price), max_landed: num(r.max_landed), fba_sellers: num(r.fba_sellers),
      share_month: num(r.share_month), screened_at: (r.result_updated_at as string) ?? null, bought: bought.has(asin),
    });
    if (items.length === PAGE) break;
  }
  return { items, more: rows.length > PAGE };
}
