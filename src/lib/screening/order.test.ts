import { describe, expect, it } from "vitest";
import { monthsLabel, orderPlan, volumeMl } from "./order";

describe("order plan", () => {
  it("orders what the line cap buys, and months to sell at your share", () => {
    expect(orderPlan({ lineCapGbp: 250, landedGbp: 6.25, moq: 6, sharePerMonth: 5 })).toEqual({ qty: 40, capUnits: 40, moqOverCap: false, months: 8 });
  });
  it("raises the order to an MOQ over the cap, flagged", () => {
    expect(orderPlan({ lineCapGbp: 250, landedGbp: 6.25, moq: 48, sharePerMonth: 12 })).toEqual({ qty: 48, capUnits: 40, moqOverCap: true, months: 4 });
  });
  it("has no months without a share, and never sells at a share of 0", () => {
    expect(orderPlan({ lineCapGbp: 250, landedGbp: 10, moq: null, sharePerMonth: null })!.months).toBeNull();
    expect(orderPlan({ lineCapGbp: 250, landedGbp: 10, moq: null, sharePerMonth: 0 })!.months).toBe(Infinity);
    expect(orderPlan({ lineCapGbp: 250, landedGbp: null, moq: 6, sharePerMonth: 5 })).toBeNull();
  });
  it("labels months", () => {
    expect(monthsLabel(8)).toBe("8 months");
    expect(monthsLabel(2.125)).toBe("2.1 months");
    expect(monthsLabel(0.1)).toBe("under a week");
    expect(monthsLabel(Infinity)).toBe("never at your share");
  });
  it("reads the largest single-item volume", () => {
    expect(volumeMl("Bioderma Sensibio H2O 500ml")).toBe(500);
    expect(volumeMl("Fairy Original 2 x 1.5L")).toBe(1500);
    expect(volumeMl("CeraVe 236 ml, travel 50ml")).toBe(236);
    expect(volumeMl("Shampoo 40cl")).toBe(400);
    expect(volumeMl("Micellar water")).toBeNull();
  });
});
