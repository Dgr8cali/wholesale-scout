import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QogitaCategory, QogitaClient, QogitaProduct } from "../qogita/client";
import { __setDbForTests } from "./db";
import { FakeDb } from "./fakeDb";
import { estimatePull, leavesUnder, pullProducts, runQogitaPull, EMPTY_QOGITA_FILTERS } from "./qogitaPull";

vi.mock("./fx", () => ({ gbpRate: async (c: string) => (c === "GBP" ? { rate: 1, date: "2026-09-25", source: "fixed" } : { rate: 0.86, date: "2026-09-25", source: "test" }) }));

const CATS: QogitaCategory[] = [
  { name: "Face Cream", slug: "face-cream", path: ["Health & Beauty", "Face", "Skin Care", "Face Cream"] },
  { name: "Sheet Mask", slug: "sheet-mask", path: ["Health & Beauty", "Face", "Skin Care", "Sheet Mask"] },
  { name: "Shampoo", slug: "shampoo", path: ["Health & Beauty", "Hair", "Shampoo"] },
];

const product = (gtin: string, price: string, over: Partial<QogitaProduct> = {}): QogitaProduct => ({
  availability: "in_stock", gtin, name: `Product ${gtin}`, brand: "Biodance", category: "Sheet Mask",
  productUrl: `https://www.qogita.com/products/${gtin.padStart(32, "a")}/p/`, price: { amount: price, currency: "EUR" },
  unit: 10, inventory: 500, estimatedDeliveryTime: 1, ...over,
});

function fakeClient(pages: QogitaProduct[][]) {
  const asked: { categoryNames?: string[]; brandNames?: string[] }[] = [];
  const client = {
    categories: async () => CATS,
    async *products(q: { categoryNames?: string[]; brandNames?: string[] }) {
      asked.push(q);
      for (const results of pages) yield { count: pages.flat().length, results };
    },
  } as unknown as QogitaClient;
  return { client, asked };
}

describe("Qogita pull", () => {
  let fake: FakeDb;
  beforeEach(() => {
    fake = new FakeDb();
    __setDbForTests(fake as never);
    fake.tables.profiles = [{ id: "p1", name: "Test order", is_default: true, config: {} }];
  });

  it("expands a parent category into its leaves and keeps a leaf as itself", () => {
    expect(leavesUnder({ name: "Skin Care", path: ["Health & Beauty", "Face", "Skin Care"] }, CATS)).toEqual(["Face Cream", "Sheet Mask"]);
    expect(leavesUnder({ name: "Shampoo", path: ["Health & Beauty", "Hair", "Shampoo"] }, CATS)).toEqual(["Shampoo"]);
  });

  it("drops products outside the price range or slower than the delivery limit, keeps unknown delivery, dedupes", async () => {
    const { client, asked } = fakeClient([[product("1", "4.00"), product("2", "9.00"), product("3", "20.00")], [product("2", "9.00"), product("4", "8.00", { estimatedDeliveryTime: 3 }), product("5", "7.00", { estimatedDeliveryTime: null })]]);
    const r = await pullProducts(client, { ...EMPTY_QOGITA_FILTERS, category: { name: "Skin Care", path: ["Health & Beauty", "Face", "Skin Care"] }, minPrice: 5, maxPrice: 15, maxDeliveryWeeks: 2 });
    expect(r.products.map((p) => p.gtin)).toEqual(["2", "5"]);
    expect(r).toMatchObject({ fetched: 5, outsidePrice: 2, tooSlow: 1, unknownDelivery: 1, truncated: false, currency: "EUR" });
    expect(asked[0].categoryNames).toEqual(["Face Cream", "Sheet Mask"]);
  });

  it("stops at the row limit and says so", async () => {
    const { client } = fakeClient([[product("1", "5"), product("2", "5"), product("3", "5")]]);
    const r = await pullProducts(client, { ...EMPTY_QOGITA_FILTERS, brands: ["Biodance"] }, { maxRows: 2 });
    expect(r.products).toHaveLength(2);
    expect(r.truncated).toBe(true);
  });

  it("opens a run exactly as an upload would, with supplier Qogita, the response currency and the product link", async () => {
    const { client } = fakeClient([[product("8809937361657", "8.53"), product("3337875597197", "12.00")]]);
    const r = await runQogitaPull({ name: "Korean masks", filters: { ...EMPTY_QOGITA_FILTERS, brands: ["Biodance"] }, client });
    expect(r.runId).toBeTruthy();
    expect(r.stats).toMatchObject({ fetched: 2, kept: 2, screened: 2, currency: "EUR" });
    const run = fake.tables.runs.find((x) => x.id === r.runId)!;
    expect(run.name).toMatch(/^Qogita · Korean masks · /);
    expect(fake.tables.suppliers).toEqual([expect.objectContaining({ name: "Qogita", currency: "EUR", vat_basis: "ex_vat" })]);
    const offer = fake.tables.offers.find((o) => o.unit_cost === 8.53)!;
    expect(offer).toMatchObject({ currency: "EUR", unit_cost_gbp: 7.3358, moq: 10, stock: 500, external_ref: expect.stringContaining("/products/") });
    expect(fake.tables.results.filter((x) => x.run_id === r.runId)).toHaveLength(2);
    const preset = fake.tables.qogita_presets[0];
    expect(preset).toMatchObject({ name: "Korean masks", filters: expect.objectContaining({ brands: ["Biodance"] }), last_prices: { "8809937361657": 8.53, "3337875597197": 12 } });
    expect(fake.tables.qogita_pulls[0]).toMatchObject({ preset_id: preset.id, run_id: r.runId, kind: "manual" });
  });

  it("screens only new EANs and moved prices when asked", async () => {
    const first = fakeClient([[product("8809937361657", "8.53"), product("3337875597197", "12.00")]]);
    await runQogitaPull({ name: "Masks", filters: { ...EMPTY_QOGITA_FILTERS, brands: ["Biodance"] }, client: first.client });
    const second = fakeClient([[product("8809937361657", "8.53"), product("3337875597197", "11.50"), product("5000157024671", "3.00")]]);
    const r = await runQogitaPull({ name: "Masks", filters: { ...EMPTY_QOGITA_FILTERS, brands: ["Biodance"] }, client: second.client, onlyChanged: true, kind: "nightly" });
    expect(r.stats).toMatchObject({ kept: 3, screened: 2, new: 1, moved: 1, unchanged: 1 });
    const eans = fake.tables.results.filter((x) => x.run_id === r.runId).map((x) => fake.tables.products.find((p) => p.id === x.product_id)!.ean).sort();
    expect(eans).toEqual(["3337875597197", "5000157024671"]);
  });

  it("still opens the run before the Qogita migration, and says presets need it", async () => {
    fake.missingColumns = { ...fake.missingColumns };
    const { client } = fakeClient([[product("8809937361657", "8.53")]]);
    const orig = fake.from.bind(fake);
    fake.from = ((t: string) => {
      if (t === "qogita_presets" || t === "qogita_pulls") return { upsert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: 'relation "qogita_presets" does not exist' } }) }) }) } as never;
      return orig(t);
    }) as typeof fake.from;
    const r = await runQogitaPull({ name: "Masks", filters: { ...EMPTY_QOGITA_FILTERS, brands: ["Biodance"] }, client });
    expect(r.runId).toBeTruthy();
    expect(r.presetId).toBeNull();
    expect(r.note).toMatch(/20260927000000_qogita/);
  });

  it("refuses a pull with neither category nor brand", async () => {
    const { client } = fakeClient([]);
    await expect(runQogitaPull({ name: "All", filters: EMPTY_QOGITA_FILTERS, client })).rejects.toThrow(/category or at least one brand/);
  });

  it("pulls only the leaves you tick, and stops at Max products", async () => {
    const { client, asked } = fakeClient([[product("1", "5"), product("2", "5"), product("3", "5")]]);
    const skin = { name: "Skin Care", path: ["Health & Beauty", "Face", "Skin Care"] };
    const r = await pullProducts(client, { ...EMPTY_QOGITA_FILTERS, category: skin, leaves: ["Sheet Mask"], maxProducts: 2 });
    expect(asked[0].categoryNames).toEqual(["Sheet Mask"]);
    expect(r.products).toHaveLength(2);
    expect(r.truncated).toBe(true);
  });

  it("reuses results screened in the last N days instead of screening them again", async () => {
    const first = fakeClient([[product("8809937361657", "8.53"), product("3337875597197", "12.00")]]);
    const one = await runQogitaPull({ name: "Masks", filters: { ...EMPTY_QOGITA_FILTERS, brands: ["Biodance"], skipScreenedDays: 0 }, client: first.client });
    // Pretend the first run screened one of them.
    const done = fake.tables.results.find((x) => x.run_id === one.runId && fake.tables.products.find((p) => p.id === x.product_id)!.ean === "8809937361657")!;
    Object.assign(done, { status: "done", updated_at: new Date().toISOString(), inputs: { v: 1, stage: "account", match: { asin: "B0MASK0001", asinCount: 1, looked: true }, market: null, hazmat: [], restriction: { status: "open", message: "" }, amazonFees: null, notes: [] } });
    const second = fakeClient([[product("8809937361657", "8.10"), product("3337875597197", "12.00")]]);
    const two = await runQogitaPull({ name: "Masks 2", filters: { ...EMPTY_QOGITA_FILTERS, brands: ["Biodance"] }, client: second.client });
    expect(two.stats.reused).toBe(1);
    const rows = fake.tables.results.filter((x) => x.run_id === two.runId);
    const reused = rows.find((x) => fake.tables.products.find((p) => p.id === x.product_id)!.ean === "8809937361657")!;
    expect(reused.status).toBe("done");               // re-gated at once from the stored data
    expect(reused.inputs).toMatchObject({ match: { asin: "B0MASK0001" } });
    expect(rows.find((x) => x !== reused)!.status).toBe("pending"); // the other goes through the pipeline
  });

  it("estimates a pull from the first page: products, reuse, minutes and tokens", async () => {
    const { client } = fakeClient([[product("1", "5"), product("2", "5"), product("3", "50"), product("4", "5", { availability: "out_of_stock" })], [product("5", "5")]]);
    const e = await estimatePull({ ...EMPTY_QOGITA_FILTERS, brands: ["Biodance"], maxPrice: 20, maxProducts: 500 }, client);
    // Qogita counts 5; half the first page is in stock and in range.
    expect(e).toMatchObject({ matching: 5, products: 3, reused: 0 });
    expect(e.amazonMinutes).toBeGreaterThanOrEqual(1);
    expect(e.keepaTokens).toBeGreaterThan(0);
    const capped = await estimatePull({ ...EMPTY_QOGITA_FILTERS, brands: ["Biodance"], maxProducts: 2 }, client);
    expect(capped.products).toBe(2);
  });
});
