import { beforeEach, describe, expect, it, vi } from "vitest";
import { __setDbForTests } from "./db";
import { FakeDb } from "./fakeDb";
import { listPurchases, recordPurchase, updatePurchase } from "./purchases";

vi.mock("./productPage", () => ({
  productView: async (asin: string) => asin === "B0NOTKNOWN" ? null : ({
    asin, products: [{ id: "p1", ean: "5012345678900" }], keepa: { fetchedAt: "2026-09-25T10:00:00Z" },
    judgement: { decision: "buy", confidence: "high", reasons: [], doubts: [] },
    latest: {
      id: "r1", run_id: "run1", verdict: "pass", score: 70, sell_price: 20, landed_cost: 8, profit: 5, fees: { total: 7 },
      inputs: { market: { hasHistory: true, rankDrops30d: 40, fbaOffers: 3, currentBuyBox: 20, rankNow: 8000, offersNow: 3 } }, product: { id: "p1", ean: "5012345678900" },
      run: { name: "Run A", source: "a.xlsx", profile: { name: "First order" } },
    },
  }),
}));

describe("purchases", () => {
  let fake: FakeDb;
  beforeEach(() => { fake = new FakeDb(); __setDbForTests(fake); });

  it("records a purchase with its prediction, then moves it along with dates", async () => {
    const p = await recordPurchase({ asin: "b0test0001", units: 24, landedGbp: 7.5, supplierName: "Henbrandt", orderedOn: "2026-09-26", note: "test order" });
    expect(p).toMatchObject({ asin: "B0TEST0001", units: 24, landed_gbp: 7.5, status: "ordered", status_dates: { ordered: "2026-09-26" }, supplier_name: "Henbrandt" });
    expect(p.prediction).toMatchObject({ resultId: "r1", runName: "Run A", profitPerUnit: 5.5, sharePerMonth: 10, monthsToSell: 2.4, decision: "buy" });
    const moved = await updatePurchase(p.id, { status: "live", on: "2026-10-10" });
    expect(moved).toMatchObject({ status: "live", status_dates: { ordered: "2026-09-26", live: "2026-10-10" } });
    expect((await listPurchases("B0TEST0001")).map((x) => x.id)).toEqual([p.id]);
  });
  it("refuses what doesn't make sense", async () => {
    await expect(recordPurchase({ asin: "B0TEST0001", units: 0, landedGbp: 5 })).rejects.toThrow(/Units/);
    await expect(recordPurchase({ asin: "B0TEST0001", units: 5, landedGbp: -1 })).rejects.toThrow(/Landed/);
    await expect(recordPurchase({ asin: "B0NOTKNOWN", units: 5, landedGbp: 5 })).rejects.toThrow(/check it first/);
  });
});
