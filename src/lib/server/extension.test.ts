import { beforeEach, describe, expect, it } from "vitest";
import { __setDbForTests, ensureSeed } from "./db";
import { FakeDb } from "./fakeDb";
import { lookupAsins, saveCompetitorStock, saveScDg, starAsin, watchAsin } from "./extension";

describe("extension endpoints", () => {
  let fake: FakeDb;
  beforeEach(async () => {
    fake = new FakeDb();
    __setDbForTests(fake);
    await ensureSeed();
    for (const t of ["products", "results", "offers", "favourites"]) fake.tables[t] ??= [];
    fake.tables.products.push({ id: "p1", ean: "3057067080503", asin: "B07BJK336Z", brand: "OCB", amazon_dg: null, updated_at: "2026-09-25T10:00:00Z" });
    fake.tables.offers.push({ id: "o1", stock: 10, cost_known: true });
    fake.tables.results.push(
      { id: "r0", product_id: "p1", offer_id: "o1", run_id: "old", status: "done", verdict: "fail", score: null, band: null, updated_at: "2026-09-20T10:00:00Z", failed_gate: "fees", gate_outcomes: [], hurdle_price: 24.4, landed_cost: 8, inputs: {} },
      { id: "r1", product_id: "p1", offer_id: "o1", run_id: "new", status: "done", verdict: "warn", score: 68.7, band: "amber", updated_at: "2026-09-25T10:00:00Z", failed_gate: null,
        gate_outcomes: [{ gate: "gating", status: "warn", detail: "Brand approval needed" }], hurdle_price: null, landed_cost: 8, inputs: { restriction: { status: "approval_required" } } },
    );
  });

  it("badges: what's known, newest result, nothing screened", async () => {
    expect(await lookupAsins(["B07BJK336Z", "B0UNKNOWN1"])).toEqual({
      B07BJK336Z: { verdict: "warn", score: 69, band: "amber", pending: false, runId: "new" },
      B0UNKNOWN1: null,
    });
  });

  it("stars and watches by ASIN, suggesting the condition from what blocked it", async () => {
    expect(await starAsin("B0UNKNOWN1")).toBeNull();
    expect((await starAsin("B07BJK336Z"))!.ean).toBe("3057067080503");
    const w = await watchAsin("B07BJK336Z");
    expect(w!.condition).toEqual({ kind: "brandApproved" });
    expect(fake.tables.favourites).toHaveLength(1);
  });

  it("keeps competitors' stock and Seller Central's DG, and a hazmat verdict reaches compliance", async () => {
    await saveCompetitorStock("B07BJK336Z", [{ sellerId: "A1", name: "Shop", fba: true, stock: 42.4, limited: false }, { sellerId: "A2", name: null, fba: true, stock: null, limited: true }]);
    expect(fake.tables.products[0].competitor_stock).toMatchObject({ sellers: [{ sellerId: "A1", stock: 42 }, { sellerId: "A2", stock: null, limited: true }] });
    await saveScDg("B07BJK336Z", { status: "hazmat", detail: "Class 3 flammable" });
    expect(fake.tables.products[0].sc_dg).toMatchObject({ status: "hazmat", detail: "Class 3 flammable" });
    expect((fake.tables.products[0].amazon_dg as { declared: string[] }).declared).toEqual(["Seller Central: Class 3 flammable"]);
    await saveScDg("B07BJK336Z", { status: "weird" });
    expect((fake.tables.products[0].sc_dg as { status: string }).status).toBe("unknown");
  });
});
