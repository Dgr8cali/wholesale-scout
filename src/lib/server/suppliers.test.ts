import { beforeEach, describe, expect, it } from "vitest";
import { __setDbForTests, ensureSeed } from "./db";
import { FakeDb } from "./fakeDb";
import { supplierDetail, supplierLedger, updateSupplier } from "./suppliers";

describe("supplier ledger", () => {
  let fake: FakeDb;
  beforeEach(async () => {
    fake = new FakeDb();
    __setDbForTests(fake);
    await ensureSeed();
    for (const t of ["suppliers", "offers", "results", "brand_products", "runs"]) fake.tables[t] ??= [];
    fake.tables.suppliers.push({ id: "s1", name: "Henbrandt", source_type: "upload", vat_basis: "ex_vat", vat_rate: 20, currency: "GBP", mov: 150 });
    fake.tables.runs.push({ id: "run1", name: "Run 1", source: "h.xlsx", started_at: "2026-09-25T10:00:00Z", row_count: 3 });
    const product = (id: string, brand: string, verdict: string, maxLanded: number) =>
      fake.tables.brand_products.push({ product_id: id, brand, ean: `50${id}`, asin: `B0${id}`, title: `Item ${id}`, verdict, priced: true, max_landed: maxLanded, buy_box: 20 });
    product("p1", "Nuxe", "pass", 12);
    product("p2", "Nuxe", "warn", 9);
    product("p3", "Bioderma", "fail", 5);
    for (const [i, p] of ["p1", "p2", "p3"].entries()) {
      fake.tables.offers.push({ id: `o${i}`, product_id: p, supplier_id: "s1", unit_cost_gbp: 5, cost_known: true, seen_at: `2026-09-2${i}T00:00:00Z` });
      fake.tables.results.push({ id: `r${i}`, offer_id: `o${i}`, run_id: "run1" });
    }
  });

  it("counts runs, products, passes and brands per supplier", async () => {
    const [s] = (await supplierLedger()).filter((x) => x.name === "Henbrandt");
    expect(s.stats).toMatchObject({ runs: 1, products: 3, pass: 1, warn: 1, brands: [{ brand: "Nuxe", count: 2 }, { brand: "Bioderma", count: 1 }], lastSeen: "2026-09-22T00:00:00Z" });
  });

  it("lists its best products by room under the max landed cost", async () => {
    const d = (await supplierDetail("s1"))!;
    expect(d.best.map((b) => [b.productId, b.verdict])).toEqual([["p1", "pass"], ["p2", "warn"]]);
    expect(d.best[0].headroom).toBeCloseTo(12 - d.best[0].landed, 2);
    expect(d.runs.map((r) => r.id)).toEqual(["run1"]);
  });

  it("checks what's saved", async () => {
    await expect(updateSupplier("s1", { rating: 6 })).rejects.toThrow("rating must be a whole number between 1 and 5");
    await expect(updateSupplier("s1", { labelling: "US" })).rejects.toThrow("labelling must be UK, EU or mixed");
    await expect(updateSupplier("s1", { importer_of_record: "maybe" })).rejects.toThrow("importer of record must be yes, no or unknown");
    const s = await updateSupplier("s1", { website: "henbrandt.co.uk", mov: "200", importer_of_record: true, rating: 4, name: "ignored" });
    expect(s).toMatchObject({ website: "https://henbrandt.co.uk", mov: 200, importer_of_record: true, rating: 4, name: "Henbrandt" });
  });
});
