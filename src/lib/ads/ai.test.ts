import { describe, expect, it } from "vitest";
import explainFixture from "./__fixtures__/explain-input.json";
import targetsFixture from "./__fixtures__/targets-input.json";
import {
  CONTEXT_TOKEN_CAP, buildExplainContext, buildReviewContext, buildTargetsContext, checkReview, checkTargets, costOf, costTxt, estimateTokens, fitContext, uncitedNumbers,
  type ExplainInput, type TargetsInput,
} from "./ai";

const explain = buildExplainContext(explainFixture as unknown as ExplainInput);

describe("Explain this product: the context, from the pill box data", () => {
  it("the period's figures: spend, ACoS against break-even and target, TACoS, profit after ads", () => {
    expect(explain.figures).toMatchObject({ spend: 107.25, ad_sales: 125.86, orders: 13, clicks: 195, acos_pct: 85.2, target_acos_pct: 30, break_even_acos_pct: 48.7, tacos_pct: 44, profit_after_ads: -45.9, cpc: 0.55, conversion_pct: 6.7, cost_per_order: 8.25 });
    expect(explain.period).toEqual({ from: "2026-08-10", to: "2026-10-02" });
  });
  it("the drivers: wasting and converting terms, the placement split, proposals in flight", () => {
    expect(explain.wasting_terms[0]).toMatchObject({ term: "pill organiser", clicks: 23, spend: 12.76, orders: 0 });
    expect(explain.converting_terms[0].orders).toBeGreaterThanOrEqual(2);
    expect(explain.placements.map((p) => p.placement).sort()).toEqual(["Amazon Business", "product page", "rest of search", "top"]);
    // Amazon's placement rows add up to a little more than the campaigns' totals (£107.89 against £107.25).
    expect(Math.abs(explain.placements.reduce((a, p) => a + (p.share_of_spend_pct ?? 0), 0) - 100)).toBeLessThan(1);
    expect(explain.open_proposals).toHaveLength(7);
    expect(explain.open_proposals.every((p) => p.status === "exported, awaiting upload")).toBe(true);
    expect(explain.notes).toContain("No daily campaign data: days out of budget are unknown.");
    expect(explain.stock).toEqual({ units: 93, days_of_cover: "no sales in the last 14 days" });
  });
  it("stays far under the ~20k-token cap; fitContext trims the longest lists when it doesn't", () => {
    expect(estimateTokens(explain)).toBeLessThan(3000);
    const big = { a: Array.from({ length: 5000 }, (_, i) => ({ term: `term ${i}`, spend: i })), b: [1] };
    const fitted = fitContext(big, ["a", "b"], 2000);
    expect(estimateTokens(fitted)).toBeLessThanOrEqual(2000);
    expect(fitted.trimmed).toEqual(["a"]);
    expect(CONTEXT_TOKEN_CAP).toBe(20000);
  });
});

describe("Targets and the monthly review: contexts and checks", () => {
  it("targets: break-even, rank, cover, conversion; and the answer is checked", () => {
    const c = buildTargetsContext(targetsFixture as unknown as TargetsInput);
    expect(c.product).toMatchObject({ asin: "B0H9ZKYYHZ", break_even_acos_pct: 48.7, sales_rank_now: 139583, sales_rank_avg_90d: 78803 });
    expect(c.account_ads).toMatchObject({ cpc: 0.55, conversion_pct: 6.7 });
    const r = checkTargets({ launch_target_pct: 45.04, steady_target_pct: 52, justification: "x", confidence: "medium" }, 0.487);
    expect([r.launch_target_pct, r.steady_target_pct]).toEqual([45, 45]);
    expect(r.warnings![0]).toMatch(/above the launch target/);
    expect(checkTargets({ launch_target_pct: 60, steady_target_pct: 50, justification: "x", confidence: "low" }, 0.487).warnings).toEqual([expect.stringMatching(/above break-even \(48\.7%\)/)]);
    expect(checkTargets({ launch_target_pct: 140, steady_target_pct: -3, justification: "x", confidence: "low" }, null)).toMatchObject({ launch_target_pct: 99, steady_target_pct: 1 });
  });
  it("review: rules listed for mapping; recommendations ranked, unknown rules become manual", () => {
    const c = buildReviewContext({ month: "2026-09", products: [], batches: [] });
    expect(c.rules.map((r) => r.id)).toContain("ngram_negative");
    const p = buildReviewContext({ month: "2026-09", batches: [], products: [{
      asin: "B0H9ZKYYHZ", title: "Pill box", phase: "launch", targetAcos: 0.3, breakEvenAcos: 0.487,
      ads: { spend: 107.25, sales: 125.86, orders: 13, clicks: 195, from: "2026-08-10", to: "2026-10-02", coverage: "range" },
      amazonMonth: null, profitAfterAds: -45.9,
      proposals: { open: 0, approved: 0, exportedAwaitingUpload: 7, byRule: { Negative: 5, Harvest: 2 } },
      terms: [{ term: "pill organiser", clicks: 23, cost: 12.76, orders: 0, sales: 0 }, { term: "pill box", clicks: 40, cost: 20, orders: 4, sales: 36 }],
    }] }).products[0];
    expect(p).toMatchObject({ cpc: 0.55, cost_per_order: 8.25, proposals: { exported_awaiting_upload: 7, by_rule: { Negative: 5 } } });
    expect(p.top_wasting_terms).toEqual([{ term: "pill organiser", clicks: 23, spend: 12.76 }]);
    expect(p.top_converting_terms[0]).toMatchObject({ term: "pill box", orders: 4, acos_pct: 55.6 });
    const r = checkReview({ products: [], account_narrative: "", batches: [], recommendations: [
      { rank: 2, title: "b", detail: "", expected_profit_gbp_month: 5, maps_to: "bid_down" },
      { rank: 1, title: "a", detail: "", expected_profit_gbp_month: 9, maps_to: "set_bid_to_0.20" },
      { rank: 3, title: "c", detail: "", expected_profit_gbp_month: null, maps_to: "manual" },
    ] });
    expect(r.recommendations.map((x) => [x.rank, x.title, x.maps_to])).toEqual([[1, "a", "manual"], [2, "b", "bid_down"], [3, "c", "manual"]]);
  });
});

describe("guardrails and cost", () => {
  it("flags figures that aren't in the data", () => {
    expect(uncitedNumbers("Spend was £107.25 at 85.2% ACoS against a 48.7% break-even, losing £45.90; TACoS 44%.", explain)).toEqual([]);
    expect(uncitedNumbers("Two or three drivers in 2026: CTR was 123.45% and spend £999.", explain)).toEqual(["123.45%", "£999"]);
    expect(uncitedNumbers("From 10 Aug to 2 October (2026-08-10 to 2026-10-02), spend was £107.25.", explain)).toEqual([]);
  });
  it("cost per call in pounds", () => {
    const c = costOf({ input_tokens: 2000, output_tokens: 600 }, { inUsd: 3, outUsd: 15 }, 0.79);
    expect(c.usd).toBeCloseTo(0.015, 6);
    expect(c.gbp).toBeCloseTo(0.01185, 5);
    expect([costTxt(0.004), costTxt(0.0412)]).toEqual(["under £0.01", "£0.04"]);
  });
});
