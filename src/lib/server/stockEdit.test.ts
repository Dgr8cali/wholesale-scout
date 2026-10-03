import { beforeEach, describe, expect, it } from "vitest";
import { __setDbForTests, ensureSeed } from "./db";
import { FakeDb } from "./fakeDb";
import { listMovements, receive, receivePurchase, recordSale, recordStockPurchase, returnSale, stockLevels, transfer } from "./stock";
import { archiveItem, auditLog, deleteListing, deleteMovement, deleteMovements, deleteOpenPurchase, deleteSale, editMovement, itemImpact, purgeItem, restoreItem } from "./stockEdit";

describe("Stock: correcting mistakes (FakeDb)", () => {
  let fake: FakeDb;
  const moves = () => fake.tables.stock_movements;
  beforeEach(async () => {
    fake = new FakeDb();
    __setDbForTests(fake);
    await ensureSeed();
    for (const t of ["stock_items", "stock_movements", "stock_sales", "stock_listings", "stock_audit", "purchases", "suppliers", "amazon_inventory", "amazon_sales", "stock_settings"]) fake.tables[t] ??= [];
    fake.tables.stock_items.push({ id: "i1", sku: "PILL-BOX", name: "Pill box", asin: null, unit_cost: 1.3, packaging_cost: 0.2, status: "active", archived_at: null });
    await receive({ itemId: "i1", bucket: "home", quantity: 20, date: "2026-09-01" });
  });

  it("edit: a sale's quantity follows onto its sale; the audit keeps before and after", async () => {
    const { sale } = await recordSale({ itemId: "i1", bucket: "home", channel: "eBay", quantity: 2, priceEach: 8.99, date: "2026-09-03" }) as { sale: { id: string } };
    const mv = moves().find((m) => m.kind === "sale")!;
    const r = await editMovement(String(mv.id), { quantity: 3, date: "2026-09-04" });
    expect(r.movement).toMatchObject({ quantity: -3, date: "2026-09-04" });
    expect(r.notes).toEqual(["its sale changed with it"]);
    expect(fake.tables.stock_sales.find((s) => s.id === sale.id)).toMatchObject({ quantity: 3, date: "2026-09-04" });
    const [a] = await auditLog();
    expect(a).toMatchObject({ entity: "movement", action: "edit", before: expect.objectContaining({ quantity: -2 }), after: expect.objectContaining({ quantity: -3 }) });
    await expect(editMovement(String(mv.id), { bucket: "fba" })).rejects.toThrow(/SP-API/);
  });

  it("delete a sale movement: its sale (and returns) go; delete a sale: its movement goes", async () => {
    const s1 = (await recordSale({ itemId: "i1", bucket: "home", channel: "eBay", quantity: 2, priceEach: 9, date: "2026-09-03" }) as { sale: { id: string } }).sale;
    await returnSale({ saleId: s1.id, quantity: 1, bucket: "home", date: "2026-09-05" });
    const r = await deleteMovement(String(moves().find((m) => m.kind === "sale")!.id));
    expect(r.notes).toEqual([expect.stringMatching(/its sale \(eBay/), "its returns"]);
    expect(fake.tables.stock_sales).toEqual([]);
    expect(moves().map((m) => m.kind)).toEqual(["receipt"]);
    const s2 = (await recordSale({ itemId: "i1", bucket: "home", channel: "TikTok Shop", quantity: 4, priceEach: 9 }) as { sale: { id: string } }).sale;
    await deleteSale(s2.id);
    expect(moves().map((m) => m.kind)).toEqual(["receipt"]);
  });

  it("deleting a return lets its sale take it again", async () => {
    const s = (await recordSale({ itemId: "i1", bucket: "home", channel: "eBay", quantity: 2, priceEach: 9 }) as { sale: { id: string } }).sale;
    await returnSale({ saleId: s.id, quantity: 2, bucket: "home" });
    expect(fake.tables.stock_sales[0].returned_quantity).toBe(2);
    await deleteMovement(String(moves().find((m) => m.kind === "return")!.id));
    expect(fake.tables.stock_sales[0].returned_quantity).toBe(0);
  });

  it("a transfer: editing or deleting one half does both", async () => {
    await transfer({ itemId: "i1", from: "home", to: "tiktok_fbt", quantity: 6, date: "2026-09-02" });
    const out = moves().find((m) => m.kind === "transfer_out")!;
    expect(moves().find((m) => m.kind === "transfer_in")!.transfer_id).toBe(out.transfer_id);
    await editMovement(String(out.id), { quantity: 8 });
    expect(moves().filter((m) => m.transfer_id).map((m) => m.quantity).sort()).toEqual([-8, 8]);
    await expect(editMovement(String(out.id), { bucket: "tiktok_fbt" })).rejects.toThrow(/other half/);
    const r = await deleteMovement(String(out.id));
    expect(r).toMatchObject({ deleted: 2, notes: ["both halves of the transfer"] });
    expect(moves().map((m) => m.kind)).toEqual(["receipt"]);
  });

  it("deleting a receipt from an order: the order is Ordered again (and can't be deleted while received)", async () => {
    const p = await recordStockPurchase({ itemId: "i1", units: 50, landedGbp: 1.2, orderId: "AL-1" }) as { id: string };
    fake.tables.purchases[0].status = "received";
    fake.tables.purchases[0].status_dates = { ordered: "2026-09-01", received: "2026-09-10" };
    await receivePurchase(p.id, "home", "2026-09-10");
    await expect(deleteOpenPurchase(p.id)).rejects.toThrow(/delete its receipt/);
    const r = await deleteMovement(String(moves().find((m) => m.purchase_id === p.id)!.id));
    expect(r.notes).toEqual(["its order AL-1 is back to Ordered in the Tracker"]);
    expect(fake.tables.purchases[0]).toMatchObject({ status: "ordered", received_bucket: null, status_dates: { ordered: "2026-09-01" } });
    await deleteOpenPurchase(p.id);
    expect(fake.tables.purchases).toEqual([]);
  });

  it("a deletion that leaves a bucket negative is allowed, and flagged", async () => {
    await recordSale({ itemId: "i1", bucket: "home", channel: "eBay", quantity: 5, priceEach: 9, date: "2026-09-03" });
    await deleteMovement(String(moves().find((m) => m.kind === "receipt")!.id));
    const rows = await listMovements({});
    expect(rows.map((r) => [r.kind, r.negative])).toEqual([["sale", true]]);
    expect((await stockLevels()).items[0].levels.home).toBe(-5);
  });

  it("bulk delete skips what an earlier one already took", async () => {
    await transfer({ itemId: "i1", from: "home", to: "tiktok_fbt", quantity: 2 });
    const r = await deleteMovements(moves().filter((m) => m.transfer_id).map((m) => String(m.id)));
    expect(r.deleted).toBe(2);
  });

  it("items: archive (hidden, kept), restore, delete permanently (archived only) with everything", async () => {
    fake.tables.stock_listings.push({ id: "l1", item_id: "i1", marketplace: "eBay", marketplace_sku: "PB1" });
    await recordSale({ itemId: "i1", bucket: "home", channel: "eBay", quantity: 1, priceEach: 9 });
    await recordStockPurchase({ itemId: "i1", units: 10, landedGbp: 1.2 });
    expect(await itemImpact("i1")).toEqual({ movements: 2, sales: 1, listings: 1, orders: 1 });
    await expect(purgeItem("i1")).rejects.toThrow(/Archive it first/);
    await archiveItem("i1");
    expect((await stockLevels()).items).toEqual([]);
    expect((await stockLevels()).archivedCount).toBe(1);
    expect((await stockLevels({ archived: true })).items.map((i) => i.item.sku)).toEqual(["PILL-BOX"]);
    await restoreItem("i1");
    expect((await stockLevels()).items).toHaveLength(1);
    await archiveItem("i1");
    expect(await purgeItem("i1")).toEqual({ movements: 2, sales: 1, listings: 1, orders: 1 });
    for (const t of ["stock_items", "stock_movements", "stock_sales", "stock_listings", "purchases"]) expect(fake.tables[t]).toEqual([]);
    expect((await auditLog()).map((a) => a.action).sort()).toEqual(["archive", "archive", "purge", "restore"]);
  });

  it("a listing delete is audited", async () => {
    fake.tables.stock_listings.push({ id: "l1", item_id: "i1", marketplace: "eBay", marketplace_sku: "PB1" });
    await deleteListing("i1", "l1");
    expect(fake.tables.stock_listings).toEqual([]);
    expect((await auditLog())[0].summary).toBe("Deleted the eBay PB1 listing of PILL-BOX");
  });
});
