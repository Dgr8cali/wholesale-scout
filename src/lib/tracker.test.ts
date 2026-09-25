import { describe, expect, it } from "vitest";
import { predictionFor } from "./tracker";

const result = {
  id: "r1", run_id: "run1", verdict: "pass", score: 72, sell_price: 23.95, landed_cost: 8, profit: 7.38,
  fees: { total: 8.57, outputVat: null }, inputs: { market: { hasHistory: true, rankDrops30d: 60, keepaRankDrops30: 58, monthlySold: null, fbaOffers: 5, currentBuyBox: 23.95, rankNow: 5000, offersNow: 6 } },
};
const src = { result, runName: "ASIN check · B07BJK336Z", profile: "First order", decision: "buy", confidence: "high", keepaAt: "2026-09-25T10:00:00Z" };

describe("the prediction frozen with a purchase", () => {
  it("moves the engine's profit to your landed cost and sizes the months from your share", () => {
    const p = predictionFor(src, 7.5, 30, new Date("2026-09-26T09:00:00Z"));
    expect(p).toMatchObject({
      capturedAt: "2026-09-26T09:00:00.000Z", resultId: "r1", runId: "run1", decision: "buy", confidence: "high", profile: "First order",
      sellPrice: 23.95, feesPerUnit: 8.57, profitPerUnit: 7.88, roi: 105.07, margin: 32.9, salesPerMonth: 60, sharePerMonth: 10, fbaSellers: 5, monthsToSell: 3,
    });
    expect(p.profitPerMonth).toBe(78.8);
  });
  it("works it out from price and fees when the screening had no cost", () => {
    const p = predictionFor({ ...src, result: { ...result, landed_cost: null, profit: null } }, 9, 10);
    expect(p.profitPerUnit).toBe(6.38); // 23.95 − 8.57 − 9
  });
  it("keeps what it can when there's no screening", () => {
    const p = predictionFor({ ...src, result: null }, 9, 10);
    expect(p).toMatchObject({ resultId: null, sellPrice: null, profitPerUnit: null, sharePerMonth: null, monthsToSell: null });
  });
});
