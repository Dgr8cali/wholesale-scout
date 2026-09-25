import "server-only";
import { predictionFor, PURCHASE_STATUSES, type Prediction, type PurchaseStatus } from "../tracker";
import { db, must } from "./db";
import { productView } from "./productPage";

export interface Purchase {
  id: string; asin: string; ean: string | null; product_id: string | null; supplier_id: string | null; supplier_name: string | null;
  units: number; unit_cost_gbp: number | null; landed_gbp: number; ordered_on: string; status: PurchaseStatus;
  status_dates: Partial<Record<PurchaseStatus, string>>; note: string | null; prediction: Prediction; created_at: string;
  /** For lists: the product's title and image. */
  product?: { title: string | null; brand: string | null; image_url: string | null } | null;
}

export interface NewPurchase {
  asin: string; units: number; landedGbp: number; unitCostGbp?: number | null;
  supplierId?: string | null; supplierName?: string | null; orderedOn?: string | null; note?: string | null;
}

const COLS = "*, product:products(title, brand, image_url)";
/** Today in the UK, as YYYY-MM-DD (the server runs in UTC). */
const ukToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const numbers = (p: Record<string, unknown>) => ({ ...p, landed_gbp: Number(p.landed_gbp), unit_cost_gbp: p.unit_cost_gbp == null ? null : Number(p.unit_cost_gbp) }) as unknown as Purchase;

/** Record a purchase: the product's latest screening and judgement are frozen as the prediction. */
export async function recordPurchase(input: NewPurchase): Promise<Purchase> {
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
  const row = must(await db().from("purchases").insert({
    asin, ean: product?.ean ?? null, product_id: product?.id ?? null,
    supplier_id: input.supplierId || null, supplier_name: input.supplierName?.trim().slice(0, 120) || null,
    units, unit_cost_gbp: input.unitCostGbp != null && Number.isFinite(Number(input.unitCostGbp)) ? Number(input.unitCostGbp) : null,
    landed_gbp: Math.round(landed * 100) / 100, ordered_on: orderedOn, status: "ordered", status_dates: { ordered: orderedOn },
    note: input.note?.trim().slice(0, 1000) || null, prediction,
  }).select(COLS).single(), "save purchase") as Record<string, unknown>;
  return numbers(row);
}

/** Purchases, newest first; for one ASIN with `asin`. */
export async function listPurchases(asin?: string | null): Promise<Purchase[]> {
  let q = db().from("purchases").select(COLS).order("ordered_on", { ascending: false }).order("created_at", { ascending: false }).limit(1000);
  if (asin) q = q.eq("asin", asin.toUpperCase());
  return (must(await q, "purchases") as Record<string, unknown>[]).map(numbers);
}

/** Move a purchase along (its date is recorded), or correct units, cost, date or note. */
export async function updatePurchase(id: string, p: { status?: PurchaseStatus; units?: number; landedGbp?: number; orderedOn?: string; note?: string | null; on?: string }): Promise<Purchase> {
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
  return numbers(must(await d.from("purchases").update(patch).eq("id", id).select(COLS).single(), "update purchase") as Record<string, unknown>);
}

export async function deletePurchase(id: string): Promise<void> {
  must(await db().from("purchases").delete().eq("id", id), "delete purchase");
}
