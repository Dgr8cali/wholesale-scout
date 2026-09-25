import { beforeEach, describe, expect, it } from "vitest";
import { __setDbForTests, ensureSeed } from "./db";
import { FakeDb } from "./fakeDb";
import { planCandidates } from "./plan";

describe("planner candidates", () => {
  let fake: FakeDb;
  beforeEach(async () => {
    fake = new FakeDb();
    __setDbForTests(fake);
    await ensureSeed();
    for (const t of ["brand_products", "products", "offers", "suppliers"]) fake.tables[t] ??= [];
    const bp = (id: string, verdict: string, over: Record<string, unknown> = {}) => fake.tables.brand_products.push({
      product_id: id, brand_key: "brite", brand: "Brite", ean: `50${id}`, asin: `B0${id}`, title: `Item ${id}`, verdict, priced: true,
      sell_price: 25, proceeds: 16, share_month: 10, warn_gates: [], restriction: "open", qogita: null, ...over,
    });
    bp("p1", "pass");
    bp("p2", "warn", { warn_gates: ["gating"], restriction: "approval_required" });
    bp("p3", "warn", { warn_gates: ["competition"] });
    bp("p4", "pass", { qogita: { fid: "f", qid: "q-1", seller: "91R39E", unit: 6, inventory: 60, priceGbp: 5, movGbp: 430 } });
    fake.tables.suppliers.push(
      { id: "hen", name: "Henbrandt", source_type: "upload", vat_rate: 20, mov: 150 },
      { id: "cheap", name: "Cheapo", source_type: "upload", vat_rate: 20, mov: null },
      { id: "man", name: "Manual", source_type: "manual", vat_rate: 20, mov: null },
    );
    for (const id of ["p1", "p2", "p3", "p4"]) fake.tables.products.push({ id, ean: `50${id}`, asin: `B0${id}` });
    fake.tables.offers.push(
      { id: "o1", product_id: "p1", supplier_id: "hen", unit_cost_gbp: 5, cost_known: true, moq: 6, stock: null, fx_rate: 1 },
      { id: "o2", product_id: "p1", supplier_id: "cheap", unit_cost_gbp: 12, cost_known: true, moq: null, stock: 3, fx_rate: 1 }, // fails the floors
      { id: "o3", product_id: "p1", supplier_id: "man", unit_cost_gbp: 4, cost_known: true, moq: null, stock: null, fx_rate: 1 },   // a check: not a supplier
      { id: "o4", product_id: "p2", supplier_id: "hen", unit_cost_gbp: 5, cost_known: true, moq: null, stock: null, fx_rate: 1 },
      { id: "o5", product_id: "p3", supplier_id: "hen", unit_cost_gbp: 5, cost_known: true, moq: null, stock: null, fx_rate: 1 },
    );
  });

  it("prices each supplier's offer, holds it to the floors, and flags approval-only warns", async () => {
    const r = await planCandidates();
    expect(r.limits).toMatchObject({ budget: expect.any(Number), lineCap: expect.any(Number), maxMonths: expect.any(Number) });
    const keys = r.candidates.map((c) => c.key).sort();
    expect(keys).toEqual(["p1|hen", "p2|hen", "p4|qogita:91R39E"]); // no Manual, no Cheapo (floors), no plain warn
    const p1 = r.candidates.find((c) => c.key === "p1|hen")!;
    expect(p1).toMatchObject({ supplierName: "Henbrandt", movGbp: 150, moq: 6, unitCostGbp: 5, approvalOnly: false });
    expect(p1.profitUnit).toBeCloseTo(16 - p1.landedGbp, 2);
    expect(r.candidates.find((c) => c.key === "p2|hen")!.approvalOnly).toBe(true);
    // The Qogita seller's offer: its own order and MOV, its case size, and cart details.
    expect(r.candidates.find((c) => c.key === "p4|qogita:91R39E")).toMatchObject({ supplierName: "Qogita · 91R39E", movGbp: 430, step: 6, moq: 6, maxUnits: 60, qogita: { qid: "q-1", unit: 6 } });
    // With warns: the competition warn joins.
    expect((await planCandidates({ warns: true })).candidates.map((c) => c.key)).toContain("p3|hen");
  });
});
