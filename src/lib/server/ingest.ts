import "server-only";
import type { ColumnMapping, Fx, NormalizedRow } from "../ingest/mapping";
import { CURRENCIES, MAX_ROWS } from "../ingest/mapping";
import { chunks, db, loadProfile, must } from "./db";
import { checkNewOffers } from "./watchlist";

export interface IngestFile {
  fileName: string;
  supplier: { name: string; vatBasis: "ex_vat" | "inc_vat"; vatRate: number; currency: string };
  headers: string[];
  fingerprint: string;
  mapping: ColumnMapping;
  fx: Fx;
  rows: NormalizedRow[];
  /** Use a supplier of this name as it is (an ASIN check naming one): don't overwrite its VAT and currency. */
  keepSupplier?: boolean;
  /** Where the supplier's prices come from, for the ledger: a file (default), Qogita, or typed in. */
  sourceType?: "upload" | "qogita" | "manual";
}

export interface IngestPayload {
  profileId?: string | null;
  /** Run name; defaults to the file names. */
  name?: string | null;
  files: IngestFile[];
  /** Extra run stats (an ASIN check keeps its input here for re-running). */
  stats?: Record<string, unknown>;
}

function validate(p: IngestPayload) {
  if (!Array.isArray(p?.files) || !p.files.length) throw new Error("No files");
  const rows = p.files.reduce((a, f) => a + (Array.isArray(f.rows) ? f.rows.length : 0), 0);
  if (rows > MAX_ROWS) throw new Error(`${rows.toLocaleString("en-GB")} rows is over the ${MAX_ROWS.toLocaleString("en-GB")}-row limit per upload; split the file`);
  for (const f of p.files) {
    if (!f.supplier?.name?.trim()) throw new Error(`${f.fileName}: supplier name is required`);
    if (!["ex_vat", "inc_vat"].includes(f.supplier.vatBasis)) throw new Error(`${f.fileName}: VAT basis must be ex_vat or inc_vat`);
    if (!(CURRENCIES as readonly string[]).includes(f.supplier.currency)) throw new Error(`${f.fileName}: unsupported currency ${f.supplier.currency}`);
    if (!(f.fx?.rate > 0)) throw new Error(`${f.fileName}: FX rate must be positive`);
    if (f.supplier.currency === "GBP" && f.fx.rate !== 1) throw new Error(`${f.fileName}: GBP must use an FX rate of 1`);
    if (!Array.isArray(f.rows)) throw new Error(`${f.fileName}: rows missing`);
    for (const r of f.rows) {
      if (!r.productId && (typeof r.ean !== "string" || !/^\d{8,14}$/.test(r.ean))) throw new Error(`${f.fileName} row ${r.sourceRow}: bad EAN`);
      if (!(r.unitCostGbp > 0) && !(r.costKnown === false && r.unitCostGbp === 0)) throw new Error(`${f.fileName} row ${r.sourceRow}: bad price`);
    }
  }
}

/**
 * Store suppliers, their learned layouts, products and offers, then open a run with
 * one pending result per product (the cheapest offer across all files wins).
 */
export async function ingest(payload: IngestPayload): Promise<{ runId: string; rowCount: number; offerCount: number }> {
  validate(payload);
  const d = db();
  const profile = await loadProfile(payload.profileId);

  // Suppliers (upsert by name) and their mappings.
  const supplierIds = new Map<string, { id: string; vatRate: number }>();
  for (const f of payload.files) {
    const s = f.supplier;
    // A pasted list has no sheet layout to learn.
    const learn = !!f.fingerprint;
    const existing = f.keepSupplier
      ? must(await d.from("suppliers").select("id, vat_rate").eq("name", s.name.trim()).maybeSingle(), "supplier") as { id: string; vat_rate: number } | null
      : null;
    const row = existing ?? must(
      await d.from("suppliers")
        .upsert({ name: s.name.trim(), source_type: f.sourceType ?? "upload", vat_basis: s.vatBasis, vat_rate: s.vatRate, currency: s.currency, updated_at: new Date().toISOString() }, { onConflict: "name" })
        .select("id, vat_rate")
        .single(),
      "supplier",
    ) as { id: string; vat_rate: number };
    supplierIds.set(f.fileName, { id: row.id, vatRate: Number(row.vat_rate) });
    if (learn) must(
      await d.from("supplier_mappings").upsert(
        { supplier_id: row.id, header_fingerprint: f.fingerprint, headers: f.headers, mapping: f.mapping, updated_at: new Date().toISOString() },
        { onConflict: "supplier_id,header_fingerprint" },
      ),
      "mapping",
    );
  }

  // Products: one per EAN until matched; an EAN already matched to several ASINs gets an offer on each.
  const eans = [...new Set(payload.files.flatMap((f) => f.rows.filter((r) => !r.productId).map((r) => r.ean)))];
  const productsByEan = new Map<string, { id: string }[]>();
  for (const c of chunks(eans)) {
    const rows = must(await d.from("products").select("id, ean").in("ean", c), "products") as { id: string; ean: string }[];
    for (const p of rows) productsByEan.set(p.ean, [...(productsByEan.get(p.ean) ?? []), p]);
  }
  const missing = eans.filter((e) => !productsByEan.has(e));
  const firstRowByEan = new Map<string, NormalizedRow>();
  for (const f of payload.files) for (const r of f.rows) if (!r.productId && !firstRowByEan.has(r.ean)) firstRowByEan.set(r.ean, r);
  for (const c of chunks(missing, 500)) {
    const inserted = must(
      await d.from("products").insert(c.map((ean) => ({ ean, title: firstRowByEan.get(ean)?.title, brand: firstRowByEan.get(ean)?.brand }))).select("id, ean"),
      "insert products",
    ) as { id: string; ean: string }[];
    for (const p of inserted) productsByEan.set(p.ean, [p]);
  }

  // Offers.
  const offerRows = payload.files.flatMap((f) => {
    const sup = supplierIds.get(f.fileName)!;
    return f.rows.flatMap((r) =>
      (r.productId ? [{ id: r.productId }] : productsByEan.get(r.ean) ?? []).map((p) => ({
        product_id: p.id,
        supplier_id: sup.id,
        unit_cost: r.unitCost,
        currency: f.supplier.currency,
        fx_rate: f.fx.rate,
        fx_date: f.fx.date,
        unit_cost_gbp: r.unitCostGbp,
        pack_units: r.packUnits,
        moq: r.moq,
        stock: r.stock,
        title: r.title,
        brand: r.brand,
        category: r.category,
        source_ref: `${f.fileName} row ${r.sourceRow}`,
        ...(r.externalRef ? { external_ref: r.externalRef } : {}),
        // A check sets it on every row: in a bulk insert a missing column is sent as null, not its default.
        ...(r.costKnown !== undefined ? { cost_known: r.costKnown } : {}),
        _vatRate: sup.vatRate,
      })),
    );
  });
  const offers: { id: string; product_id: string; unit_cost_gbp: number; _vatRate: number }[] = [];
  for (const c of chunks(offerRows, 500)) {
    let res = await d.from("offers").insert(c.map(({ _vatRate, ...o }) => (void _vatRate, o))).select("id, product_id, unit_cost_gbp");
    // Before the Qogita migration there's no external_ref column: keep the offers without it.
    if (res.error && /external_ref/.test(res.error.message)) {
      res = await d.from("offers").insert(c.map(({ _vatRate, ...o }) => { void _vatRate; const { external_ref, ...rest } = o as typeof o & { external_ref?: string }; void external_ref; return rest; })).select("id, product_id, unit_cost_gbp");
    }
    const inserted = must(res, "insert offers") as { id: string; product_id: string; unit_cost_gbp: number }[];
    inserted.forEach((o, i) => offers.push({ ...o, _vatRate: c[i]._vatRate }));
  }

  // Cheapest landed offer per product (VAT on goods counts when not registered).
  const vatCounts = !profile.config.fees.vatRegistered;
  const best = new Map<string, { offerId: string; cost: number; count: number }>();
  for (const o of offers) {
    const cost = Number(o.unit_cost_gbp) * (vatCounts ? 1 + o._vatRate / 100 : 1);
    const cur = best.get(o.product_id);
    if (!cur) best.set(o.product_id, { offerId: o.id, cost, count: 1 });
    else best.set(o.product_id, cost < cur.cost ? { offerId: o.id, cost, count: cur.count + 1 } : { ...cur, count: cur.count + 1 });
  }

  const source = payload.files.map((f) => f.fileName).join(", ");
  const runFields = {
    profile_id: profile.id, profile_snapshot: profile.config, source, status: "pending", row_count: best.size,
    // Which version of the profile this run was screened with, for the run header.
    stats: { ...(payload.stats ?? {}), profile: { id: profile.id, name: profile.name, savedAt: profile.updated_at ?? null, appliedAt: new Date().toISOString() } },
  };
  let inserted = await d.from("runs").insert({ ...runFields, name: payload.name?.trim() || source }).select("id").single();
  // Before the run-names migration there's no name column: the file names still show.
  if (inserted.error && /name/.test(inserted.error.message) && /column|schema cache/i.test(inserted.error.message)) {
    inserted = await d.from("runs").insert(runFields).select("id").single();
  }
  const run = must(inserted, "run") as { id: string };

  for (const c of chunks([...best.entries()], 500)) {
    must(
      await d.from("results").insert(c.map(([productId, b]) => ({ run_id: run.id, product_id: productId, offer_id: b.offerId, offer_count: b.count }))),
      "results",
    );
  }
  // A watched product with no supplier yet, now offered at or under its max landed cost: alert now.
  try {
    // Uploads and Qogita pulls only: a Check ASINs cost or a seller scan isn't a supplier's offer.
    await checkNewOffers(run.id, payload.files.filter((f) => !f.keepSupplier).flatMap((f) => f.rows.map((r) => ({
      ean: r.ean, unitCostGbp: r.unitCostGbp, vatRatePct: supplierIds.get(f.fileName)?.vatRate ?? f.supplier.vatRate,
      supplier: f.supplier.name.trim(), costKnown: r.costKnown !== false,
    }))), profile.config.fees);
  } catch (e) {
    console.error(`[watchlist] checking new offers: ${(e as Error).message}`);
  }
  return { runId: run.id, rowCount: best.size, offerCount: offers.length };
}
