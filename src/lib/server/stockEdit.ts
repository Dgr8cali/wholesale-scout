import "server-only";
import { BUCKET_LABEL, MANUAL_BUCKETS, signedQuantity, type Bucket, type MovementKind } from "../stock/levels";
import { db, must } from "./db";

/**
 * Stock: correcting mistakes. Edit or delete a movement (a sale takes its sale with it, a transfer
 * both halves, a receipt from an order puts the order back to Ordered), delete a sale, an open
 * order or a listing, and archive, restore or permanently delete an item. Levels are sums of the
 * movements left, so nothing else needs adjusting. Every change is written to stock_audit.
 */

export type AuditEntity = "movement" | "item" | "sale" | "purchase" | "listing";
export type AuditAction = "edit" | "delete" | "archive" | "restore" | "purge";
interface Mv {
  id: string; item_id: string; bucket: Bucket; quantity: number; kind: MovementKind; date: string; reason: string | null; note: string | null;
  unit_cost: number | null; sale_id: string | null; purchase_id: string | null; transfer_id: string | null; created_at?: string;
}

const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

async function audit(entity: AuditEntity, entityId: string | null, action: AuditAction, summary: string, before: unknown, after: unknown = null) {
  must(await db().from("stock_audit").insert({ entity, entity_id: entityId, action, summary, before, after, actor: "you" }), "audit");
}

async function movement(id: string): Promise<Mv> {
  const m = must(await db().from("stock_movements").select("*").eq("id", id).maybeSingle(), "movement") as Mv | null;
  if (!m) throw new Error("No such movement (already deleted?)");
  return m;
}
async function skuOf(itemId: string) {
  const r = must(await db().from("stock_items").select("sku").eq("id", itemId).maybeSingle(), "item") as { sku: string } | null;
  return r?.sku ?? "item";
}
const NOUN: Record<MovementKind, string> = { receipt: "receipt", sale: "sale", return: "return", adjustment: "adjustment", transfer_in: "transfer in", transfer_out: "transfer out" };
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const what = (m: Mv, sku: string) => `${NOUN[m.kind]} of ${Math.abs(m.quantity)} × ${sku} ${m.quantity > 0 ? "into" : "from"} ${BUCKET_LABEL[m.bucket]} (${m.date})`;

/* ===================== movements ===================== */

/**
 * Edit a movement: quantity (its kind's sign kept), date, bucket (yours, not FBA), reason, note,
 * unit cost. A sale's quantity and date follow onto its sale; a transfer's quantity and date onto
 * its other half (whose bucket must differ).
 */
export async function editMovement(id: string, patch: { quantity?: number | string; date?: string; bucket?: string; reason?: string | null; note?: string | null; unit_cost?: number | string | null }) {
  const d = db();
  const m = await movement(id);
  const row: Partial<Mv> = {};
  if (patch.quantity !== undefined && patch.quantity !== "") row.quantity = signedQuantity(m.kind, Number(patch.quantity));
  if (patch.date !== undefined) { if (!isDate(patch.date)) throw new Error("Date must be YYYY-MM-DD"); row.date = patch.date; }
  if (patch.bucket !== undefined) {
    if (!MANUAL_BUCKETS.includes(patch.bucket as Bucket)) throw new Error("Amazon FBA follows SP-API: a movement can only be in Self-ship or TikTok FBT");
    row.bucket = patch.bucket as Bucket;
  }
  if (patch.reason !== undefined) row.reason = patch.reason?.trim() || null;
  if (patch.note !== undefined) row.note = patch.note?.trim() || null;
  if (patch.unit_cost !== undefined) { const c = patch.unit_cost === "" || patch.unit_cost == null ? null : Number(patch.unit_cost); if (c != null && !(c >= 0)) throw new Error("Unit cost must be a number"); row.unit_cost = c; }
  const other = m.transfer_id ? (must(await d.from("stock_movements").select("*").eq("transfer_id", m.transfer_id).neq("id", m.id), "other half") as Mv[])[0] ?? null : null;
  if (other && row.bucket && row.bucket === other.bucket) throw new Error(`The other half of this transfer is in ${BUCKET_LABEL[other.bucket]}: pick the other bucket`);
  const after = must(await d.from("stock_movements").update(row).eq("id", id).select("*").single(), "edit movement") as Mv;
  const notes: string[] = [];
  if (other && (row.quantity !== undefined || row.date !== undefined)) {
    must(await d.from("stock_movements").update({ ...(row.quantity !== undefined ? { quantity: -row.quantity } : {}), ...(row.date ? { date: row.date } : {}) }).eq("id", other.id), "other half");
    notes.push("the transfer's other half changed with it");
  }
  if (m.kind === "sale" && m.sale_id && (row.quantity !== undefined || row.date !== undefined)) {
    must(await d.from("stock_sales").update({ ...(row.quantity !== undefined ? { quantity: Math.abs(row.quantity) } : {}), ...(row.date ? { date: row.date } : {}) }).eq("id", m.sale_id), "sale");
    notes.push("its sale changed with it");
  }
  if (m.kind === "return" && m.sale_id && row.quantity !== undefined && row.quantity !== m.quantity) {
    const s = must(await d.from("stock_sales").select("returned_quantity").eq("id", m.sale_id).maybeSingle(), "sale") as { returned_quantity: number } | null;
    if (s) must(await d.from("stock_sales").update({ returned_quantity: Math.max(0, Number(s.returned_quantity ?? 0) + row.quantity - m.quantity) }).eq("id", m.sale_id), "returned");
  }
  const sku = await skuOf(m.item_id);
  await audit("movement", id, "edit", `Edited a ${what(m, sku)}${notes.length ? `; ${notes.join(", ")}` : ""}`, m, after);
  return { movement: after, notes };
}

/**
 * Delete a movement, and what goes with it: a sale movement's sale (and the sale's returns), a
 * transfer's other half, a return's count on its sale; a receipt from an order sets the order back
 * to Ordered. Returns what was done, in words.
 */
export async function deleteMovement(id: string): Promise<{ deleted: number; notes: string[] }> {
  const d = db();
  const m = await movement(id);
  const sku = await skuOf(m.item_id);
  const notes: string[] = [];
  let deleted = 1;
  if (m.kind === "sale" && m.sale_id) {
    const r = await deleteSaleRow(m.sale_id, sku);
    return { deleted: r.movements, notes: r.notes };
  }
  if (m.transfer_id) {
    const halves = must(await d.from("stock_movements").select("*").eq("transfer_id", m.transfer_id), "transfer") as Mv[];
    must(await d.from("stock_movements").delete().eq("transfer_id", m.transfer_id), "delete transfer");
    deleted = halves.length;
    if (halves.length > 1) notes.push("both halves of the transfer");
    await audit("movement", id, "delete", `Deleted a transfer of ${Math.abs(m.quantity)} × ${sku} (${m.date})`, halves);
    return { deleted, notes };
  }
  must(await d.from("stock_movements").delete().eq("id", id), "delete movement");
  if (m.kind === "return" && m.sale_id) {
    const s = must(await d.from("stock_sales").select("returned_quantity").eq("id", m.sale_id).maybeSingle(), "sale") as { returned_quantity: number } | null;
    if (s) { must(await d.from("stock_sales").update({ returned_quantity: Math.max(0, Number(s.returned_quantity ?? 0) - m.quantity) }).eq("id", m.sale_id), "returned"); notes.push("its sale can take that return again"); }
  }
  if (m.kind === "receipt" && m.purchase_id) {
    const p = await reopenPurchase(m.purchase_id);
    if (p) notes.push(`its order${p.order_id ? ` ${p.order_id}` : ""} is back to Ordered in the Tracker`);
  }
  await audit("movement", id, "delete", `Deleted a ${what(m, sku)}${notes.length ? `; ${notes.join(", ")}` : ""}`, m);
  return { deleted, notes };
}

/** Several at once (Movements → Delete selected): halves and sales already gone are skipped. */
export async function deleteMovements(ids: string[]) {
  let deleted = 0;
  const notes: string[] = [];
  for (const id of [...new Set(ids)]) {
    const exists = must(await db().from("stock_movements").select("id").eq("id", id), "movement") as unknown[];
    if (!exists.length) continue;
    const r = await deleteMovement(id);
    deleted += r.deleted;
    notes.push(...r.notes);
  }
  return { deleted, notes: [...new Set(notes)] };
}

/** A receipt from an order removed: the order is Ordered again (and can be received again). */
async function reopenPurchase(purchaseId: string) {
  const d = db();
  const p = must(await d.from("purchases").select("id, status, status_dates, order_id, received_bucket").eq("id", purchaseId).maybeSingle(), "purchase") as { id: string; status: string; status_dates: Record<string, string>; order_id: string | null; received_bucket: string | null } | null;
  if (!p) return null;
  const dates = { ...p.status_dates };
  for (const k of ["received", "sent", "live", "closed"]) delete dates[k];
  const after = { status: "ordered", status_dates: dates, received_bucket: null, updated_at: new Date().toISOString() };
  must(await d.from("purchases").update(after).eq("id", p.id), "reopen order");
  await audit("purchase", p.id, "edit", `Order${p.order_id ? ` ${p.order_id}` : ""} set back to Ordered: its receipt was deleted`, p, after);
  return p;
}

/* ===================== sales ===================== */

async function deleteSaleRow(saleId: string, sku?: string) {
  const d = db();
  const s = must(await d.from("stock_sales").select("*").eq("id", saleId).maybeSingle(), "sale") as { id: string; item_id: string; channel: string; date: string; quantity: number; price_each: number; returned_quantity: number } | null;
  if (!s) throw new Error("No such sale (already deleted?)");
  const moves = must(await d.from("stock_movements").select("*").eq("sale_id", saleId), "sale movements") as Mv[];
  // The sale's movements (its sale and any returns) go with it.
  must(await d.from("stock_movements").delete().eq("sale_id", saleId), "delete sale movements");
  must(await d.from("stock_sales").delete().eq("id", saleId), "delete sale");
  const notes = [`its sale (${s.channel}, ${s.date})`];
  if (moves.some((m) => m.kind === "return")) notes.push("its returns");
  await audit("sale", saleId, "delete", `Deleted a sale of ${s.quantity} × ${sku ?? (await skuOf(s.item_id))} on ${s.channel} (${s.date}), with its stock movement${moves.length > 1 ? "s" : ""}`, { sale: s, movements: moves });
  return { movements: moves.length, notes };
}

/** Delete a sale from Stock → Sales: its movement (and returns) go with it. */
export async function deleteSale(saleId: string) {
  return deleteSaleRow(saleId);
}

/* ===================== orders and listings ===================== */

/** Delete an order that hasn't been received into Stock (a receipt must be deleted first). */
export async function deleteOpenPurchase(id: string) {
  const d = db();
  const p = must(await d.from("purchases").select("*").eq("id", id).maybeSingle(), "purchase") as { id: string; units: number; order_id: string | null; asin: string | null; stock_item_id: string | null } | null;
  if (!p) throw new Error("No such order");
  const receipts = must(await d.from("stock_movements").select("id").eq("purchase_id", id).eq("kind", "receipt"), "receipts") as unknown[];
  if (receipts.length) throw new Error("It's been received into Stock: delete its receipt on Stock → Movements first (the order goes back to Ordered)");
  must(await d.from("purchases").delete().eq("id", id), "delete order");
  await audit("purchase", id, "delete", `Deleted an order of ${p.units}${p.order_id ? ` (${p.order_id})` : ""}`, p);
}

export async function deleteListing(itemId: string, listingId: string) {
  const d = db();
  const l = must(await d.from("stock_listings").select("*").eq("id", listingId).eq("item_id", itemId).maybeSingle(), "listing") as { id: string; marketplace: string; marketplace_sku: string | null } | null;
  if (!l) throw new Error("No such listing");
  must(await d.from("stock_listings").delete().eq("id", listingId), "delete listing");
  await audit("listing", listingId, "delete", `Deleted the ${l.marketplace}${l.marketplace_sku ? ` ${l.marketplace_sku}` : ""} listing of ${await skuOf(itemId)}`, l);
}

/* ===================== items ===================== */

/** What deleting an item takes with it. */
export async function itemImpact(itemId: string) {
  const d = db();
  const [moves, sales, listings, orders] = await Promise.all([
    d.from("stock_movements").select("id").eq("item_id", itemId),
    d.from("stock_sales").select("id").eq("item_id", itemId),
    d.from("stock_listings").select("id").eq("item_id", itemId),
    d.from("purchases").select("id").eq("stock_item_id", itemId),
  ]);
  return { movements: (must(moves, "movements") as unknown[]).length, sales: (must(sales, "sales") as unknown[]).length, listings: (must(listings, "listings") as unknown[]).length, orders: (must(orders, "orders") as unknown[]).length };
}

async function itemRow(id: string) {
  const it = must(await db().from("stock_items").select("*").eq("id", id).maybeSingle(), "item") as { id: string; sku: string; name: string; archived_at: string | null } | null;
  if (!it) throw new Error("No such item");
  return it;
}

/** Archive (the default delete): hidden from Levels, Reorder and Home; everything kept; Restore brings it back. */
export async function archiveItem(id: string) {
  const it = await itemRow(id);
  if (it.archived_at) return it;
  const after = must(await db().from("stock_items").update({ archived_at: new Date().toISOString() }).eq("id", id).select("*").single(), "archive") as typeof it;
  await audit("item", id, "archive", `Archived ${it.sku} (${it.name})`, it, after);
  return after;
}

export async function restoreItem(id: string) {
  const it = await itemRow(id);
  const after = must(await db().from("stock_items").update({ archived_at: null }).eq("id", id).select("*").single(), "restore") as typeof it;
  await audit("item", id, "restore", `Restored ${it.sku} (${it.name})`, it, after);
  return after;
}

/**
 * Delete permanently (archived items only): the item, its movements, sales, listings and its
 * orders in the Tracker. The audit keeps what was removed.
 */
export async function purgeItem(id: string) {
  const d = db();
  const it = await itemRow(id);
  if (!it.archived_at) throw new Error("Archive it first: only an archived item can be deleted permanently");
  const impact = await itemImpact(id);
  const orders = must(await d.from("purchases").select("*").eq("stock_item_id", id), "orders");
  must(await d.from("purchases").delete().eq("stock_item_id", id), "delete orders");
  // Movements, sales and listings go with the item (on delete cascade).
  must(await d.from("stock_items").delete().eq("id", id), "delete item");
  for (const t of ["stock_movements", "stock_sales", "stock_listings"]) {
    const left = must(await d.from(t).select("id").eq("item_id", id), t) as unknown[];
    if (left.length) must(await d.from(t).delete().eq("item_id", id), t);
  }
  await audit("item", id, "purge", `Deleted ${it.sku} (${it.name}) permanently, with ${plural(impact.movements, "movement")}, ${plural(impact.sales, "sale")}, ${plural(impact.listings, "listing")} and ${plural(impact.orders, "order")}`, { item: it, orders, impact });
  return impact;
}

/** Several items: archive, restore or delete permanently. */
export async function bulkItems(ids: string[], action: "archive" | "restore" | "purge") {
  let done = 0;
  for (const id of [...new Set(ids)]) {
    if (action === "archive") await archiveItem(id);
    else if (action === "restore") await restoreItem(id);
    else await purgeItem(id);
    done++;
  }
  return { done };
}

/* ===================== the log ===================== */

export async function auditLog(limit = 500) {
  return must(await db().from("stock_audit").select("*").order("created_at", { ascending: false }).limit(Math.min(500, limit)), "audit log") as { id: string; entity: AuditEntity; entity_id: string | null; action: AuditAction; summary: string; actor: string; before: unknown; after: unknown; created_at: string }[];
}
