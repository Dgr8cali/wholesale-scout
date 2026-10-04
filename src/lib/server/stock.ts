import "server-only";
import { orderCols, type OrderInput } from "../stock/orders";
import {
  BUCKETS, canTake, costSnapshot, dailyDemand, daysOfCover, levelStatus, levelsByItem, negativeAfter, reorderFor, totalOf, ZERO_LEVELS,
  type Bucket, type Levels, type Movement, type MovementKind,
} from "../stock/levels";
import { planItemsCsv, planStockPilotRaw, type AsinBySku, type ImportPlan } from "../stock/stockpilot";
import { allRows, chunks, db, must, selectAll } from "./db";
import { getKeepa } from "../keepa/client";
import { getSpApi } from "../spapi/client";

const DAY = 86_400_000;
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const n = (v: unknown) => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const now = () => new Date().toISOString();

/* ===================== settings ===================== */

export interface StockSettings { lowStockDefault: number; coverTargetDays: number; leadBufferDays: number }
export const DEFAULT_STOCK_SETTINGS: StockSettings = { lowStockDefault: 10, coverTargetDays: 30, leadBufferDays: 7 };

export async function stockSettings(): Promise<StockSettings> {
  const res = await db().from("stock_settings").select("key, value");
  if (res.error) return DEFAULT_STOCK_SETTINGS;
  const v = Object.fromEntries((res.data as { key: string; value: number }[]).map((r) => [r.key, Number(r.value)]));
  return { lowStockDefault: v.lowStockDefault ?? 10, coverTargetDays: v.coverTargetDays ?? 30, leadBufferDays: v.leadBufferDays ?? 7 };
}

export async function saveStockSettings(input: Partial<StockSettings>): Promise<StockSettings> {
  const rows: { key: string; value: number }[] = [];
  const lim: Record<keyof StockSettings, [number, number]> = { lowStockDefault: [0, 100000], coverTargetDays: [1, 365], leadBufferDays: [0, 120] };
  for (const k of Object.keys(lim) as (keyof StockSettings)[]) {
    if (input[k] === undefined) continue;
    const v = Number(input[k]);
    if (!(v >= lim[k][0] && v <= lim[k][1])) throw new Error(`${k} must be ${lim[k][0]}–${lim[k][1]}`);
    rows.push({ key: k, value: v });
  }
  if (rows.length) must(await db().from("stock_settings").upsert(rows.map((r) => ({ ...r, updated_at: now() })), { onConflict: "key" }), "save stock settings");
  return stockSettings();
}

/* ===================== items and levels ===================== */

export interface StockItem {
  id: string; sku: string; name: string; asin: string | null; barcode: string | null; category: string | null; status: "active" | "discontinued";
  parent_sku: string | null; unit_cost: number | null; packaging_cost: number | null; reorder_level: number | null; supplier_id: string | null;
  lead_time_days: number | null; image_url: string | null; notes: string | null; source_ref: string | null; created_at: string;
  /** Archived (soft-deleted): hidden from Levels, Reorder and Home until restored. */
  archived_at?: string | null;
  /** From the catalogue product (when the item has an ASIN): brand and package data. */
  brand?: string | null; weight_g?: number | null; dims_cm?: { l: number; w: number; h: number } | null; product_id?: string | null;
  image_checked_at?: string | null;
}
const ITEM_COLS = "id, sku, name, asin, barcode, category, status, parent_sku, unit_cost, packaging_cost, reorder_level, supplier_id, lead_time_days, image_url, notes, source_ref, created_at, archived_at, brand, weight_g, dims_cm, product_id, image_checked_at";
const toItem = (r: Record<string, unknown>): StockItem => ({ ...(r as unknown as StockItem), unit_cost: n(r.unit_cost), packaging_cost: n(r.packaging_cost), reorder_level: n(r.reorder_level), lead_time_days: n(r.lead_time_days) });

export interface ItemLevels {
  item: StockItem & { supplier_name: string | null };
  levels: Levels; total: number;
  /** total × unit cost. */
  value: number | null;
  /** Units a day over the last 30 days, per bucket and in all. */
  demand: Levels & { total: number };
  cover: Record<Bucket | "total", number | null>;
  status: "ok" | "low" | "out";
  reorder: ReturnType<typeof reorderFor> & { leadTimeDays: number; leadFrom: "item" | "supplier" | "default" };
  /** The level at the end of each of the last 30 days, oldest first (FBA at today's figure throughout). */
  spark: number[];
  /** FBA from SP-API: when it was synced, and whether this item matched it (by ASIN, else SKU). */
  fba: { synced: string | null; matched: boolean };
  listings: number;
}

async function loadAll() {
  const d = db();
  const since = new Date(Date.now() - 30 * DAY).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const [items, moves, sales, listings, inv, amazon, suppliers] = await Promise.all([
    d.from("stock_items").select(ITEM_COLS).order("name"),
    // The ledger and the sales, a page at a time: a level summed from the first 1,000 movements is wrong.
    selectAll("stock_movements", "item_id, bucket, quantity, kind, date, sale_id", ["id"]).then((data) => ({ data, error: null })),
    selectAll("stock_sales", "id, item_id, date, quantity", ["id"], (q) => q.gte("date", since)).then((data) => ({ data, error: null })),
    selectAll("stock_listings", "item_id", ["id"]).then((data) => ({ data, error: null })),
    selectAll("amazon_inventory", "sku, asin, fulfillable, updated_at", ["sku"]).then((data) => ({ data, error: null })).catch(() => ({ data: [], error: null })),
    selectAll("amazon_sales", "asin, day, units", ["asin", "day", "channel"], (q) => q.gte("day", since)).then((data) => ({ data, error: null })).catch(() => ({ data: [], error: null })),
    d.from("suppliers").select("id, name, delivery_days"),
  ]);
  return {
    items: (must(items, "stock items") as Record<string, unknown>[]).map(toItem),
    moves: must(moves, "movements") as (Movement & { sale_id: string | null })[],
    sales: must(sales, "sales") as { id: string; item_id: string; date: string; quantity: number }[],
    listings: must(listings, "listings") as { item_id: string }[],
    inv: (inv.data ?? []) as { sku: string; asin: string | null; fulfillable: number; updated_at: string }[],
    amazon: (amazon.data ?? []) as { asin: string; day: string; units: number }[],
    suppliers: (must(suppliers, "suppliers") as { id: string; name: string; delivery_days: number | null }[]),
  };
}

/** Every item with its levels, value, demand, days of cover, status and reorder suggestion. */
export async function stockLevels(opts: { archived?: boolean } = {}): Promise<{ items: ItemLevels[]; settings: StockSettings; fbaSynced: string | null; archivedCount: number }> {
  const [loaded, settings] = await Promise.all([loadAll(), stockSettings()]);
  // Archived items are left out (Levels → Show archived lists them on their own).
  const archivedCount = loaded.items.filter((i) => i.archived_at).length;
  const all = { ...loaded, items: loaded.items.filter((i) => (opts.archived ? !!i.archived_at : !i.archived_at)) };
  const fbaSynced = all.inv.map((r) => r.updated_at).sort().at(-1) ?? null;
  // FBA per item: SP-API's fulfillable, matched by ASIN (summed over its SKUs), else by SKU.
  const fba = new Map<string, number>();
  const matched = new Set<string>();
  for (const it of all.items) {
    const rows = all.inv.filter((r) => (it.asin && r.asin === it.asin) || r.sku.toUpperCase() === it.sku.toUpperCase());
    if (rows.length) { fba.set(it.id, rows.reduce((a, r) => a + Number(r.fulfillable), 0)); matched.add(it.id); }
  }
  const levels = levelsByItem(all.moves, fba);
  const saleBucket = new Map(all.moves.filter((m) => m.kind === "sale" && m.sale_id).map((m) => [m.sale_id!, m.bucket]));
  const days30 = Array.from({ length: 30 }, (_, i) => new Date(Date.now() - (29 - i) * DAY).toLocaleDateString("en-CA", { timeZone: "Europe/London" }));
  const items = all.items.map((it): ItemLevels => {
    const l = levels.get(it.id) ?? { ...ZERO_LEVELS };
    const total = totalOf(l);
    const amazonUnits = it.asin ? all.amazon.filter((a) => a.asin === it.asin).reduce((a, r) => a + Number(r.units), 0) : 0;
    const demand = dailyDemand({ amazonUnits, sales: all.sales.filter((s) => s.item_id === it.id).map((s) => ({ bucket: saleBucket.get(s.id) ?? "home", quantity: s.quantity })), days: 30 });
    const supplier = all.suppliers.find((s) => s.id === it.supplier_id) ?? null;
    const lead = it.lead_time_days ?? supplier?.delivery_days ?? null;
    const r = reorderFor({ total, perDay: demand.total, leadTimeDays: lead, bufferDays: settings.leadBufferDays, coverDays: settings.coverTargetDays });
    // The level at the end of each day: today's, less what moved after it.
    const mine = all.moves.filter((m) => m.item_id === it.id && m.bucket !== "fba");
    const manual = l.home + l.tiktok_fbt;
    const spark = days30.map((d) => manual - mine.filter((m) => m.date > d).reduce((a, m) => a + m.quantity, 0) + l.fba);
    return {
      item: { ...it, supplier_name: supplier?.name ?? null }, levels: l, total,
      value: it.unit_cost != null ? Math.round(total * it.unit_cost * 100) / 100 : null,
      demand, cover: { home: daysOfCover(l.home, demand.home), fba: daysOfCover(l.fba, demand.fba), tiktok_fbt: daysOfCover(l.tiktok_fbt, demand.tiktok_fbt), total: daysOfCover(total, demand.total) },
      status: levelStatus(total, it.reorder_level ?? settings.lowStockDefault),
      reorder: { ...r, leadTimeDays: lead ?? 14, leadFrom: it.lead_time_days != null ? "item" : supplier?.delivery_days != null ? "supplier" : "default" },
      spark, fba: { synced: fbaSynced, matched: matched.has(it.id) }, listings: all.listings.filter((x) => x.item_id === it.id).length,
    };
  });
  return { items, settings, fbaSynced, archivedCount };
}

/** Stock by ASIN across every bucket, for Ads' days of cover and its stock guard. */
export async function stockByAsinAllBuckets(asins: string[]): Promise<Map<string, { home: number; tiktok_fbt: number }>> {
  const out = new Map<string, { home: number; tiktok_fbt: number }>();
  if (!asins.length) return out;
  const items = await db().from("stock_items").select("id, asin").in("asin", asins);
  if (items.error || !items.data.length) return out;
  const ids = (items.data as { id: string; asin: string }[]);
  const moves = must(await db().from("stock_movements").select("item_id, bucket, quantity").in("item_id", ids.map((i) => i.id)), "movements") as { item_id: string; bucket: Bucket; quantity: number }[];
  for (const it of ids) {
    const mine = moves.filter((m) => m.item_id === it.id);
    const cur = out.get(it.asin) ?? { home: 0, tiktok_fbt: 0 };
    cur.home += mine.filter((m) => m.bucket === "home").reduce((a, m) => a + m.quantity, 0);
    cur.tiktok_fbt += mine.filter((m) => m.bucket === "tiktok_fbt").reduce((a, m) => a + m.quantity, 0);
    out.set(it.asin, cur);
  }
  return out;
}

export async function getItem(id: string) {
  const d = db();
  const [item, listings, moves, sales, purchases] = await Promise.all([
    d.from("stock_items").select(ITEM_COLS).eq("id", id).maybeSingle(),
    d.from("stock_listings").select("*").eq("item_id", id).order("marketplace"),
    d.from("stock_movements").select("*").eq("item_id", id).order("date", { ascending: false }).order("created_at", { ascending: false }).limit(200),
    d.from("stock_sales").select("*").eq("item_id", id).order("date", { ascending: false }).limit(100),
    // Its purchases (the Tracker's), newest first: the open ones are "on order".
    d.from("purchases").select("*").eq("stock_item_id", id).order("ordered_on", { ascending: false }).limit(50),
  ]);
  const it = must(item, "item") as Record<string, unknown> | null;
  if (!it) return null;
  return { item: toItem(it), listings: must(listings, "listings"), movements: must(moves, "movements"), sales: must(sales, "sales"), purchases: must(purchases, "purchases") };
}

/** Item fields as sent by a page, checked. */
function itemPatch(x: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of ["name", "barcode", "category", "notes", "image_url", "parent_sku"] as const) if (x[k] !== undefined) out[k] = String(x[k] ?? "").trim().slice(0, 500) || null;
  if (x.sku !== undefined) { const s = String(x.sku ?? "").trim().toUpperCase(); if (!s) throw new Error("A SKU is needed"); out.sku = s.slice(0, 80); }
  if (x.asin !== undefined) { const a = String(x.asin ?? "").trim().toUpperCase(); if (a && !/^[A-Z0-9]{10}$/.test(a)) throw new Error("An ASIN is 10 letters and digits"); out.asin = a || null; }
  if (x.status !== undefined) out.status = x.status === "discontinued" ? "discontinued" : "active";
  for (const k of ["unit_cost", "packaging_cost"] as const) if (x[k] !== undefined) out[k] = n(x[k]);
  for (const k of ["reorder_level", "lead_time_days"] as const) if (x[k] !== undefined) { const v = n(x[k]); out[k] = v == null ? null : Math.max(0, Math.round(v)); }
  if (x.supplier_id !== undefined) out.supplier_id = x.supplier_id || null;
  if (out.name === null) throw new Error("A name is needed");
  return out;
}

export async function saveItem(id: string | null, x: Record<string, unknown>): Promise<StockItem> {
  const patch = itemPatch(x);
  const d = db();
  const row = id
    ? must(await d.from("stock_items").update({ ...patch, updated_at: now() }).eq("id", id).select(ITEM_COLS).single(), "save item")
    : must(await d.from("stock_items").insert({ name: "New item", ...patch }).select(ITEM_COLS).single(), "add item");
  return toItem(row as Record<string, unknown>);
}

/** What the catalogue knows about an ASIN: the wholesale product (title, brand, image, package), else the Ads product. */
async function catalogueFor(asin: string) {
  const d = db();
  const [prod, ads] = await Promise.all([
    d.from("products").select("id, title, brand, image_url, weight_g, dims_cm, updated_at").eq("asin", asin).order("updated_at", { ascending: false }).limit(5),
    d.from("ads_products").select("title, image, weight_g, dims").eq("asin", asin).limit(1),
  ]);
  const ps = (prod.data ?? []) as { id: string; title: string | null; brand: string | null; image_url: string | null; weight_g: number | null; dims_cm: StockItem["dims_cm"] }[];
  const p = ps.find((x) => x.title) ?? ps[0] ?? null;
  const a = ((ads.data ?? []) as { title: string | null; image: string | null; weight_g: number | null; dims: StockItem["dims_cm"] }[])[0] ?? null;
  return {
    productId: p?.id ?? null, title: p?.title ?? a?.title ?? null, brand: p?.brand && p.brand !== "Unknown brand" ? p.brand : null,
    image: ps.find((x) => x.image_url)?.image_url || a?.image || null,
    weightG: p?.weight_g != null ? Number(p.weight_g) : a?.weight_g != null ? Number(a.weight_g) : null, dims: p?.dims_cm ?? a?.dims ?? null,
  };
}

/**
 * The stock item for an ASIN (a product-page purchase, an Ads product, a private-label listing):
 * found by ASIN (an active one first; an archived one is restored), else made. Either way its empty
 * fields are filled from the catalogue: title, image, brand, package size and weight, the catalogue
 * product, and the purchase's supplier and cost. So a purchase from a product page and one from
 * Stock make the same record.
 */
export async function ensureStockItemForAsin(asin: string, x: { name?: string | null; unitCost?: number | null; supplierId?: string | null; productId?: string | null }): Promise<StockItem> {
  const d = db();
  const all = (must(await d.from("stock_items").select(ITEM_COLS).eq("asin", asin), "item") as Record<string, unknown>[]).map(toItem);
  const cat = await catalogueFor(asin);
  const found = all.find((i) => !i.archived_at) ?? all[0] ?? null;
  if (found) {
    const fill: Record<string, unknown> = {};
    if (!found.image_url && cat.image) fill.image_url = cat.image;
    if (!found.brand && cat.brand) fill.brand = cat.brand;
    if (found.weight_g == null && cat.weightG != null) fill.weight_g = cat.weightG;
    if (!found.dims_cm && cat.dims) fill.dims_cm = cat.dims;
    if (!found.product_id && (x.productId ?? cat.productId)) fill.product_id = x.productId ?? cat.productId;
    if (!found.supplier_id && x.supplierId) fill.supplier_id = x.supplierId;
    if (found.unit_cost == null && x.unitCost != null) fill.unit_cost = x.unitCost;
    if (found.archived_at) fill.archived_at = null;
    if (!Object.keys(fill).length) return found;
    return toItem(must(await d.from("stock_items").update({ ...fill, updated_at: now() }).eq("id", found.id).select(ITEM_COLS).single(), "fill item") as Record<string, unknown>);
  }
  const inv = (await d.from("amazon_inventory").select("sku").eq("asin", asin).limit(1)).data as { sku: string }[] | null;
  let sku = inv?.[0]?.sku?.toUpperCase() ?? asin;
  if ((must(await d.from("stock_items").select("id").eq("sku", sku), "sku") as unknown[]).length) sku = asin;
  return toItem(must(await d.from("stock_items").insert({
    sku, name: (cat.title ?? x.name ?? asin).slice(0, 200), asin, unit_cost: x.unitCost ?? null, supplier_id: x.supplierId ?? null,
    image_url: cat.image, brand: cat.brand, weight_g: cat.weightG, dims_cm: cat.dims, product_id: x.productId ?? cat.productId,
  }).select(ITEM_COLS).single(), "add item") as Record<string, unknown>);
}

/**
 * An item's image when it has an ASIN and none: the catalogue product or Ads product (free), then
 * SP-API's catalogue (free), then Keepa (1 token) when `keepa` allows. Looked for once: an item
 * nothing has a picture of isn't looked up again.
 */
export async function ensureItemImage(itemId: string, opts: { keepa?: boolean } = {}): Promise<{ image: string | null; source: string | null; tokensUsed: number }> {
  const d = db();
  const it = toItem(must(await d.from("stock_items").select(ITEM_COLS).eq("id", itemId).single(), "item") as Record<string, unknown>);
  if (it.image_url) return { image: it.image_url, source: "item", tokensUsed: 0 };
  if (!it.asin || it.image_checked_at) return { image: null, source: null, tokensUsed: 0 };
  let image: string | null = (await catalogueFor(it.asin)).image, source: string | null = image ? "catalogue" : null, tokensUsed = 0;
  if (!image) {
    const spapi = getSpApi();
    if (spapi) { try { image = (await spapi.imagesByAsins([it.asin])).get(it.asin) || null; if (image) source = "SP-API"; } catch { /* free source failed: try Keepa */ } }
  }
  if (!image && opts.keepa !== false) {
    const keepa = getKeepa();
    if (keepa.available) {
      const r = await keepa.lookupByAsins([it.asin], undefined, { buyBox: false });
      tokensUsed = r.tokensUsed;
      image = r.byAsin.get(it.asin)?.imageUrl ?? null;
      if (image) source = "Keepa";
    }
  }
  must(await d.from("stock_items").update({ image_checked_at: now(), ...(image ? { image_url: image } : {}) }).eq("id", itemId), "item image");
  return { image, source, tokensUsed };
}

/* ===================== movements ===================== */

async function levelsOf(itemId: string): Promise<Levels> {
  const moves = must(await db().from("stock_movements").select("item_id, bucket, quantity, kind, date").eq("item_id", itemId), "movements") as Movement[];
  return levelsByItem(moves).get(itemId) ?? { ...ZERO_LEVELS };
}
const bucketOk = (b: unknown): b is Bucket => BUCKETS.includes(b as Bucket);
const manualBucket = (b: unknown, what: string): Bucket => {
  if (!bucketOk(b)) throw new Error(`${what}: a bucket (home, tiktok_fbt)`);
  if (b === "fba") throw new Error("Amazon FBA levels come from SP-API: they aren't entered here");
  return b;
};
type ReceiptOrder = { transfer_id?: string | null; supplier_id?: string | null; order_id?: string | null; order_url?: string | null; ordered_date?: string | null; tracking_carrier?: string | null; tracking_number?: string | null; currency?: string | null; fx_rate?: number | null; unit_cost_ccy?: number | null };
async function addMovement(row: { item_id: string; bucket: Bucket; quantity: number; kind: MovementKind; date: string; reason?: string | null; unit_cost?: number | null; sale_id?: string | null; purchase_id?: string | null; note?: string | null } & ReceiptOrder) {
  return must(await db().from("stock_movements").insert({ reason: null, unit_cost: null, sale_id: null, purchase_id: null, note: null, ...row }).select("*").single(), "movement");
}

/**
 * Goods in: a receipt into a bucket (from a purchase when given), with its supplier and order
 * (order number and link, dates, tracking, currency) when typed. A unit cost in another currency
 * is kept as typed and turned into £ at the rate.
 */
export async function receive(x: { itemId: string; bucket: Bucket; quantity: number; date?: string; unitCost?: number | null; note?: string | null; purchaseId?: string | null; supplierId?: string | null } & OrderInput) {
  const q = Math.round(Number(x.quantity));
  if (!(q > 0)) throw new Error("Quantity must be at least 1");
  const o = orderCols({ ...x, unitCostCcy: x.unitCostCcy ?? (x.currency && x.currency !== "GBP" ? x.unitCost : null) });
  return addMovement({
    item_id: x.itemId, bucket: manualBucket(x.bucket, "Receive into"), quantity: q, kind: "receipt", date: isDate(x.date) ? x.date : today(),
    unit_cost: o.unitCostGbp ?? n(x.unitCost), note: x.note ?? null, purchase_id: x.purchaseId ?? null, supplier_id: x.supplierId || null,
    order_id: o.cols.order_id, order_url: o.cols.order_url, ordered_date: o.orderedDate, tracking_carrier: o.cols.tracking_carrier, tracking_number: o.cols.tracking_number,
    currency: o.cols.currency === "GBP" ? null : o.cols.currency, fx_rate: o.cols.fx_rate, unit_cost_ccy: o.cols.unit_cost_ccy,
  });
}

/** A signed correction with a reason (a count, damage, loss, a sample). Can't take a bucket below 0. */
export async function adjust(x: { itemId: string; bucket: Bucket; quantity: number; reason: string; date?: string; note?: string | null }) {
  const q = Math.round(Number(x.quantity));
  if (!q) throw new Error("The change can't be 0");
  const b = manualBucket(x.bucket, "Adjust");
  if (q < 0) { const l = await levelsOf(x.itemId); if (l[b] + q < 0) throw new Error(`Only ${l[b]} there: the bucket can't go below 0`); }
  return addMovement({ item_id: x.itemId, bucket: b, quantity: q, kind: "adjustment", date: isDate(x.date) ? x.date : today(), reason: String(x.reason || "Other"), note: x.note ?? null });
}

/** Between your own buckets (stock you send to FBA shows in FBA once SP-API sees it). */
export async function transfer(x: { itemId: string; from: Bucket; to: Bucket; quantity: number; date?: string; note?: string | null }) {
  const q = Math.round(Number(x.quantity));
  const from = manualBucket(x.from, "From"), to = manualBucket(x.to, "To");
  if (from === to) throw new Error("From and to are the same bucket");
  const err = canTake(await levelsOf(x.itemId), from, q);
  if (err) throw new Error(err);
  const date = isDate(x.date) ? x.date : today();
  // The two halves share a transfer_id: deleting or editing one does the other.
  const transfer_id = crypto.randomUUID();
  await addMovement({ item_id: x.itemId, bucket: from, quantity: -q, kind: "transfer_out", date, note: x.note ?? null, transfer_id });
  return addMovement({ item_id: x.itemId, bucket: to, quantity: q, kind: "transfer_in", date, note: x.note ?? null, transfer_id });
}

/* ===================== sales ===================== */

/**
 * A sale outside Amazon: the bucket must hold it; the sale, its stock movement and its cost at
 * that moment (unit + packaging + the listing's fee % of the price) are written together.
 */
export async function recordSale(x: { itemId: string; listingId?: string | null; bucket: Bucket; channel: string; orderId?: string | null; date?: string; quantity: number; priceEach: number; note?: string | null }) {
  const d = db();
  const q = Math.round(Number(x.quantity));
  const bucket = manualBucket(x.bucket, "Sell from");
  const err = canTake(await levelsOf(x.itemId), bucket, q);
  if (err) throw new Error(err);
  const item = toItem(must(await d.from("stock_items").select(ITEM_COLS).eq("id", x.itemId).single(), "item") as Record<string, unknown>);
  const listing = x.listingId ? must(await d.from("stock_listings").select("fee_pct").eq("id", x.listingId).maybeSingle(), "listing") as { fee_pct: number | null } | null : null;
  const price = Number(x.priceEach);
  if (!(price >= 0)) throw new Error("A price each is needed");
  const snap = costSnapshot({ unitCost: item.unit_cost, packagingCost: item.packaging_cost, feePct: n(listing?.fee_pct), priceEach: price });
  const date = isDate(x.date) ? x.date : today();
  const sale = must(await d.from("stock_sales").insert({
    item_id: x.itemId, listing_id: x.listingId || null, channel: String(x.channel || "Other").slice(0, 60), order_id: x.orderId?.trim() || null,
    date, quantity: q, price_each: price, cost_snapshot: snap, note: x.note?.trim() || null,
  }).select("*").single(), "sale") as { id: string };
  await addMovement({ item_id: x.itemId, bucket, quantity: -q, kind: "sale", date, sale_id: sale.id });
  return { sale, snapshot: snap };
}

/** Units of a sale coming back into a bucket. */
export async function returnSale(x: { saleId: string; quantity: number; bucket: Bucket; reason?: string | null; date?: string }) {
  const d = db();
  const sale = must(await d.from("stock_sales").select("id, item_id, quantity, returned_quantity").eq("id", x.saleId).single(), "sale") as { id: string; item_id: string; quantity: number; returned_quantity: number };
  const q = Math.round(Number(x.quantity));
  const back = Number(sale.returned_quantity ?? 0);
  if (!(q > 0) || back + q > sale.quantity) throw new Error(`At most ${sale.quantity - back} can come back`);
  must(await d.from("stock_sales").update({ returned_quantity: back + q }).eq("id", sale.id), "return");
  return addMovement({ item_id: sale.item_id, bucket: manualBucket(x.bucket, "Return into"), quantity: q, kind: "return", date: isDate(x.date) ? x.date : today(), reason: x.reason ?? null, sale_id: sale.id });
}

/**
 * The ledger, filtered. `negative`: after this movement its bucket stood below 0 (counted over all
 * of the item's movements, in date order), shown until it's corrected.
 */
export async function listMovements(f: { itemId?: string | null; bucket?: string | null; kind?: string | null; from?: string | null; to?: string | null }) {
  const rows = await listMovementRows(f);
  const ids = [...new Set(rows.map((r) => r.item_id as string))];
  const all = ids.length ? await selectAll<Movement & { id: string; created_at: string }>("stock_movements", "id, item_id, bucket, quantity, kind, date, created_at", ["id"], (q) => q.in("item_id", ids)) : [];
  const neg = negativeAfter(all);
  return rows.map((r): Record<string, unknown> => ({ ...r, negative: neg.has(r.id as string) }));
}

/** Every movement matching the filters, newest first, a page at a time (the old limit of 2,000 was cut to 1,000 by PostgREST). */
async function listMovementRows(f: { itemId?: string | null; bucket?: string | null; kind?: string | null; from?: string | null; to?: string | null }) {
  const d = db();
  return allRows<Record<string, unknown>>((a, b) => {
    let q = d.from("stock_movements").select("id, item_id, bucket, quantity, kind, date, reason, unit_cost, sale_id, purchase_id, transfer_id, note, created_at, order_id, order_url, tracking_carrier, tracking_number, currency, unit_cost_ccy, item:stock_items(sku, name), supplier:suppliers(id, name)")
      .order("date", { ascending: false }).order("created_at", { ascending: false }).order("id");
    if (f.itemId) q = q.eq("item_id", f.itemId);
    if (f.bucket && bucketOk(f.bucket)) q = q.eq("bucket", f.bucket);
    if (f.kind) q = q.eq("kind", f.kind);
    if (isDate(f.from)) q = q.gte("date", f.from);
    if (isDate(f.to)) q = q.lte("date", f.to);
    return q.range(a, b);
  }, "movements");
}

/** Every sale (the Sales page totals them), newest first, a page at a time. */
export async function listSales(channel?: string | null) {
  return selectAll<Record<string, unknown>>("stock_sales", "*, item:stock_items(sku, name), listing:stock_listings(marketplace)", ["id"], (q) => {
    const x = q.order("date", { ascending: false });
    return channel ? x.eq("channel", channel) : x;
  });
}

/* ===================== import ===================== */

async function asinBySku(): Promise<AsinBySku> {
  // The known listings: Ads products and the FBA inventory, by their SKU there; StockPilot's own SKUs
  // are matched below by name to the Ads products (B0H9ZKYYHZ, B0H9ZH3RV5).
  const inv = (await db().from("amazon_inventory").select("sku, asin")).data as { sku: string; asin: string | null }[] | null;
  return Object.fromEntries((inv ?? []).filter((r) => r.asin).map((r) => [r.sku.toUpperCase(), r.asin!]));
}

export interface ImportPreview {
  plan: ImportPlan;
  /** Per item: new or an update (re-import), its supplier (matched or new), and its levels after. */
  rows: { ref: string; sku: string; name: string; asin: string | null;
    /** An Ads product whose title shares 2+ words with the item's name: confirm it to link them. */
    suggestion: { asin: string; title: string; shared: string[] } | null;
    action: "new" | "update"; supplier: string | null; supplierAction: "match" | "new" | null; home: number; tiktok_fbt: number; fbaDropped: number; movements: number }[];
  movementsNew: number; movementsExisting: number;
  unknownColumns?: string[];
}

const WORD_STOP = new Set(["the", "and", "for", "with", "pack", "set", "box", "day", "days", "new"]);
const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !WORD_STOP.has(w)).map((w) => w.replace(/(?<=..)s$/, "")));

/** The Ads products' titles (the Ads product, else the catalogue's), to suggest an ASIN for an item. */
async function adsProductTitles(): Promise<{ asin: string; title: string }[]> {
  const d = db();
  const ads = (await d.from("ads_products").select("asin, title")).data as { asin: string; title: string | null }[] | null;
  const asins = (ads ?? []).map((a) => a.asin);
  const cat = asins.length ? ((await d.from("products").select("asin, title").in("asin", asins)).data as { asin: string; title: string | null }[] | null) : [];
  return (ads ?? []).map((a) => ({ asin: a.asin, title: a.title ?? cat?.find((c) => c.asin === a.asin)?.title ?? "" })).filter((a) => a.title);
}

/** The Ads product sharing the most words (2+) with an item's name. */
function suggestAsin(name: string, ads: { asin: string; title: string }[]): { asin: string; title: string; shared: string[] } | null {
  const mine = words(name);
  let best: { asin: string; title: string; shared: string[] } | null = null;
  for (const a of ads) {
    const shared = [...words(a.title)].filter((w) => mine.has(w));
    if (shared.length >= 2 && (!best || shared.length > best.shared.length)) best = { asin: a.asin, title: a.title, shared };
  }
  return best;
}

/** What an import would do, without writing anything. `asins` maps SKUs to ASINs you confirm (e.g. the Ads products). */
export async function previewImport(src: { kind: "stockpilot"; raw: unknown } | { kind: "csv"; text: string }, asins: AsinBySku = {}): Promise<ImportPreview> {
  const known = { ...(await asinBySku()), ...asins };
  const { plan, unknownColumns } = src.kind === "stockpilot" ? { plan: planStockPilotRaw(src.raw, known), unknownColumns: undefined } : planItemsCsv(src.text, known);
  const d = db();
  const refs = plan.items.map((i) => i.ref), skus = plan.items.map((i) => i.sku);
  const [byRef, bySku, sups, moves] = await Promise.all([
    refs.length ? d.from("stock_items").select("source_ref").in("source_ref", refs) : { data: [] },
    skus.length ? d.from("stock_items").select("sku").in("sku", skus) : { data: [] },
    d.from("suppliers").select("name"),
    plan.movements.length ? d.from("stock_movements").select("source_ref").in("source_ref", plan.movements.map((m) => m.ref)) : { data: [] },
  ]);
  const haveRef = new Set(((byRef.data ?? []) as { source_ref: string }[]).map((r) => r.source_ref));
  const haveSku = new Set(((bySku.data ?? []) as { sku: string }[]).map((r) => r.sku));
  const supNames = ((sups.data ?? []) as { name: string }[]).map((s) => s.name.toLowerCase());
  const haveMove = new Set(((moves.data ?? []) as { source_ref: string }[]).map((r) => r.source_ref));
  const ads = await adsProductTitles();
  return {
    plan, unknownColumns,
    rows: plan.items.map((i) => {
      const mine = plan.movements.filter((m) => m.item_ref === i.ref);
      const sum = (b: Bucket) => mine.filter((m) => m.bucket === b).reduce((a, m) => a + m.quantity, 0);
      return {
        ref: i.ref, sku: i.sku, name: i.name, asin: i.asin, suggestion: i.asin ? null : suggestAsin(i.name, ads), action: haveRef.has(i.ref) || haveSku.has(i.sku) ? "update" : "new",
        supplier: i.supplier_name, supplierAction: i.supplier_name ? (supNames.includes(i.supplier_name.toLowerCase()) ? "match" : "new") : null,
        home: sum("home"), tiktok_fbt: sum("tiktok_fbt"), fbaDropped: i.exported.fba, movements: mine.length,
      };
    }),
    movementsNew: plan.movements.filter((m) => !haveMove.has(m.ref)).length,
    movementsExisting: plan.movements.filter((m) => haveMove.has(m.ref)).length,
  };
}

/**
 * Write an import: items (by their source id, else SKU), suppliers (matched by name, else added),
 * listings, sales and movements, each keyed by its source id: importing the same file again
 * updates what's there and adds nothing twice.
 */
export async function applyImport(src: { kind: "stockpilot"; raw: unknown } | { kind: "csv"; text: string }, asins: AsinBySku = {}) {
  const pre = await previewImport(src, asins);
  const { plan } = pre;
  const d = db();
  const suppliers = must(await d.from("suppliers").select("id, name"), "suppliers") as { id: string; name: string }[];
  const supplierId = async (name: string | null, link: string | null, contact: string | null) => {
    if (!name) return null;
    const hit = suppliers.find((s) => s.name.toLowerCase() === name.toLowerCase());
    if (hit) return hit.id;
    const row = must(await d.from("suppliers").insert({ name, website: link, contact, notes: "Added by the StockPilot import" }).select("id, name").single(), "add supplier") as { id: string; name: string };
    suppliers.push(row);
    return row.id;
  };
  const itemId = new Map<string, string>();
  for (const i of plan.items) {
    const sup = await supplierId(i.supplier_name, i.supplier_link, [i.supplier_email, i.supplier_phone].filter(Boolean).join(" · ") || null);
    const row = {
      sku: i.sku, name: i.name.slice(0, 200), asin: i.asin, barcode: i.barcode, category: i.category, status: i.status, unit_cost: i.unit_cost, packaging_cost: i.packaging_cost,
      reorder_level: i.reorder_level, lead_time_days: i.lead_time_days, supplier_id: sup, image_url: i.image_url, notes: i.notes, source_ref: i.ref, updated_at: now(),
    };
    const existing = (must(await d.from("stock_items").select("id").or(`source_ref.eq.${i.ref},sku.eq.${i.sku}`).limit(1), "item") as { id: string }[])[0];
    const saved = existing
      ? must(await d.from("stock_items").update(row).eq("id", existing.id).select("id").single(), "update item") as { id: string }
      : must(await d.from("stock_items").insert(row).select("id").single(), "add item") as { id: string };
    itemId.set(i.ref, saved.id);
  }
  const listingId = new Map<string, string>();
  for (const l of plan.listings) {
    const row = { item_id: itemId.get(l.item_ref)!, marketplace: l.marketplace, marketplace_sku: l.marketplace_sku, title: l.title, url: l.url, price: l.price, fee_pct: l.fee_pct, default_bucket: l.default_bucket, status: l.status, source_ref: l.ref };
    const saved = must(await d.from("stock_listings").upsert(row, { onConflict: "source_ref" }).select("id").single(), "listing") as { id: string };
    listingId.set(l.ref, saved.id);
  }
  const saleId = new Map<string, string>();
  for (const s of plan.sales) {
    const row = { item_id: itemId.get(s.item_ref)!, listing_id: s.listing_ref ? listingId.get(s.listing_ref) ?? null : null, channel: s.channel, order_id: s.order_id, date: s.date, quantity: s.quantity, price_each: s.price_each, cost_snapshot: s.cost_snapshot, returned_quantity: s.returned_quantity, note: s.note, source_ref: s.ref };
    const saved = must(await d.from("stock_sales").upsert(row, { onConflict: "source_ref" }).select("id").single(), "sale") as { id: string };
    saleId.set(s.ref, saved.id);
  }
  // A transfer's halves ("<id>:out", "<id>:in") share a transfer_id: kept from an earlier import, else new.
  const known = new Map((must(await d.from("stock_movements").select("source_ref, transfer_id").not("transfer_id", "is", null), "transfer ids") as { source_ref: string | null; transfer_id: string }[])
    .filter((r) => r.source_ref).map((r) => [r.source_ref!.replace(/:(in|out)$/, ""), r.transfer_id]));
  const transferOf = (ref: string, kind: string) => {
    if (kind !== "transfer_in" && kind !== "transfer_out") return null;
    const base = ref.replace(/:(in|out)$/, "");
    if (!known.has(base)) known.set(base, crypto.randomUUID());
    return known.get(base)!;
  };
  const moves = plan.movements.map((m) => ({ item_id: itemId.get(m.item_ref)!, bucket: m.bucket, quantity: m.quantity, kind: m.kind, date: m.date, reason: m.reason, unit_cost: m.unit_cost, sale_id: m.sale_ref ? saleId.get(m.sale_ref) ?? null : null, note: m.note, source_ref: m.ref, transfer_id: transferOf(m.ref, m.kind) }));
  for (const c of chunks(moves, 200)) if (c.length) must(await d.from("stock_movements").upsert(c, { onConflict: "source_ref" }), "movements");
  return { items: plan.items.length, listings: plan.listings.length, sales: plan.sales.length, movements: moves.length, newMovements: pre.movementsNew, notes: plan.notes };
}

/* ===================== purchases (the Tracker) ===================== */

/**
 * A purchase of a stock item, in Ordered status: recorded in the Tracker like any other, without a
 * screening to freeze when the item isn't a catalogue product (an own-brand SKU, a padlock). With
 * the supplier's order number and link, the expected date, tracking and currency. A cost in another
 * currency (`unitCostCcy` at `fxRate`) is the landed cost per unit in £ unless `landedGbp` is given.
 */
export async function recordStockPurchase(x: { itemId: string; units: number; landedGbp?: number | string | null; supplierId?: string | null; supplierName?: string | null; orderedOn?: string | null; note?: string | null } & OrderInput) {
  const d = db();
  const item = toItem(must(await d.from("stock_items").select(ITEM_COLS).eq("id", x.itemId).single(), "item") as Record<string, unknown>);
  const units = Math.round(Number(x.units));
  if (!(units > 0)) throw new Error("Units must be at least 1");
  const o = orderCols(x);
  const landed = x.landedGbp === "" || x.landedGbp == null ? o.unitCostGbp : Number(x.landedGbp);
  if (landed == null || !(landed >= 0)) throw new Error("Landed cost per unit must be a number of pounds");
  const orderedOn = isDate(o.orderedDate) ? o.orderedDate : isDate(x.orderedOn) ? x.orderedOn : today();
  const sup = x.supplierId ? (must(await d.from("suppliers").select("name").eq("id", x.supplierId).maybeSingle(), "supplier") as { name: string } | null) : null;
  return must(await d.from("purchases").insert({
    asin: item.asin, stock_item_id: item.id, supplier_id: x.supplierId || null, supplier_name: sup?.name ?? x.supplierName?.trim() ?? null,
    units, unit_cost_gbp: o.unitCostGbp ?? item.unit_cost, landed_gbp: Math.round(landed * 100) / 100, ordered_on: orderedOn, status: "ordered", status_dates: { ordered: orderedOn },
    note: x.note?.trim() || `Stock: ${item.sku}`, prediction: {}, ...o.cols,
  }).select("*").single(), "save purchase");
}

/**
 * A purchase received into a bucket: one receipt movement for its units at its landed cost (once:
 * receiving it again changes nothing). Its stock item is found (or made) by ASIN when it has none.
 */
export async function receivePurchase(purchaseId: string, bucket: Bucket, date?: string) {
  const d = db();
  const p = must(await d.from("purchases").select("id, asin, units, landed_gbp, stock_item_id, supplier_id, ordered_on, order_id, order_url, tracking_carrier, tracking_number, currency, fx_rate, unit_cost_ccy, product:products(title)").eq("id", purchaseId).single(), "purchase") as { id: string; asin: string | null; units: number; landed_gbp: number; stock_item_id: string | null; product: { title: string | null } | null } & Required<Omit<ReceiptOrder, "ordered_date">> & { ordered_on: string };
  const b = manualBucket(bucket, "Receive into");
  const already = must(await d.from("stock_movements").select("id").eq("purchase_id", p.id).eq("kind", "receipt"), "receipt") as unknown[];
  let item = p.stock_item_id;
  if (!item) {
    if (!p.asin) throw new Error("This purchase has no stock item or ASIN");
    item = (await ensureStockItemForAsin(p.asin, { name: p.product?.title ?? p.asin, unitCost: Number(p.landed_gbp) })).id;
    must(await d.from("purchases").update({ stock_item_id: item }).eq("id", p.id), "link purchase");
  }
  must(await d.from("purchases").update({ received_bucket: b }).eq("id", p.id), "received bucket");
  if (already.length) return { created: false, itemId: item };
  // The receipt carries the purchase's order: number and link, supplier, dates, tracking, currency.
  await addMovement({
    item_id: item, bucket: b, quantity: p.units, kind: "receipt", date: isDate(date) ? date : today(), unit_cost: Number(p.landed_gbp), purchase_id: p.id, note: "From the Tracker",
    supplier_id: p.supplier_id, order_id: p.order_id, order_url: p.order_url, ordered_date: p.ordered_on, tracking_carrier: p.tracking_carrier, tracking_number: p.tracking_number,
    currency: p.currency && p.currency !== "GBP" ? p.currency : null, fx_rate: p.fx_rate == null ? null : Number(p.fx_rate), unit_cost_ccy: p.unit_cost_ccy == null ? null : Number(p.unit_cost_ccy),
  });
  return { created: true, itemId: item };
}

/* ===================== Home ===================== */

export async function stockSummary() {
  const { items } = await stockLevels();
  const active = items.filter((i) => i.item.status === "active");
  const units = { home: 0, fba: 0, tiktok_fbt: 0 };
  for (const i of active) for (const b of BUCKETS) units[b] += i.levels[b];
  return {
    items: active.length, value: Math.round(active.reduce((a, i) => a + (i.value ?? 0), 0) * 100) / 100, units,
    low: active.filter((i) => i.status !== "ok").length, reorderDue: active.filter((i) => i.reorder.status === "due" || i.reorder.status === "soon").length,
  };
}
