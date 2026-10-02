import "server-only";
import {
  BUCKETS, canTake, costSnapshot, dailyDemand, daysOfCover, levelStatus, levelsByItem, reorderFor, totalOf, ZERO_LEVELS,
  type Bucket, type Levels, type Movement, type MovementKind,
} from "../stock/levels";
import { planItemsCsv, planStockPilotRaw, type AsinBySku, type ImportPlan } from "../stock/stockpilot";
import { chunks, db, must } from "./db";

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
}
const ITEM_COLS = "id, sku, name, asin, barcode, category, status, parent_sku, unit_cost, packaging_cost, reorder_level, supplier_id, lead_time_days, image_url, notes, source_ref, created_at";
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
    d.from("stock_movements").select("item_id, bucket, quantity, kind, date, sale_id"),
    d.from("stock_sales").select("id, item_id, date, quantity").gte("date", since),
    d.from("stock_listings").select("item_id"),
    d.from("amazon_inventory").select("sku, asin, fulfillable, updated_at"),
    d.from("amazon_sales").select("asin, day, units").gte("day", since),
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
export async function stockLevels(): Promise<{ items: ItemLevels[]; settings: StockSettings; fbaSynced: string | null }> {
  const [all, settings] = await Promise.all([loadAll(), stockSettings()]);
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
  return { items, settings, fbaSynced };
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
  const [item, listings, moves, sales] = await Promise.all([
    d.from("stock_items").select(ITEM_COLS).eq("id", id).maybeSingle(),
    d.from("stock_listings").select("*").eq("item_id", id).order("marketplace"),
    d.from("stock_movements").select("*").eq("item_id", id).order("date", { ascending: false }).order("created_at", { ascending: false }).limit(200),
    d.from("stock_sales").select("*").eq("item_id", id).order("date", { ascending: false }).limit(100),
  ]);
  const it = must(item, "item") as Record<string, unknown> | null;
  if (!it) return null;
  return { item: toItem(it), listings: must(listings, "listings"), movements: must(moves, "movements"), sales: must(sales, "sales") };
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

/**
 * The stock item for an ASIN (an Ads product, a private-label listing): found by ASIN, else made
 * with the given name and costs. They share it, so stock and sales meet in one place.
 */
export async function ensureStockItemForAsin(asin: string, x: { name: string; unitCost?: number | null }): Promise<StockItem> {
  const d = db();
  const found = (must(await d.from("stock_items").select(ITEM_COLS).eq("asin", asin).limit(1), "item") as Record<string, unknown>[])[0];
  if (found) return toItem(found);
  const inv = (await d.from("amazon_inventory").select("sku").eq("asin", asin).limit(1)).data as { sku: string }[] | null;
  let sku = inv?.[0]?.sku?.toUpperCase() ?? asin;
  if ((must(await d.from("stock_items").select("id").eq("sku", sku), "sku") as unknown[]).length) sku = asin;
  return toItem(must(await d.from("stock_items").insert({ sku, name: x.name.slice(0, 200), asin, unit_cost: x.unitCost ?? null }).select(ITEM_COLS).single(), "add item") as Record<string, unknown>);
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
async function addMovement(row: { item_id: string; bucket: Bucket; quantity: number; kind: MovementKind; date: string; reason?: string | null; unit_cost?: number | null; sale_id?: string | null; purchase_id?: string | null; note?: string | null }) {
  return must(await db().from("stock_movements").insert({ reason: null, unit_cost: null, sale_id: null, purchase_id: null, note: null, ...row }).select("*").single(), "movement");
}

/** Goods in: a receipt into a bucket (from a purchase when given). */
export async function receive(x: { itemId: string; bucket: Bucket; quantity: number; date?: string; unitCost?: number | null; note?: string | null; purchaseId?: string | null }) {
  const q = Math.round(Number(x.quantity));
  if (!(q > 0)) throw new Error("Quantity must be at least 1");
  return addMovement({ item_id: x.itemId, bucket: manualBucket(x.bucket, "Receive into"), quantity: q, kind: "receipt", date: isDate(x.date) ? x.date : today(), unit_cost: n(x.unitCost), note: x.note ?? null, purchase_id: x.purchaseId ?? null });
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
  await addMovement({ item_id: x.itemId, bucket: from, quantity: -q, kind: "transfer_out", date, note: x.note ?? null });
  return addMovement({ item_id: x.itemId, bucket: to, quantity: q, kind: "transfer_in", date, note: x.note ?? null });
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
  if (!(q > 0) || sale.returned_quantity + q > sale.quantity) throw new Error(`At most ${sale.quantity - sale.returned_quantity} can come back`);
  must(await d.from("stock_sales").update({ returned_quantity: sale.returned_quantity + q }).eq("id", sale.id), "return");
  return addMovement({ item_id: sale.item_id, bucket: manualBucket(x.bucket, "Return into"), quantity: q, kind: "return", date: isDate(x.date) ? x.date : today(), reason: x.reason ?? null, sale_id: sale.id });
}

export async function listMovements(f: { itemId?: string | null; bucket?: string | null; kind?: string | null; from?: string | null; to?: string | null }) {
  let q = db().from("stock_movements").select("id, item_id, bucket, quantity, kind, date, reason, unit_cost, sale_id, purchase_id, note, created_at, item:stock_items(sku, name)").order("date", { ascending: false }).order("created_at", { ascending: false }).limit(2000);
  if (f.itemId) q = q.eq("item_id", f.itemId);
  if (f.bucket && bucketOk(f.bucket)) q = q.eq("bucket", f.bucket);
  if (f.kind) q = q.eq("kind", f.kind);
  if (isDate(f.from)) q = q.gte("date", f.from);
  if (isDate(f.to)) q = q.lte("date", f.to);
  return must(await q, "movements") as Record<string, unknown>[];
}

export async function listSales(channel?: string | null) {
  let q = db().from("stock_sales").select("*, item:stock_items(sku, name), listing:stock_listings(marketplace)").order("date", { ascending: false }).limit(1000);
  if (channel) q = q.eq("channel", channel);
  return must(await q, "sales") as Record<string, unknown>[];
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
  const moves = plan.movements.map((m) => ({ item_id: itemId.get(m.item_ref)!, bucket: m.bucket, quantity: m.quantity, kind: m.kind, date: m.date, reason: m.reason, unit_cost: m.unit_cost, sale_id: m.sale_ref ? saleId.get(m.sale_ref) ?? null : null, note: m.note, source_ref: m.ref }));
  for (const c of chunks(moves, 200)) if (c.length) must(await d.from("stock_movements").upsert(c, { onConflict: "source_ref" }), "movements");
  return { items: plan.items.length, listings: plan.listings.length, sales: plan.sales.length, movements: moves.length, newMovements: pre.movementsNew, notes: plan.notes };
}

/* ===================== purchases (the Tracker) ===================== */

/**
 * A purchase of a stock item: recorded in the Tracker like any other, without a screening to
 * freeze when the item isn't a catalogue product (an own-brand SKU, a padlock).
 */
export async function recordStockPurchase(x: { itemId: string; units: number; landedGbp: number; supplierId?: string | null; supplierName?: string | null; orderedOn?: string | null; note?: string | null }) {
  const d = db();
  const item = toItem(must(await d.from("stock_items").select(ITEM_COLS).eq("id", x.itemId).single(), "item") as Record<string, unknown>);
  const units = Math.round(Number(x.units));
  if (!(units > 0)) throw new Error("Units must be at least 1");
  const landed = Number(x.landedGbp);
  if (!(landed >= 0)) throw new Error("Landed cost per unit must be a number of pounds");
  const orderedOn = isDate(x.orderedOn) ? x.orderedOn : today();
  const sup = x.supplierId ? (must(await d.from("suppliers").select("name").eq("id", x.supplierId).maybeSingle(), "supplier") as { name: string } | null) : null;
  return must(await d.from("purchases").insert({
    asin: item.asin, stock_item_id: item.id, supplier_id: x.supplierId || null, supplier_name: sup?.name ?? x.supplierName?.trim() ?? null,
    units, unit_cost_gbp: item.unit_cost, landed_gbp: Math.round(landed * 100) / 100, ordered_on: orderedOn, status: "ordered", status_dates: { ordered: orderedOn },
    note: x.note?.trim() || `Stock: ${item.sku}`, prediction: {},
  }).select("*").single(), "save purchase");
}

/**
 * A purchase received into a bucket: one receipt movement for its units at its landed cost (once:
 * receiving it again changes nothing). Its stock item is found (or made) by ASIN when it has none.
 */
export async function receivePurchase(purchaseId: string, bucket: Bucket, date?: string) {
  const d = db();
  const p = must(await d.from("purchases").select("id, asin, units, landed_gbp, stock_item_id, product:products(title)").eq("id", purchaseId).single(), "purchase") as { id: string; asin: string | null; units: number; landed_gbp: number; stock_item_id: string | null; product: { title: string | null } | null };
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
  await addMovement({ item_id: item, bucket: b, quantity: p.units, kind: "receipt", date: isDate(date) ? date : today(), unit_cost: Number(p.landed_gbp), purchase_id: p.id, note: "From the Tracker" });
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
