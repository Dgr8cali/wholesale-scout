/**
 * Importing from StockPilot: a raw export of its `stockpilot_workspaces` table (one row per user,
 * with jsonb arrays of products, sales, restocks, adjustments, transfers and returns), and CSVs of
 * items with StockPilot's column names. Turned into stock items, listings, sales and movements,
 * each keyed by StockPilot's own id so a re-import updates instead of duplicating. Pure.
 *
 * StockPilot's product quantities are its levels at export time, after everything it recorded. So
 * the opening balances are those levels less what its own movements did; replaying its movements
 * then lands exactly on its numbers. Its FBA quantities are dropped: SP-API has the real ones.
 */
import { BUCKETS, type Bucket, type MovementKind } from "./levels";

type Json = Record<string, unknown>;
const arr = (v: unknown): Json[] => (Array.isArray(v) ? v as Json[] : typeof v === "string" && v.trim().startsWith("[") ? JSON.parse(v) as Json[] : []);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown) => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const int = (v: unknown) => { const n = num(v); return n == null ? 0 : Math.round(n); };
const bucketOf = (v: unknown): Bucket | null => (BUCKETS.includes(v as Bucket) ? v as Bucket : null);
const day = (v: unknown) => (typeof v === "string" ? v.slice(0, 10) : null);

export interface PlanItem {
  ref: string; sku: string; name: string; asin: string | null; barcode: string | null; category: string | null; status: "active" | "discontinued";
  unit_cost: number | null; packaging_cost: number | null; reorder_level: number | null; lead_time_days: number | null;
  supplier_name: string | null; supplier_link: string | null; supplier_email: string | null; supplier_phone: string | null;
  image_url: string | null; notes: string | null;
  /** StockPilot's own levels at export (FBA kept for the record, not imported). */
  exported: Record<Bucket, number>;
}
export interface PlanListing { ref: string; item_ref: string; marketplace: string; marketplace_sku: string | null; title: string | null; url: string | null; price: number | null; fee_pct: number | null; default_bucket: Bucket | null; status: "active" | "inactive" }
export interface PlanSale { ref: string; item_ref: string; listing_ref: string | null; channel: string; order_id: string | null; date: string; quantity: number; price_each: number; cost_snapshot: Json; returned_quantity: number; note: string | null }
export interface PlanMovement { ref: string; item_ref: string; bucket: Bucket; quantity: number; kind: MovementKind; date: string; reason: string | null; unit_cost: number | null; sale_ref: string | null; note: string | null }

export interface ImportPlan {
  items: PlanItem[]; listings: PlanListing[]; sales: PlanSale[]; movements: PlanMovement[];
  /** What's left out, and why (FBA quantities, Amazon sales, photos…). */
  notes: string[];
  exportedAt: string | null;
}

/** Known ASINs for StockPilot SKUs (it kept none): the Ads products. */
export type AsinBySku = Record<string, string>;

/** A raw `stockpilot_workspaces` export: an array of rows (or one row). */
export function planStockPilotRaw(raw: unknown, asinBySku: AsinBySku = {}): ImportPlan {
  const rows = Array.isArray(raw) ? raw as Json[] : [raw as Json];
  const plan: ImportPlan = { items: [], listings: [], sales: [], movements: [], notes: [], exportedAt: null };
  let photos = 0, fbaUnits = 0, amazonSales = 0;
  for (const row of rows) {
    const exportedAt = str(row.updated_at);
    plan.exportedAt = exportedAt ?? plan.exportedAt;
    const products = arr(row.products);
    const used = new Set(plan.items.map((i) => i.sku));
    for (const p of products) {
      const ref = String(p.id);
      let sku = str(p.sku)?.toUpperCase() ?? `SP-${ref.replace(/[^a-z0-9]/gi, "").slice(0, 8).toUpperCase()}`;
      while (used.has(sku)) sku = `${sku}-2`;
      used.add(sku);
      if (str(p.photo)) photos++;
      const exported = { home: int(p.quantity_home), fba: int(p.quantity_fba), tiktok_fbt: int(p.quantity_tiktok_fbt) };
      fbaUnits += exported.fba;
      plan.items.push({
        ref, sku, name: str(p.name) ?? sku, asin: asinBySku[sku] ?? null, barcode: str(p.barcode), category: str(p.category),
        status: p.status === "Discontinued" ? "discontinued" : "active",
        unit_cost: num(p.unit_cost), packaging_cost: num(p.packaging_cost), reorder_level: num(p.low_stock_threshold), lead_time_days: num(p.supplier_lead_time_days),
        supplier_name: str(p.supplier_name), supplier_link: str(p.supplier_link), supplier_email: str(p.supplier_email), supplier_phone: str(p.supplier_phone),
        image_url: str(p.photo) && /^https?:\/\//.test(String(p.photo)) ? String(p.photo) : null, notes: str(p.notes), exported,
      });
      for (const l of arr(p.marketplace_listings)) {
        plan.listings.push({
          ref: String(l.id), item_ref: ref, marketplace: str(l.marketplace) ?? "Other", marketplace_sku: str(l.marketplace_sku), title: str(l.title), url: str(l.listing_url),
          price: num(l.selling_price), fee_pct: num(l.fee_percentage), default_bucket: bucketOf(l.default_stock_source), status: l.status === "Inactive" ? "inactive" : "active",
        });
      }
      if (arr(p.variants).length) plan.notes.push(`"${str(p.name)}" has ${arr(p.variants).length} variants: imported as items with it as their parent`);
      for (const v of arr(p.variants)) {
        let vsku = str(v.sku)?.toUpperCase() ?? `${sku}-${String(v.id).slice(0, 4).toUpperCase()}`;
        while (used.has(vsku)) vsku = `${vsku}-2`;
        used.add(vsku);
        plan.items.push({ ...plan.items.at(-1)!, ref: String(v.id), sku: vsku, name: `${str(p.name)} – ${str(v.name) ?? vsku}`, barcode: str(v.barcode), exported: { home: int(v.quantity_home), fba: int(v.quantity_fba), tiktok_fbt: int(v.quantity_tiktok_fbt) } });
      }
    }
    const itemRef = (x: Json) => String(x.variant_id ?? x.product_id);
    const known = new Set(plan.items.map((i) => i.ref));
    // StockPilot's own movements, replayed. Amazon sales out of FBA are Amazon's orders, not imported.
    for (const s of arr(row.sales)) {
      const allocs = Array.isArray(s.stock_allocations) && (s.stock_allocations as Json[]).length ? s.stock_allocations as Json[] : [{ source: s.fulfilment_source ?? "home", quantity: s.quantity }];
      if (allocs.every((a) => a.source === "fba")) { amazonSales++; continue; }
      if (!known.has(itemRef(s))) continue;
      const ref = String(s.id), date = day(s.date) ?? day(s.created_at)!;
      plan.sales.push({
        ref, item_ref: itemRef(s), listing_ref: str(s.listing_id), channel: str(s.sales_channel) ?? str(s.platform) ?? "Other", order_id: str(s.order_id), date,
        quantity: int(s.quantity), price_each: num(s.sale_price_each) ?? 0, returned_quantity: int(s.returned_quantity), note: str(s.notes),
        cost_snapshot: { unit_cost: num(s.unit_cost_at_sale), packaging_cost: num(s.packaging_cost_at_sale), fee_pct: num(s.referral_pct_at_sale), cost_each: num(s.landed_cost_each_at_sale), profit_each: num(s.profit_each_at_sale), from: "StockPilot" },
      });
      allocs.forEach((a, i) => { const b = bucketOf(a.source); if (b && b !== "fba" && int(a.quantity)) plan.movements.push({ ref: `${ref}:sale:${i}`, item_ref: itemRef(s), bucket: b, quantity: -int(a.quantity), kind: "sale", date, reason: null, unit_cost: null, sale_ref: ref, note: null }); });
    }
    for (const r of arr(row.restocks)) {
      const b = bucketOf(r.destination);
      if (!b || b === "fba" || !known.has(itemRef(r))) continue;
      plan.movements.push({ ref: String(r.id), item_ref: itemRef(r), bucket: b, quantity: int(r.quantity), kind: "receipt", date: day(r.date)!, reason: str(r.supplier_name), unit_cost: num(r.unit_cost), sale_ref: null, note: str(r.notes) });
    }
    for (const a of arr(row.adjustments)) {
      const b = bucketOf(a.source);
      if (!b || b === "fba" || !known.has(itemRef(a)) || !int(a.quantity_change)) continue;
      plan.movements.push({ ref: String(a.id), item_ref: itemRef(a), bucket: b, quantity: int(a.quantity_change), kind: "adjustment", date: day(a.date)!, reason: str(a.reason), unit_cost: null, sale_ref: null, note: str(a.notes) });
    }
    for (const t of arr(row.transfers)) {
      const from = bucketOf(t.from), to = bucketOf(t.to), q = int(t.quantity);
      if (!from || !to || !q || !known.has(itemRef(t))) continue;
      const date = day(t.date)!;
      if (from !== "fba") plan.movements.push({ ref: `${t.id}:out`, item_ref: itemRef(t), bucket: from, quantity: -q, kind: "transfer_out", date, reason: null, unit_cost: null, sale_ref: null, note: str(t.notes) });
      if (to !== "fba") plan.movements.push({ ref: `${t.id}:in`, item_ref: itemRef(t), bucket: to, quantity: q, kind: "transfer_in", date, reason: null, unit_cost: null, sale_ref: null, note: str(t.notes) });
    }
    for (const r of arr(row.returns)) {
      const b = bucketOf(r.destination);
      if (!b || b === "fba" || !known.has(itemRef(r))) continue;
      plan.movements.push({ ref: String(r.id), item_ref: itemRef(r), bucket: b, quantity: int(r.quantity), kind: "return", date: day(r.date)!, reason: str(r.reason), unit_cost: null, sale_ref: str(r.sale_id), note: null });
    }
    // Opening balances: the exported levels less what the replayed movements add up to, dated the
    // day of the earliest movement (or the export) so the ledger reads in order.
    for (const it of plan.items) {
      const mine = plan.movements.filter((m) => m.item_ref === it.ref);
      const first = mine.map((m) => m.date).sort()[0] ?? day(exportedAt) ?? new Date().toISOString().slice(0, 10);
      for (const b of ["home", "tiktok_fbt"] as const) {
        const opening = it.exported[b] - mine.filter((m) => m.bucket === b).reduce((a, m) => a + m.quantity, 0);
        if (opening > 0) plan.movements.unshift({ ref: `${it.ref}:opening:${b}`, item_ref: it.ref, bucket: b, quantity: opening, kind: "receipt", date: first, reason: "Opening balance (StockPilot)", unit_cost: it.unit_cost, sale_ref: null, note: `So the ledger ends at StockPilot's ${it.exported[b]} (exported ${day(exportedAt) ?? "—"})` });
        if (opening < 0) plan.notes.push(`${it.sku}: StockPilot's ${b} level (${it.exported[b]}) is below what its own movements leave (${-opening} short): imported as an adjustment`);
        if (opening < 0) plan.movements.push({ ref: `${it.ref}:reconcile:${b}`, item_ref: it.ref, bucket: b, quantity: opening, kind: "adjustment", date: day(exportedAt) ?? first, reason: "Stock count", unit_cost: null, sale_ref: null, note: "Reconciles to StockPilot's exported level" });
      }
    }
  }
  if (fbaUnits) plan.notes.push(`${fbaUnits} FBA units in StockPilot left out: Amazon FBA levels come from SP-API`);
  else plan.notes.push("FBA quantities left out (all 0 here): Amazon FBA levels come from SP-API");
  if (amazonSales) plan.notes.push(`${amazonSales} sales out of FBA left out: Amazon's own orders come from the orders sync`);
  if (photos) plan.notes.push(`${photos} photo${photos === 1 ? "" : "s"} stored in StockPilot as data left out: images come from Keepa or the listing`);
  for (const i of plan.items) if (!i.asin) plan.notes.push(`${i.sku} (${i.name.slice(0, 40)}) has no ASIN: no Amazon stock or sales will join it until you add one`);
  return plan;
}

/* ===================== CSV of items (StockPilot's column names) ===================== */

/** Column names an items CSV may use (lower case, spaces and underscores alike). */
export const ITEM_ALIASES: Record<string, string[]> = {
  sku: ["sku", "seller sku", "item sku"],
  name: ["name", "product name", "product_name", "title"],
  asin: ["asin"],
  barcode: ["barcode", "ean", "upc"],
  category: ["category"],
  unit_cost: ["unit cost", "unit_cost", "cost price", "cost_price", "cost"],
  packaging_cost: ["packaging cost", "packaging_cost"],
  reorder_level: ["reorder level", "reorder_level", "low stock threshold", "low_stock_threshold"],
  lead_time_days: ["lead time days", "lead_time_days", "supplier lead time days", "supplier_lead_time_days"],
  supplier_name: ["supplier", "supplier name", "supplier_name"],
  supplier_link: ["supplier website", "supplier_website", "supplier link", "supplier_link"],
  quantity_home: ["quantity home", "quantity_home", "stock quantity", "stock_quantity", "quantity", "stock"],
  quantity_tiktok_fbt: ["quantity tiktok fbt", "quantity_tiktok_fbt", "tiktok stock"],
  image_url: ["photo url", "photo_url", "image url", "image_url"],
};

/** Parse CSV text (quotes, commas, CRLF) into rows. */
export function parseCsvRows(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); out.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out.filter((r) => r.some((x) => x.trim()));
}

/**
 * Items from a CSV with StockPilot's (or plain) column names: one per row, keyed by SKU. A 0 in a
 * column is a 0 (StockPilot's import read it as missing). Quantities become opening balances.
 */
export function planItemsCsv(text: string, asinBySku: AsinBySku = {}): { plan: ImportPlan; unknownColumns: string[] } {
  const rows = parseCsvRows(text.replace(/^﻿/, ""));
  const head = (rows[0] ?? []).map((h) => h.trim().toLowerCase().replace(/[_\s]+/g, " "));
  const col: Record<string, number> = {};
  for (const [field, names] of Object.entries(ITEM_ALIASES)) {
    const i = head.findIndex((h) => names.map((n) => n.replace(/_/g, " ")).includes(h));
    if (i >= 0) col[field] = i;
  }
  const unknownColumns = (rows[0] ?? []).filter((_, i) => !Object.values(col).includes(i));
  const plan: ImportPlan = { items: [], listings: [], sales: [], movements: [], notes: [], exportedAt: null };
  const today = new Date().toISOString().slice(0, 10);
  const get = (r: string[], f: string) => (col[f] == null ? null : (r[col[f]] ?? "").trim() || null);
  const n = (r: string[], f: string) => { const v = get(r, f); return v == null ? null : Number.isFinite(Number(v.replace(/[£,]/g, ""))) ? Number(v.replace(/[£,]/g, "")) : null; };
  for (const r of rows.slice(1)) {
    const sku = get(r, "sku")?.toUpperCase();
    if (!sku) { plan.notes.push(`A row with no SKU left out (${get(r, "name") ?? "no name"})`); continue; }
    const ref = `csv:${sku}`;
    plan.items.push({
      ref, sku, name: get(r, "name") ?? sku, asin: get(r, "asin")?.toUpperCase() ?? asinBySku[sku] ?? null, barcode: get(r, "barcode"), category: get(r, "category"), status: "active",
      unit_cost: n(r, "unit_cost"), packaging_cost: n(r, "packaging_cost"), reorder_level: n(r, "reorder_level"), lead_time_days: n(r, "lead_time_days"),
      supplier_name: get(r, "supplier_name"), supplier_link: get(r, "supplier_link"), supplier_email: null, supplier_phone: null,
      image_url: get(r, "image_url"), notes: null, exported: { home: Math.round(n(r, "quantity_home") ?? 0), fba: 0, tiktok_fbt: Math.round(n(r, "quantity_tiktok_fbt") ?? 0) },
    });
    for (const b of ["home", "tiktok_fbt"] as const) {
      const q = plan.items.at(-1)!.exported[b];
      if (q) plan.movements.push({ ref: `${ref}:opening:${b}`, item_ref: ref, bucket: b, quantity: q, kind: "receipt", date: today, reason: "Opening balance (CSV)", unit_cost: n(r, "unit_cost"), sale_ref: null, note: null });
    }
  }
  return { plan, unknownColumns };
}
