import { describe, expect, it } from "vitest";
import { UK_RATE_CARD_2026_07 } from "../fees/rateCard";
import { withDefaults, type ProfileConfig } from "./config";
import { effectiveMoq, firstOrder, runGates, type ScreenContext } from "./gates";
import { DEFAULT_RULES } from "./rules";

const ctx = (offer: Partial<ScreenContext["offer"]>): ScreenContext => ({
  now: new Date("2026-09-25T12:00:00Z"), card: UK_RATE_CARD_2026_07, rules: DEFAULT_RULES, text: "Walker Tape 25mm", amazonCategory: "DIY & Tools",
  offer: { unitCostGbp: 5, moq: null, goodsVatRatePct: 20, supplierMovGbp: null, ...offer },
  match: { asin: "B000TEST01", asinCount: 1, looked: true },
  product: { referralCategory: "Tools and Home Improvement", dimsCm: { l: 15, w: 12, h: 8 }, weightG: 200, variationCount: null, hazmat: [] },
  market: null, restriction: { status: "open", message: "" }, amazonFees: null,
});
const p = withDefaults({ budget: 1000, gates: { budgetFit: { mode: "fail", maxLineSharePct: 10 } } } as unknown as Partial<ProfileConfig>);
const budget = (c: ScreenContext) => runGates(c, p).outcomes.find((o) => o.gate === "budgetFit")!;

describe("the budget gate uses the supplier's MOV when a line has no MOQ", () => {
  it("works out the units the MOV needs", () => {
    expect(effectiveMoq(ctx({ supplierMovGbp: 150 }))).toEqual({ units: 30, fromMov: true });
    expect(effectiveMoq(ctx({ moq: 6, supplierMovGbp: 150 }))).toEqual({ units: 6, fromMov: false }); // a line MOQ wins
    expect(effectiveMoq(ctx({}))).toEqual({ units: 1, fromMov: false });
    expect(effectiveMoq(ctx({ supplierMovGbp: 150, unitCostGbp: 0, costKnown: false }))).toEqual({ units: 1, fromMov: false });
  });
  it("fails a line whose MOV-sized order is over the line cap, and says why", () => {
    const b = budget(ctx({ supplierMovGbp: 150 }));
    expect(b.status).toBe("fail");
    expect(b.detail).toMatch(/^No line MOQ: the supplier's £150\.00 minimum order is 30 × £\d+\.\d\d = £\d+\.\d\d, over the £100\.00 line cap/);
    expect(budget(ctx({ supplierMovGbp: 50 }))).toMatchObject({ status: "pass", detail: expect.stringContaining("10 units to reach the supplier's £50.00 minimum order") });
    expect(budget(ctx({})).status).toBe("pass");
  });
  it("the first order starts at the MOV's units", () => {
    expect(firstOrder(ctx({ supplierMovGbp: 50 }), p, 100)?.qty).toBeGreaterThanOrEqual(10);
  });
});
