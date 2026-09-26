import { describe, expect, it } from "vitest";
import { confidenceOf, judge, type JudgeInput } from "./product";
import { salesPerMonth } from "./screening/sales";

const now = Date.parse("2026-09-26T12:00:00Z");
const base: JudgeInput = {
  verdict: "pass", failedGate: null, warns: [], gating: "open", costKnown: true, checkedAt: "2026-09-25T12:00:00Z",
  market: { hasHistory: true, historyDays: 400, rankDrops30d: 40, keepaRankDrops30: 38, monthlySold: 50, offersNow: 5, offers90dAgo: 6 },
  keepaAt: "2026-09-24T12:00:00Z", fees: { amazon: 7.2, rateCard: 7.0 }, dormant: false,
};

describe("the product page's judgement", () => {
  it("buys a clean pass with a cost it can list, trusting good data", () => {
    expect(judge(base, now)).toMatchObject({ decision: "buy", confidence: "high", doubts: [] });
  });
  it("skips a fail, saying which gate", () => {
    expect(judge({ ...base, verdict: "fail", failedGate: { label: "Demand", detail: "12 sales in 30 days, under 30" } }, now))
      .toMatchObject({ decision: "skip", reasons: ["Fails Demand: 12 sales in 30 days, under 30"] });
  });
  it("waits on approval, a missing cost, a warning or thin data", () => {
    expect(judge({ ...base, gating: "approval_required" }, now).decision).toBe("wait");
    expect(judge({ ...base, gating: "approved" }, now).decision).toBe("buy");
    expect(judge({ ...base, costKnown: false }, now).reasons[0]).toMatch(/No supplier price/);
    expect(judge({ ...base, verdict: "warn", warns: [{ label: "Price drift", detail: "EROSION: Buy Box falling 26% a year" }] }, now).reasons).toEqual(["Price drift: EROSION: Buy Box falling 26% a year"]);
    expect(judge({ ...base, market: { ...base.market!, historyDays: 40 } }, now)).toMatchObject({ decision: "wait", confidence: "low" });
  });
  it("flags sales signals only when all are mid-range and differ over 2×", () => {
    expect(confidenceOf({ ...base, market: { ...base.market!, monthlySold: 200 } }, now)).toMatchObject({ confidence: "low", doubts: ["sales signals disagree (38 to 200 a month)"] });
    expect(confidenceOf({ ...base, market: { ...base.market!, monthlySold: 100 } }, now)).toMatchObject({ confidence: "medium", doubts: ["sales signals differ (38 to 100 a month)"] });
    expect(confidenceOf({ ...base, market: { ...base.market!, monthlySold: 70 } }, now)).toMatchObject({ confidence: "high", doubts: [] });
    // Outside the mid-range (a bought-in-past-month of 2,000, or a handful of sales): no flag.
    expect(confidenceOf({ ...base, market: { ...base.market!, monthlySold: 2000 } }, now).doubts).toEqual([]);
    expect(confidenceOf({ ...base, market: { ...base.market!, rankDrops30d: 2, keepaRankDrops30: 2, monthlySold: 9 } }, now).doubts).toEqual([]);
  });
  it("a fast seller (90-day average rank under 5,000): rank drops undercount, bought-in-past-month is used", () => {
    // B01GZ8CBQ6, Emtrix: rank ~1,114, 59 rank drops, 2,000+ bought in the past month.
    const emtrix = { ...base, market: { ...base.market!, avgRank90d: 1114, rankDrops30d: 59, keepaRankDrops30: 59, monthlySold: 2000, offersNow: 7, offers90dAgo: 6 } };
    expect(confidenceOf(emtrix, now)).toEqual({ confidence: "high", doubts: [], notes: ["1,114 average rank (90 days): rank drops undercount at this velocity, so Amazon's bought-in-past-month (2000+) is used"] });
    // Even mid-range counts aren't compared at that velocity.
    expect(confidenceOf({ ...base, market: { ...base.market!, avgRank90d: 3000, monthlySold: 200 } }, now).doubts).toEqual([]);
    expect(salesPerMonth(emtrix.market)).toMatchObject({ value: 2000, note: expect.stringContaining("rank drops undercount") });
    // A slower seller keeps the highest of the three.
    expect(salesPerMonth({ ...emtrix.market, avgRank90d: 9000, monthlySold: 30 }).value).toBe(59);
  });
  it("lowers confidence for stale data, and says why", () => {
    expect(confidenceOf({ ...base, keepaAt: "2026-09-10T12:00:00Z" }, now)).toMatchObject({ confidence: "medium", doubts: ["Keepa data is 16 days old"] });
    expect(confidenceOf({ ...base, fees: { amazon: 9, rateCard: 7 } }, now).doubts).toEqual(["Amazon's fee estimate and the rate card differ by 29%"]);
    expect(confidenceOf({ ...base, market: { ...base.market!, offersNow: 12, offers90dAgo: 4 } }, now).doubts).toEqual(["seller count moved from 4 to 12 in 90 days"]);
    expect(confidenceOf({ ...base, market: { hasHistory: false } }, now).confidence).toBe("low");
  });
});
