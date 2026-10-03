import "server-only";
import { predictionFor, PURCHASE_STATUSES, type Prediction, type PurchaseStatus } from "../tracker";
import { hasOrderInput, orderCols, type OrderInput } from "../stock/orders";
import { db, must } from "./db";
import { ensureItemImage, ensureStockItemForAsin } from "./stock";
import { productView } from "./productPage";

export interface Purchase {
  id: string; asin: string | null; ean: string | null; product_id: string | null; supplier_id: string | null; supplier_name: string | null;
  units: number; unit_cost_gbp: number | null; landed_gbp: number; ordered_on: string; status: PurchaseStatus;
  status_dates: Partial<Record<PurchaseStatus, string>>; note: string | null; prediction: Prediction; created_at: string;
  /** For lists: the product's title and image. */
  product?: { title: string | null; brand: string | null; image_url: string | null } | null;
  /** A purchase of a stock item (Stock → Reorder), and the bucket it was received into. */
  stock_item_id?: string | null; received_bucket?: string | null;
  stock?: { sku: string; name: string; image_url: string | null; brand?: string | null } | null;
  /** The supplier's side: order number and page, expected date, tracking, currency. */
  order_id?: string | null; order_url?: string | null; expected_date?: string | null;
  tracking_carrier?: string | null; tracking_number?: string | null; currency?: string; fx_rate?: number | null; unit_cost_ccy?: number | null;
}

export interface NewPurchase extends OrderInput {
  asin: string; units: number; landedGbp: number; unitCostGbp?: number | null;
  supplierId?: string | null; supplierName?: string | null; orderedOn?: string | null; note?: string | null;
}

const COLS = "*, product:products(title, brand, image_url), stock:stock_items(sku, name, image_url, brand)";
/** Today in the UK, as YYYY-MM-DD (the server runs in UTC). */
const ukToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const numbers = (p: Record<string, unknown>) => ({ ...p, landed_gbp: Number(p.landed_gbp), unit_cost_gbp: p.unit_cost_gbp == null ? null : Number(p.unit_cost_gbp) }) as unknown as Purchase;

/**
 * Record a purchase: the product's latest screening and judgement are frozen as the prediction. Its
 * stock item is found or made by ASIN first (title, image, brand, package data and the supplier from
 * the catalogue), so it's the same record a purchase from Stock makes. `tokensUsed`: Keepa, when the
 * item's image had to come from there (1 token).
 */
export async function recordPurchase(input: NewPurchase): Promise<Purchase & { tokensUsed?: number }> {
  const asin = String(input.asin ?? "").toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(asin)) throw new Error("An ASIN is needed");
  const units = Math.round(Number(input.units));
  if (!(units > 0)) throw new Error("Units must be at least 1");
  const landed = Number(input.landedGbp);
  if (!(landed >= 0) || !Number.isFinite(landed)) throw new Error("Landed cost per unit must be a number of pounds");
  const view = await productView(asin);
  if (!view) throw new Error("The app doesn't know this ASIN yet: check it first");
  const r = view.latest as Record<string, unknown> | null;
  const run = r?.run as { name: string | null; source: string; profile: { name: string } | null } | null;
  const prediction = predictionFor({
    result: r as never,
    runName: run ? run.name ?? run.source : null,
    profile: run?.profile?.name ?? null,
    decision: view.judgement.decision,
    confidence: view.judgement.confidence,
    keepaAt: view.keepa?.fetchedAt ?? null,
  }, landed, units);
  const product = (r?.product as { id: string; ean: string } | null) ?? (view.products[0] as { id: string; ean: string });
  const orderedOn = isDate(input.orderedOn) ? input.orderedOn : ukToday();
  const order = orderCols(input).cols;
  const item = await ensureStockItemForAsin(asin, { name: (product as { title?: string | null } | null)?.title ?? null, unitCost: Math.round(landed * 100) / 100, supplierId: input.supplierId || null, productId: product?.id ?? null });
  const img = await ensureItemImage(item.id).catch(() => ({ tokensUsed: 0 }));
  const row = must(await db().from("purchases").insert({
    ...order,
    asin, ean: product?.ean ?? null, product_id: product?.id ?? null,
    supplier_id: input.supplierId || null, supplier_name: input.supplierName?.trim().slice(0, 120) || null,
    units, unit_cost_gbp: input.unitCostGbp != null && Number.isFinite(Number(input.unitCostGbp)) ? Number(input.unitCostGbp) : null,
    landed_gbp: Math.round(landed * 100) / 100, ordered_on: orderedOn, status: "ordered", status_dates: { ordered: orderedOn },
    note: input.note?.trim().slice(0, 1000) || null, prediction, stock_item_id: item.id,
  }).select(COLS).single(), "save purchase") as Record<string, unknown>;
  return { ...numbers(row), tokensUsed: img.tokensUsed };
}

/** Purchases, newest first; for one ASIN with `asin`. */
export async function listPurchases(asin?: string | null): Promise<Purchase[]> {
  let q = db().from("purchases").select(COLS).order("ordered_on", { ascending: false }).order("created_at", { ascending: false }).limit(1000);
  if (asin) q = q.eq("asin", asin.toUpperCase());
  return (must(await q, "purchases") as Record<string, unknown>[]).map(numbers);
}

/** Move a purchase along (its date is recorded), or correct units, cost, date or note. */
export async function updatePurchase(id: string, p: { status?: PurchaseStatus; units?: number; landedGbp?: number; orderedOn?: string; note?: string | null; on?: string } & OrderInput): Promise<Purchase> {
  const d = db();
  const cur = must(await d.from("purchases").select("status_dates").eq("id", id).maybeSingle(), "purchase") as { status_dates: Record<string, string> } | null;
  if (!cur) throw new Error("No such purchase");
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (p.status) {
    if (!PURCHASE_STATUSES.some((s) => s.id === p.status)) throw new Error("Unknown status");
    patch.status = p.status;
    patch.status_dates = { ...cur.status_dates, [p.status]: isDate(p.on) ? p.on : ukToday() };
  }
  if (p.units != null) { const u = Math.round(Number(p.units)); if (!(u > 0)) throw new Error("Units must be at least 1"); patch.units = u; }
  if (p.landedGbp != null) { const l = Number(p.landedGbp); if (!(l >= 0)) throw new Error("Landed cost must be a number"); patch.landed_gbp = Math.round(l * 100) / 100; }
  if (p.orderedOn != null) { if (!isDate(p.orderedOn)) throw new Error("Date must be YYYY-MM-DD"); patch.ordered_on = p.orderedOn; }
  if (p.note !== undefined) patch.note = p.note?.trim().slice(0, 1000) || null;
  // The order's fields, all together when any is sent (the form sends the whole set).
  if (hasOrderInput(p as Record<string, unknown>)) Object.assign(patch, orderCols(p).cols);
  return numbers(must(await d.from("purchases").update(patch).eq("id", id).select(COLS).single(), "update purchase") as Record<string, unknown>);
}

export async function deletePurchase(id: string): Promise<void> {
  must(await db().from("purchases").delete().eq("id", id), "delete purchase");
}

/**
 * Link every purchase to a stock item: purchases with an ASIN and no item get theirs found or made
 * (copying from the catalogue), then items with an ASIN and no image get one (free sources first,
 * Keepa 1 token each as the last resort). Safe to re-run.
 */
export async function linkPurchasesToItems(opts: { keepa?: boolean } = {}) {
  const d = db();
  const rows = must(await d.from("purchases").select("id, asin, supplier_id, landed_gbp, product_id, product:products(title)").is("stock_item_id", null).not("asin", "is", null), "unlinked purchases") as unknown as { id: string; asin: string; supplier_id: string | null; landed_gbp: number; product_id: string | null; product: { title: string | null } | null }[];
  const linked: { purchase: string; asin: string; item: string; sku: string; created: boolean }[] = [];
  for (const p of rows) {
    const before = (must(await d.from("stock_items").select("id").eq("asin", p.asin), "items") as unknown[]).length;
    const item = await ensureStockItemForAsin(p.asin, { name: p.product?.title ?? null, unitCost: Number(p.landed_gbp), supplierId: p.supplier_id, productId: p.product_id });
    must(await d.from("purchases").update({ stock_item_id: item.id }).eq("id", p.id), "link purchase");
    linked.push({ purchase: p.id, asin: p.asin, item: item.id, sku: item.sku, created: before === 0 });
  }
  const noImage = must(await d.from("stock_items").select("id, sku").not("asin", "is", null).is("image_url", null).is("image_checked_at", null), "items without images") as { id: string; sku: string }[];
  const images: { sku: string; source: string | null }[] = [];
  let tokensUsed = 0;
  for (const it of noImage) {
    const r = await ensureItemImage(it.id, opts);
    tokensUsed += r.tokensUsed;
    images.push({ sku: it.sku, source: r.source });
  }
  return { linked, images, tokensUsed };
}
