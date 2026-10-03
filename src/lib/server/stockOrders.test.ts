import { beforeEach, describe, expect, it } from "vitest";
import { __setDbForTests, ensureSeed } from "./db";
import { FakeDb } from "./fakeDb";
import { updatePurchase } from "./purchases";
import { receive, receivePurchase, recordStockPurchase } from "./stock";
import { createSupplier, supplierDetail, supplierLedger } from "./suppliers";

describe("orders and suppliers from Stock (FakeDb)", () => {
  let fake: FakeDb;
  beforeEach(async () => {
    fake = new FakeDb();
    __setDbForTests(fake);
    await ensureSeed();
    for (const t of ["suppliers", "offers", "results", "brand_products", "runs", "purchases", "stock_movements", "stock_items"]) fake.tables[t] ??= [];
    fake.tables.stock_items.push({ id: "i1", sku: "PADLOCK-4", name: "Padlock 4-pack", asin: null, unit_cost: 1.2, status: "active" });
    fake.tables.suppliers.push({ id: "s0", name: "Henbrandt", source_type: "upload", vat_basis: "ex_vat", vat_rate: 20, currency: "GBP" });
  });

  it("+ New supplier: created as a Stock supplier; the same name (any case) returns it", async () => {
    const a = await createSupplier({ name: "Shanghai Done-Sure", kind: "marketplace", marketplace: "1688", leadTimeDays: 30 });
    expect(a).toMatchObject({ existed: false, supplier: { name: "Shanghai Done-Sure", source_type: "stock", kind: "marketplace", marketplace: "1688", delivery_days: 30 } });
    const b = await createSupplier({ name: "shanghai done-sure " });
    expect(b).toMatchObject({ existed: true, supplier: { id: a.supplier.id } });
    expect(fake.tables.suppliers).toHaveLength(2);
  });

  it("a new order: Ordered, in USD at a rate; Receive carries the order onto the receipt", async () => {
    const { supplier } = await createSupplier({ name: "Ningbo Tiger", kind: "manufacturer" });
    const p = await recordStockPurchase({
      itemId: "i1", units: 200, supplierId: supplier.id, currency: "USD", fxRate: 0.8, unitCostCcy: 1.5,
      orderId: "AL-99812", orderUrl: "biz.alibaba.com/ta/detail.htm?orderId=99812", orderedDate: "2026-10-01", expectedDate: "2026-10-25", trackingCarrier: "DHL", trackingNumber: "JD01",
    }) as Record<string, unknown>;
    expect(p).toMatchObject({ status: "ordered", units: 200, landed_gbp: 1.2, unit_cost_gbp: 1.2, ordered_on: "2026-10-01", expected_date: "2026-10-25", order_id: "AL-99812", order_url: "https://biz.alibaba.com/ta/detail.htm?orderId=99812", currency: "USD", fx_rate: 0.8, unit_cost_ccy: 1.5, supplier_name: "Ningbo Tiger", stock_item_id: "i1" });
    await expect(recordStockPurchase({ itemId: "i1", units: 1, currency: "CNY", unitCostCcy: 8 })).rejects.toThrow(/FX rate/);

    const r = await receivePurchase(String(p.id), "home", "2026-10-24");
    expect(r).toEqual({ created: true, itemId: "i1" });
    expect(fake.tables.stock_movements).toEqual([expect.objectContaining({
      kind: "receipt", bucket: "home", quantity: 200, date: "2026-10-24", unit_cost: 1.2, purchase_id: p.id, supplier_id: supplier.id,
      order_id: "AL-99812", order_url: "https://biz.alibaba.com/ta/detail.htm?orderId=99812", ordered_date: "2026-10-01", tracking_carrier: "DHL", currency: "USD", unit_cost_ccy: 1.5,
    })]);
    // Received again: no second receipt.
    expect((await receivePurchase(String(p.id), "home")).created).toBe(false);
    expect(fake.tables.stock_movements).toHaveLength(1);
  });

  it("order details edited later; a status move leaves them alone", async () => {
    const p = await recordStockPurchase({ itemId: "i1", units: 10, landedGbp: 1.3 }) as { id: string };
    await updatePurchase(p.id, { orderId: "EB-1", orderUrl: "https://www.ebay.co.uk/vod/1", trackingNumber: "RM1" });
    expect(fake.tables.purchases[0]).toMatchObject({ order_id: "EB-1", tracking_number: "RM1", currency: "GBP" });
    await updatePurchase(p.id, { status: "received" });
    expect(fake.tables.purchases[0]).toMatchObject({ order_id: "EB-1", status: "received" });
  });

  it("Receive without a purchase: supplier and order typed; a cost in CNY turned into £", async () => {
    await receive({ itemId: "i1", bucket: "home", quantity: 50, date: "2026-10-02", unitCost: 9, supplierId: "s0", orderId: "1688-7", currency: "CNY", fxRate: 0.11 });
    expect(fake.tables.stock_movements[0]).toMatchObject({ unit_cost: 0.99, unit_cost_ccy: 9, currency: "CNY", fx_rate: 0.11, supplier_id: "s0", order_id: "1688-7", purchase_id: null });
  });

  it("the ledger counts Stock's items and orders; the detail lists them", async () => {
    const { supplier } = await createSupplier({ name: "DealsByS", kind: "marketplace", marketplace: "eBay" });
    fake.tables.stock_items[0].supplier_id = supplier.id;
    await recordStockPurchase({ itemId: "i1", units: 5, landedGbp: 1.1, supplierId: supplier.id, orderId: "EB-22" });
    await receive({ itemId: "i1", bucket: "home", quantity: 3, supplierId: supplier.id, orderId: "EB-23" });
    const row = (await supplierLedger()).find((s) => s.id === supplier.id)!;
    expect(row).toMatchObject({ source_type: "stock", stock: { items: 1, purchases: 1 }, stats: { runs: 0, products: 0 } });
    const d = (await supplierDetail(supplier.id))!;
    expect(d.stockItems.map((i) => i.sku)).toEqual(["PADLOCK-4"]);
    expect(d.purchases).toEqual([expect.objectContaining({ order_id: "EB-22", units: 5, status: "ordered" })]);
    expect(d.receipts).toEqual([expect.objectContaining({ order_id: "EB-23", quantity: 3 })]);
  });
});
