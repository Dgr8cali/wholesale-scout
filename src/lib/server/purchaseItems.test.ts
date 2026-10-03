import { beforeEach, describe, expect, it, vi } from "vitest";
import { __setDbForTests } from "./db";
import { FakeDb } from "./fakeDb";
import { linkPurchasesToItems, listPurchases, recordPurchase } from "./purchases";
import { ensureItemImage, receivePurchase, recordStockPurchase } from "./stock";
import { editOrder } from "./stockEdit";

vi.mock("./productPage", () => ({
  productView: async (asin: string) => ({
    asin, products: [{ id: "p1", ean: "5012345678900" }], keepa: { fetchedAt: "2026-09-25T10:00:00Z" },
    judgement: { decision: "buy", confidence: "high", reasons: [], doubts: [] },
    latest: { id: "r1", run_id: "run1", verdict: "pass", score: 70, sell_price: 20, landed_cost: 8, profit: 5, fees: { total: 7 }, inputs: { market: { hasHistory: true, rankDrops30d: 40, fbaOffers: 3, currentBuyBox: 20 } }, product: { id: "p1", ean: "5012345678900" }, run: { name: "Run A", source: "a.xlsx", profile: { name: "First order" } } },
  }),
}));
// Keepa: 1 token for an image; SP-API not configured here.
const lookup = vi.fn(async (asins: string[]) => ({ tokensUsed: 1, byAsin: new Map(asins.map((a) => [a, { imageUrl: `https://m.media-amazon.com/${a}.jpg` }])) }));
vi.mock("../keepa/client", () => ({ getKeepa: () => ({ available: true, lookupByAsins: (a: string[]) => lookup(a) }) }));
vi.mock("../spapi/client", () => ({ getSpApi: () => null }));

describe("purchases and stock items: one record", () => {
  let fake: FakeDb;
  beforeEach(() => {
    lookup.mockClear();
    fake = new FakeDb();
    __setDbForTests(fake);
    for (const t of ["stock_items", "stock_movements", "purchases", "suppliers", "amazon_inventory", "ads_products", "stock_audit"]) fake.tables[t] ??= [];
    fake.tables.products = [{ id: "p1", ean: "5012345678900", asin: "B0BIOTENE1", title: "Biotene Mouth Spray 3 Pack", brand: "Biotene", image_url: "https://m.media-amazon.com/biotene.jpg", weight_g: 210, dims_cm: { l: 12, w: 8, h: 5 }, updated_at: "2026-09-25T00:00:00Z" }];
    fake.tables.suppliers = [{ id: "s1", name: "All Star Health" }];
  });

  it("a product-page purchase finds or makes the stock item from the catalogue", async () => {
    const p = await recordPurchase({ asin: "B0BIOTENE1", units: 24, landedGbp: 4.1, supplierId: "s1", supplierName: "All Star Health" });
    expect(fake.tables.stock_items).toEqual([expect.objectContaining({
      sku: "B0BIOTENE1", name: "Biotene Mouth Spray 3 Pack", asin: "B0BIOTENE1", brand: "Biotene", image_url: "https://m.media-amazon.com/biotene.jpg",
      weight_g: 210, dims_cm: { l: 12, w: 8, h: 5 }, product_id: "p1", supplier_id: "s1", unit_cost: 4.1,
    })]);
    expect(p).toMatchObject({ stock_item_id: fake.tables.stock_items[0].id, tokensUsed: 0 });
    // A second purchase of it uses the same item.
    await recordPurchase({ asin: "B0BIOTENE1", units: 12, landedGbp: 4 });
    expect(fake.tables.stock_items).toHaveLength(1);
    expect(new Set(fake.tables.purchases.map((x) => x.stock_item_id)).size).toBe(1);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("an existing item (made in Stock) is the one linked, its empty fields filled; an archived one is restored", async () => {
    fake.tables.stock_items.push({ id: "i9", sku: "0810186091286", name: "Ekkovision pair", asin: "B0BIOTENE1", image_url: null, archived_at: "2026-10-01T00:00:00Z" });
    await recordPurchase({ asin: "B0BIOTENE1", units: 5, landedGbp: 4 });
    expect(fake.tables.stock_items).toEqual([expect.objectContaining({ id: "i9", name: "Ekkovision pair", image_url: "https://m.media-amazon.com/biotene.jpg", brand: "Biotene", archived_at: null })]);
    expect(fake.tables.purchases[0].stock_item_id).toBe("i9");
  });

  it("an image from Keepa (1 token) when the catalogue has none; looked for once", async () => {
    fake.tables.stock_items.push({ id: "i1", sku: "PILL", name: "Pill box", asin: "B0H9ZKYYHZ", image_url: null, image_checked_at: null });
    expect(await ensureItemImage("i1")).toEqual({ image: "https://m.media-amazon.com/B0H9ZKYYHZ.jpg", source: "Keepa", tokensUsed: 1 });
    fake.tables.stock_items.push({ id: "i2", sku: "NOIMG", name: "x", asin: "B0NOIMAGE1", image_url: null, image_checked_at: null });
    lookup.mockResolvedValueOnce({ tokensUsed: 1, byAsin: new Map() });
    expect(await ensureItemImage("i2")).toMatchObject({ image: null, tokensUsed: 1 });
    expect(await ensureItemImage("i2")).toMatchObject({ image: null, tokensUsed: 0 });
    expect(lookup).toHaveBeenCalledTimes(2);
    expect((await ensureItemImage("i2", { keepa: false })).tokensUsed).toBe(0);
  });

  it("backfill: old purchases linked by ASIN (items made where needed), images filled", async () => {
    fake.tables.purchases.push(
      { id: "o1", asin: "B0BIOTENE1", units: 3, landed_gbp: 4, supplier_id: "s1", product_id: "p1", stock_item_id: null, status: "ordered", status_dates: {}, prediction: {}, ordered_on: "2026-09-20" },
      { id: "o2", asin: "B0H9ZKYYHZ", units: 2, landed_gbp: 1.3, supplier_id: null, product_id: null, stock_item_id: null, status: "ordered", status_dates: {}, prediction: {}, ordered_on: "2026-09-21" },
    );
    fake.tables.stock_items.push({ id: "i1", sku: "HEALTH-PILL-7DAY", name: "7-Day Pill Organiser", asin: "B0H9ZKYYHZ", image_url: null, image_checked_at: null });
    const r = await linkPurchasesToItems();
    expect(r.linked.map((l) => [l.purchase, l.sku, l.created])).toEqual([["o1", "B0BIOTENE1", true], ["o2", "HEALTH-PILL-7DAY", false]]);
    expect(r.images).toEqual([{ sku: "HEALTH-PILL-7DAY", source: "Keepa" }]);
    expect(r.tokensUsed).toBe(1);
    expect((await linkPurchasesToItems()).linked).toEqual([]);
    const listed = await listPurchases();
    expect(listed.every((p) => p.stock_item_id)).toBe(true);
  });

  it("one edit for every page: item, supplier, quantity, cost in another currency; a received order's receipt follows", async () => {
    fake.tables.stock_items.push({ id: "i1", sku: "PILL", name: "Pill box", asin: null, unit_cost: 1.3 }, { id: "i2", sku: "PAD", name: "Padlock", asin: "B0PADLOCK1", unit_cost: 5 });
    const p = await recordStockPurchase({ itemId: "i1", units: 50, landedGbp: 1.3 }) as { id: string };
    await receivePurchase(p.id, "home", "2026-10-02");
    const r = await editOrder(p.id, { stockItemId: "i2", supplierId: "s1", units: 40, currency: "USD", fxRate: 0.8, unitCostCcy: 5, orderId: "AL-7" });
    expect(r.receiptUpdated).toBe(true);
    expect(fake.tables.purchases[0]).toMatchObject({ stock_item_id: "i2", asin: "B0PADLOCK1", supplier_name: "All Star Health", units: 40, landed_gbp: 4, currency: "USD", unit_cost_ccy: 5, order_id: "AL-7" });
    expect(fake.tables.stock_movements[0]).toMatchObject({ item_id: "i2", quantity: 40, unit_cost: 4, supplier_id: "s1", order_id: "AL-7", currency: "USD" });
    expect(fake.tables.stock_audit[0].summary).toMatch(/^Edited order AL-7 \(.*units.*\); its receipt follows$/);
    await expect(editOrder(p.id, { units: 0 })).rejects.toThrow(/at least 1/);
  });
});
