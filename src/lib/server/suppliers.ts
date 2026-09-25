import "server-only";
import { landedCost } from "../fees/engine";
import { chunks, db, loadProfile, must } from "./db";

/** One supplier's ledger record. */
export interface SupplierRecord {
  id: string;
  name: string;
  source_type: "upload" | "qogita" | "manual";
  website: string | null;
  contact: string | null;
  vat_basis: "ex_vat" | "inc_vat";
  vat_rate: number;
  currency: string;
  /** Minimum order value, in the supplier's currency. */
  mov: number | null;
  delivery_days: number | null;
  importer_of_record: boolean | null;
  labelling: "UK" | "EU" | "mixed" | null;
  invoice_notes: string | null;
  invoice_name_matches: boolean | null;
  invoice_accepted_for_approval: boolean | null;
  payment_terms: string | null;
  rating: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupplierStats {
  runs: number;
  products: number;
  /** On the current default profile (the brand map), among priced products. */
  pass: number;
  warn: number;
  brands: { brand: string; count: number }[];
  lastSeen: string | null;
}

export interface BestProduct {
  productId: string;
  ean: string;
  asin: string | null;
  title: string | null;
  brand: string;
  verdict: string;
  unitCostGbp: number;
  landed: number;
  maxLanded: number | null;
  /** How far under the max landed cost it comes in, £. */
  headroom: number | null;
  buyBox: number | null;
}

const EDITABLE = [
  "website", "contact", "vat_basis", "vat_rate", "currency", "mov", "delivery_days", "importer_of_record", "labelling",
  "invoice_notes", "invoice_name_matches", "invoice_accepted_for_approval", "payment_terms", "rating", "notes",
] as const;

type OfferRow = { id: string; product_id: string; supplier_id: string; unit_cost_gbp: number; cost_known?: boolean; seen_at: string };
type BrandRow = { product_id: string; brand: string; ean: string; asin: string | null; title: string | null; verdict: string | null; priced: boolean; max_landed: number | null; buy_box: number | null };

async function pageAll<T>(query: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>, what: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const page = must(await query(from, from + 999), what) as T[];
    out.push(...page);
    if (page.length < 1000) break;
  }
  return out;
}

/** Everything the per-supplier figures are built from, loaded once. */
async function ledgerData(supplierIds?: string[]) {
  const d = db();
  const [offers, results, brandRows] = await Promise.all([
    pageAll<OfferRow>((a, b) => {
      let q = d.from("offers").select("id, product_id, supplier_id, unit_cost_gbp, cost_known, seen_at").order("id");
      if (supplierIds) q = q.in("supplier_id", supplierIds);
      return q.range(a, b);
    }, "offers"),
    pageAll<{ offer_id: string; run_id: string }>((a, b) => d.from("results").select("offer_id, run_id").order("id").range(a, b), "results"),
    pageAll<BrandRow>((a, b) => d.from("brand_products").select("product_id, brand, ean, asin, title, verdict, priced, max_landed, buy_box").order("product_id").range(a, b), "brand map"),
  ]);
  const offerIds = new Set(offers.map((o) => o.id));
  return { offers, results: results.filter((r) => offerIds.has(r.offer_id)), brandByProduct: new Map(brandRows.map((r) => [r.product_id, r])) };
}

function statsFor(supplierId: string, data: Awaited<ReturnType<typeof ledgerData>>): SupplierStats {
  const offers = data.offers.filter((o) => o.supplier_id === supplierId);
  const offerIds = new Set(offers.map((o) => o.id));
  const products = new Set(offers.map((o) => o.product_id));
  const runs = new Set(data.results.filter((r) => offerIds.has(r.offer_id)).map((r) => r.run_id));
  let pass = 0, warn = 0;
  const brands = new Map<string, number>();
  for (const pid of products) {
    const b = data.brandByProduct.get(pid);
    if (!b) continue;
    if (b.priced && b.verdict === "pass") pass++;
    if (b.priced && b.verdict === "warn") warn++;
    if (b.brand && b.brand !== "Unknown brand") brands.set(b.brand, (brands.get(b.brand) ?? 0) + 1);
  }
  return {
    runs: runs.size,
    products: products.size,
    pass, warn,
    brands: [...brands].map(([brand, count]) => ({ brand, count })).sort((a, b) => b.count - a.count),
    lastSeen: offers.reduce<string | null>((m, o) => (!m || o.seen_at > m ? o.seen_at : m), null),
  };
}

/** Per-supplier figures from the supplier_stats SQL function; null where it isn't available (tests). */
async function statsFromSql(): Promise<Map<string, SupplierStats> | null> {
  const d = db();
  if (typeof d.rpc !== "function") return null;
  const res = await d.rpc("supplier_stats", {});
  if (res.error || !Array.isArray(res.data)) return null;
  return new Map((res.data as { supplier_id: string; runs: number; products: number; pass: number; warn: number; brands: { brand: string; count: number }[]; last_seen: string | null }[])
    .map((r) => [r.supplier_id, { runs: r.runs, products: r.products, pass: r.pass, warn: r.warn, brands: r.brands ?? [], lastSeen: r.last_seen }]));
}

/** Every supplier with its figures, most used first. */
export async function supplierLedger(): Promise<(SupplierRecord & { stats: SupplierStats })[]> {
  await prefillQogita();
  const [suppliers, sql] = await Promise.all([
    db().from("suppliers").select("*").order("name").then((r) => must(r, "suppliers") as SupplierRecord[]),
    statsFromSql(),
  ]);
  const data = sql ? null : await ledgerData();
  const none: SupplierStats = { runs: 0, products: 0, pass: 0, warn: 0, brands: [], lastSeen: null };
  return suppliers
    .map((s) => ({ ...s, stats: sql ? sql.get(s.id) ?? none : statsFor(s.id, data!) }))
    .sort((a, b) => b.stats.products - a.stats.products || a.name.localeCompare(b.name));
}

/** One supplier: its record, figures, best products (most headroom under the max landed cost) and runs. */
export async function supplierDetail(id: string) {
  const d = db();
  const s = must(await d.from("suppliers").select("*").eq("id", id).maybeSingle(), "supplier") as SupplierRecord | null;
  if (!s) return null;
  const data = await ledgerData([id]);
  const stats = statsFor(id, data);
  const fees = (await loadProfile(null)).config.fees;
  // Each product's cheapest offer from this supplier, against its max landed cost.
  const cheapest = new Map<string, OfferRow>();
  for (const o of data.offers) {
    if (o.cost_known === false || !(Number(o.unit_cost_gbp) > 0)) continue;
    const cur = cheapest.get(o.product_id);
    if (!cur || Number(o.unit_cost_gbp) < Number(cur.unit_cost_gbp)) cheapest.set(o.product_id, o);
  }
  const best: BestProduct[] = [];
  for (const [pid, o] of cheapest) {
    const b = data.brandByProduct.get(pid);
    if (!b || !b.priced || (b.verdict !== "pass" && b.verdict !== "warn")) continue;
    const landed = landedCost(Number(o.unit_cost_gbp), { goodsVatRatePct: Number(s.vat_rate) }, fees).total;
    const maxLanded = b.max_landed == null ? null : Number(b.max_landed);
    best.push({
      productId: pid, ean: b.ean, asin: b.asin, title: b.title, brand: b.brand, verdict: b.verdict,
      unitCostGbp: Number(o.unit_cost_gbp), landed: Math.round(landed * 100) / 100, maxLanded,
      headroom: maxLanded == null ? null : Math.round((maxLanded - landed) * 100) / 100, buyBox: b.buy_box == null ? null : Number(b.buy_box),
    });
  }
  best.sort((a, b) => (a.verdict === b.verdict ? 0 : a.verdict === "pass" ? -1 : 1) || (b.headroom ?? -Infinity) - (a.headroom ?? -Infinity));
  const runIds = [...new Set(data.results.map((r) => r.run_id))];
  const runs: { id: string; name: string | null; source: string; started_at: string; row_count: number }[] = [];
  for (const c of chunks(runIds, 200)) runs.push(...(must(await d.from("runs").select("id, name, source, started_at, row_count").in("id", c), "runs") as typeof runs));
  runs.sort((a, b) => b.started_at.localeCompare(a.started_at));
  return { supplier: s, stats, best: best.slice(0, 10), runs: runs.slice(0, 20) };
}

/** Save ledger fields. Unknown fields are ignored; values are checked. */
export async function updateSupplier(id: string, patch: Record<string, unknown>): Promise<SupplierRecord> {
  const row: Record<string, unknown> = {};
  for (const k of EDITABLE) if (k in patch) row[k] = patch[k] === "" ? null : patch[k];
  const num = (k: string, min: number, max: number, int = false) => {
    if (row[k] == null) return;
    const n = Number(row[k]);
    if (!Number.isFinite(n) || n < min || n > max || (int && !Number.isInteger(n))) throw new Error(`${k.replace(/_/g, " ")} must be ${int ? "a whole number " : ""}between ${min} and ${max}`);
    row[k] = n;
  };
  num("mov", 0, 1_000_000);
  num("delivery_days", 0, 365, true);
  num("vat_rate", 0, 100);
  num("rating", 1, 5, true);
  if (row.vat_basis != null && !["ex_vat", "inc_vat"].includes(String(row.vat_basis))) throw new Error("VAT basis must be ex_vat or inc_vat");
  if (row.labelling != null && !["UK", "EU", "mixed"].includes(String(row.labelling))) throw new Error("labelling must be UK, EU or mixed");
  if (row.currency != null && !/^[A-Z]{3}$/.test(String(row.currency))) throw new Error("currency must be a 3-letter code");
  if (row.website != null && !/^https?:\/\//i.test(String(row.website))) row.website = `https://${String(row.website).trim()}`;
  for (const k of ["importer_of_record", "invoice_name_matches", "invoice_accepted_for_approval"]) {
    if (row[k] != null && typeof row[k] !== "boolean") throw new Error(`${k.replace(/_/g, " ")} must be yes, no or unknown`);
  }
  row.updated_at = new Date().toISOString();
  return must(await db().from("suppliers").update(row).eq("id", id).select("*").single(), "save supplier") as SupplierRecord;
}

/**
 * What stored Qogita data already says about Qogita as a supplier: its typical delivery time
 * (the median of the offers' estimates). Written once, while the field is empty.
 */
async function prefillQogita(): Promise<void> {
  const d = db();
  const q = must(await d.from("suppliers").select("id, delivery_days").eq("source_type", "qogita").maybeSingle(), "qogita supplier") as { id: string; delivery_days: number | null } | null;
  if (!q || q.delivery_days != null) return;
  const rows = must(await d.from("results").select("q:inputs->qogita->offers").not("inputs->qogita->offers", "is", null).limit(500), "qogita offers") as { q: { deliveryWeeks?: number | null }[] | null }[];
  const weeks = rows.flatMap((r) => (r.q ?? []).map((o) => o.deliveryWeeks)).filter((w): w is number => typeof w === "number" && w > 0).sort((a, b) => a - b);
  if (!weeks.length) return;
  const median = weeks[Math.floor(weeks.length / 2)];
  must(await d.from("suppliers").update({ delivery_days: Math.round(median * 7), updated_at: new Date().toISOString() }).eq("id", q.id), "prefill Qogita");
}
