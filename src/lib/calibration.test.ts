import { describe, expect, it } from "vitest";
import { calibrate, type CalibrationItem } from "./calibration";

const item = (share: number, actualPerMonth: number, days = 45, factor = 1, price = 20, actualPrice = 20): CalibrationItem => ({
  units: 50,
  prediction: { sharePerMonth: share * factor, shareFactor: factor, sellPrice: price, feesPerUnit: 7, profitPerUnit: 5 } as CalibrationItem["prediction"],
  actuals: { unitsSold: 10, daysLive: days, unitsPerMonth: actualPerMonth, avgPrice: actualPrice, feesPerUnit: 7, profitPerUnit: 5 } as CalibrationItem["actuals"],
});

describe("calibration", () => {
  it("waits for enough live purchases", () => {
    const c = calibrate([item(10, 7), item(10, 7, 10)]);
    expect(c).toMatchObject({ eligible: 1, withActuals: 2, strength: "none", suggestedFactor: null });
    expect(c.notes.at(-1)).toMatch(/suggested from 5/);
  });
  it("suggests a your-share factor from the median, measured against the raw estimate", () => {
    const items = [item(10, 7), item(10, 6), item(8, 6), item(12, 8), item(10, 7.5)];
    const c = calibrate(items);
    expect(c).toMatchObject({ strength: "early", suggestedFactor: 0.7, share: { median: 0.7, n: 5 } });
    expect(c.notes[0]).toBe("You sell 30% fewer a month than the app's your-share estimate (median of 5).");
    // Made with 0.7 already applied: still 0.7 against the raw figure, not 1.
    expect(calibrate(items.map((i) => ({ ...i, prediction: { ...i.prediction, sharePerMonth: i.prediction.sharePerMonth! * 0.7, shareFactor: 0.7 } })), 0.7).suggestedFactor).toBe(0.7);
  });
  it("points out price and fee differences, and is solid from 10", () => {
    const items = Array.from({ length: 10 }, (_, k) => item(10, 10 + (k % 2), 40, 1, 20, 18.8));
    const c = calibrate(items);
    expect(c.strength).toBe("solid");
    expect(c.notes.some((n) => /6% below the predicted price/.test(n))).toBe(true);
  });
});
