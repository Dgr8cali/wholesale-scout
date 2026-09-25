import { describe, expect, it } from "vitest";
import { computeActuals } from "./actuals";

const money = { feesPerUnit: (p: number) => Math.round((p * 0.15 + 3.2) * 100) / 100, outputVat: () => 0 };
const stock = { onHand: 12, inbound: 0 };

describe("actual results of purchases", () => {
  it("sells the earliest purchase first, at the pace since it went live", () => {
    const first = { id: "a", units: 10, landed_gbp: 8, ordered_on: "2026-08-01", status_dates: { live: "2026-08-10" } };
    const second = { id: "b", units: 20, landed_gbp: 7.5, ordered_on: "2026-08-20", status_dates: { live: "2026-09-01" } };
    const sales = [
      { day: "2026-08-05", units: 3, revenue: 60 }, // before the first went live: not this stock
      { day: "2026-08-12", units: 6, revenue: 120 },
      { day: "2026-08-25", units: 6, revenue: 120 }, // 4 finish the first, 2 go… nowhere (second not live yet)
      { day: "2026-09-05", units: 5, revenue: 110 },
    ];
    const r = computeActuals([second, first], sales, money, stock, "2026-09-10", "2026-09-10T02:05:00Z");
    expect(r.get("a")).toMatchObject({ unitsSold: 10, revenue: 200, avgPrice: 20, feesPerUnit: 6.2, profitPerUnit: 5.8, profitToDate: 58, sellOutDays: 0, since: "2026-08-12" });
    // Sold out on 25 Aug: 10 units over 16 days ≈ 19/month.
    expect(r.get("a")!.unitsPerMonth).toBe(19);
    expect(r.get("b")).toMatchObject({ unitsSold: 5, avgPrice: 22, daysLive: 9, onHand: 12 });
    expect(r.get("b")!.unitsPerMonth).toBe(16.89);
    expect(r.get("b")!.sellOutDays).toBe(27); // 15 left at 16.89/month
  });
  it("has no pace in the first week and no price before a sale", () => {
    const p = { id: "c", units: 5, landed_gbp: 5, ordered_on: "2026-09-08", status_dates: {} };
    expect(computeActuals([p], [], money, stock, "2026-09-10", null).get("c")).toMatchObject({ unitsSold: 0, avgPrice: null, unitsPerMonth: null, profitPerUnit: null, sellOutDays: null });
  });
});
