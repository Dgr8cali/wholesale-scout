/**
 * Stock: what you hold, per item and bucket, from a ledger of movements. Self-ship (home) and
 * TikTok FBT are the sums of their movements; Amazon FBA is SP-API's fulfillable count, never
 * entered by hand. Demand is Amazon's own orders (amazon_sales) plus the sales recorded here, over
 * the trailing 30 days. Pure: the pages and the server share it.
 */

export const BUCKETS = ["home", "fba", "tiktok_fbt"] as const;
export type Bucket = (typeof BUCKETS)[number];
export const BUCKET_LABEL: Record<Bucket, string> = { home: "Self-ship", fba: "Amazon FBA", tiktok_fbt: "TikTok FBT" };
/** Buckets you move stock in and out of yourself (FBA follows SP-API). */
export const MANUAL_BUCKETS: Bucket[] = ["home", "tiktok_fbt"];

export const MOVEMENT_KINDS = ["receipt", "sale", "return", "adjustment", "transfer_in", "transfer_out"] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];
export const KIND_LABEL: Record<MovementKind, string> = {
  receipt: "Received", sale: "Sale", return: "Return", adjustment: "Adjustment", transfer_in: "Transfer in", transfer_out: "Transfer out",
};
export const ADJUST_REASONS = ["Stock count", "Damage", "Loss", "Sample", "Other"] as const;
export const SALE_CHANNELS = ["eBay", "TikTok Shop", "Shopify", "Etsy", "Website", "In person", "Wholesale", "Other"] as const;

export interface Movement { item_id: string; bucket: Bucket; quantity: number; kind: MovementKind; date: string }

export type Levels = Record<Bucket, number>;
export const ZERO_LEVELS: Levels = { home: 0, fba: 0, tiktok_fbt: 0 };

/** Each item's level per bucket from its movements; FBA from SP-API when given (it replaces any FBA movements). */
export function levelsByItem(movements: Movement[], fba: Map<string, number> = new Map()): Map<string, Levels> {
  const out = new Map<string, Levels>();
  for (const m of movements) {
    const l = out.get(m.item_id) ?? { ...ZERO_LEVELS };
    l[m.bucket] += m.quantity;
    out.set(m.item_id, l);
  }
  for (const [item, units] of fba) out.set(item, { ...(out.get(item) ?? ZERO_LEVELS), fba: units });
  return out;
}

export const totalOf = (l: Levels) => l.home + l.fba + l.tiktok_fbt;

/** Units a day per bucket over the window: FBA from Amazon's orders, the others from the sales recorded here. */
export function dailyDemand(x: { amazonUnits: number; sales: { bucket: Bucket; quantity: number }[]; days: number }): Levels & { total: number } {
  const d = Math.max(1, x.days);
  const by: Levels = { home: 0, fba: x.amazonUnits, tiktok_fbt: 0 };
  for (const s of x.sales) by[s.bucket] += s.quantity;
  const out = { home: by.home / d, fba: by.fba / d, tiktok_fbt: by.tiktok_fbt / d };
  return { ...out, total: out.home + out.fba + out.tiktok_fbt };
}

/** Days the stock lasts at this rate; null when nothing sells (no end in sight), 0 when there's none. */
export function daysOfCover(units: number, perDay: number): number | null {
  if (units <= 0) return 0;
  return perDay > 0 ? units / perDay : null;
}

export type LevelStatus = "ok" | "low" | "out";
/** Out at zero; low at or under the reorder level; ok above. */
export function levelStatus(total: number, reorderLevel: number | null): LevelStatus {
  if (total <= 0) return "out";
  return reorderLevel != null && total <= reorderLevel ? "low" : "ok";
}

export type ReorderStatus = "due" | "soon" | "ok" | "no demand";

export interface Reorder {
  /** Units a day, all buckets. */
  perDay: number;
  /** (lead time + buffer) × units a day: order when stock falls to it. */
  reorderPoint: number;
  /** 30 days of demand (the cover target). */
  suggestedQty: number;
  status: ReorderStatus;
  /** Days until the reorder point at this rate (0 when due). */
  daysToReorder: number | null;
}

/**
 * Reorder: due at or under the point, soon within a week of it, ok otherwise; nothing to say
 * without demand. The lead time is the item's (else its supplier's delivery days, else 14).
 */
export function reorderFor(x: { total: number; perDay: number; leadTimeDays: number | null; bufferDays: number; coverDays: number }): Reorder {
  const lead = x.leadTimeDays ?? 14;
  if (!(x.perDay > 0)) return { perDay: 0, reorderPoint: 0, suggestedQty: 0, status: "no demand", daysToReorder: null };
  const reorderPoint = Math.ceil((lead + x.bufferDays) * x.perDay);
  const suggestedQty = Math.ceil(x.coverDays * x.perDay);
  const daysToReorder = Math.max(0, (x.total - reorderPoint) / x.perDay);
  const status: ReorderStatus = x.total <= reorderPoint ? "due" : daysToReorder <= 7 ? "soon" : "ok";
  return { perDay: x.perDay, reorderPoint, suggestedQty, status, daysToReorder };
}

export interface CostSnapshot { unit_cost: number; packaging_cost: number; fee_pct: number; fee_each: number; cost_each: number; profit_each: number }

/** A sale's cost at that moment: unit + packaging + the listing's fee % of the price, per unit. */
export function costSnapshot(x: { unitCost: number | null; packagingCost: number | null; feePct: number | null; priceEach: number }): CostSnapshot {
  const unit = x.unitCost ?? 0, pack = x.packagingCost ?? 0, pct = x.feePct ?? 0;
  const fee = Math.round(x.priceEach * pct) / 100;
  const cost = Math.round((unit + pack + fee) * 100) / 100;
  return { unit_cost: unit, packaging_cost: pack, fee_pct: pct, fee_each: fee, cost_each: cost, profit_each: Math.round((x.priceEach - cost) * 100) / 100 };
}

/** Can this bucket give `quantity`? (FBA isn't sold from here: Amazon's own orders take it.) */
export function canTake(levels: Levels, bucket: Bucket, quantity: number): string | null {
  if (bucket === "fba") return "Amazon FBA stock moves with Amazon's own orders and SP-API: record sales here for the other buckets";
  if (!(quantity > 0)) return "Quantity must be at least 1";
  return levels[bucket] >= quantity ? null : `Only ${levels[bucket]} in ${BUCKET_LABEL[bucket]}`;
}
