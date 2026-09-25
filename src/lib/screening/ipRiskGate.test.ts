import { describe, expect, it } from "vitest";
import { UK_RATE_CARD_2026_07 } from "../fees/rateCard";
import type { IpRiskMatch } from "../ipRisk";
import { withDefaults, type ProfileConfig } from "./config";
import { runGates, type MarketData, type ScreenContext } from "./gates";
import { DEFAULT_RULES } from "./rules";
import { winScore } from "./score";

const market: MarketData = {
  hasHistory: true, historyDays: 400, rankNow: 3000, rankDrops30d: 400, monthlySold: null, avgRank90d: 3500, rankTrendPct12m: -10,
  currentBuyBox: 24.99, medianBuyBox12m: 24.5, bbSlopePctYr: 2, bbVolatilityPct: 5, offersNow: 4, offers90dAgo: 4, fbaOffers: 4,
  amazonLastSeenDays: null, topSellerBbSharePct: 40, reviewJumpPct: null, youngerThanParent: null,
};
const ctx = (ipRisk: IpRiskMatch | null): ScreenContext => ({
  now: new Date("2026-09-25T12:00:00Z"), card: UK_RATE_CARD_2026_07, rules: DEFAULT_RULES, text: "Walker Tape double sided 25mm", amazonCategory: "DIY & Tools",
  offer: { unitCostGbp: 5, moq: 12, goodsVatRatePct: 20, supplierMovGbp: null },
  match: { asin: "B000TEST01", asinCount: 1, looked: true },
  product: { brand: "Nike", referralCategory: "Tools and Home Improvement", dimsCm: { l: 15, w: 12, h: 8 }, weightG: 200, variationCount: null, hazmat: [], ipRisk },
  market, restriction: { status: "open", message: "" }, amazonFees: null,
});
const high: IpRiskMatch = { brand: "Nike", level: "high", note: "Files counterfeit complaints", source: "seed, unverified" };
const medium: IpRiskMatch = { ...high, level: "medium" };
const profile = (ipMode: "warn" | "fail" | "off") => withDefaults({ gates: { compliance: { mode: "fail", rules: { ipRisk: ipMode } } } } as unknown as Partial<ProfileConfig>);
const comp = (c: ScreenContext, p: ProfileConfig) => runGates(c, p).outcomes.find((o) => o.gate === "compliance")!;

describe("IP-risk brand rule", () => {
  it("warns by default, and says so in the why line", () => {
    const p = withDefaults(null);
    expect(p.gates.compliance.rules.ipRisk).toBe("warn");
    const c = ctx(high);
    const run = runGates(c, p);
    expect(comp(c, p)).toMatchObject({ status: "warn", detail: "IP risk (high): Files counterfeit complaints", tags: ["IP_RISK"] });
    expect(winScore(c, run, p, { deliveryDays: null, supplierRating: null }).why).toContain("IP risk (high): Files counterfeit complaints");
  });

  it("fails a high-risk brand when you set the rule to fail; medium still only warns", () => {
    expect(comp(ctx(high), profile("fail")).status).toBe("fail");
    expect(runGates(ctx(high), profile("fail")).failedGate).toBe("compliance");
    expect(comp(ctx(medium), profile("fail")).status).toBe("warn");
  });

  it("off, or not on the list: nothing", () => {
    expect(comp(ctx(high), profile("off")).status).toBe("pass");
    expect(comp(ctx(null), profile("fail")).status).toBe("pass");
  });
});
