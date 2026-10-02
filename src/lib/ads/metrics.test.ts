import { describe, expect, it } from "vitest";
import { breakEvenAcos, campaignTotals, marginBeforeAds, profitAfterAds, ratios, termStatus, type Range } from "./metrics";

const r = (from: string | null, to: string | null, clicks: number, cost: number, orders: number, sales: number, source: Range["source"] = "campaign"): Range =>
  ({ dateFrom: from, dateTo: to, impressions: clicks * 100, clicks, cost, orders, sales, units: null, source });

describe("Ads metrics", () => {
  it("ratios", () => {
    const x = ratios({ impressions: 22740, clicks: 126, cost: 72.62, orders: 9, sales: 89.9, units: 9 });
    expect(x.acos!).toBeCloseTo(0.8078, 4);
    expect(x.cpc!).toBeCloseTo(0.5763, 4);
    expect(x.conversion!).toBeCloseTo(9 / 126, 6);
    expect(x.ctr!).toBeCloseTo(126 / 22740, 6);
    expect(x.costPerOrder!).toBeCloseTo(8.0689, 4);
    expect(ratios({ impressions: null, clicks: 0, cost: 0, orders: 0, sales: 0, units: null })).toMatchObject({ acos: null, cpc: null, ctr: null });
  });

  it("a campaign's totals never count a day twice, and the grid only stands in when nothing's dated", () => {
    // The same range imported twice, and a narrower overlapping one: taken once.
    const t = campaignTotals({ daily: [], grid: null, terms: null, ranges: [r("2026-08-14", "2026-08-23", 126, 72.62, 9, 89.9), r("2026-08-14", "2026-08-23", 126, 72.62, 9, 89.9), r("2026-08-20", "2026-08-21", 5, 3, 0, 0)] });
    expect(t).toMatchObject({ source: "campaign", from: "2026-08-14", to: "2026-08-23", totals: { clicks: 126, cost: 72.62 } });
    // Separate periods add up.
    expect(campaignTotals({ daily: [], grid: null, terms: null, ranges: [r("2026-08-01", "2026-08-10", 10, 5, 1, 10), r("2026-08-11", "2026-08-20", 20, 10, 2, 20)] })!.totals.clicks).toBe(30);
    expect(campaignTotals({ daily: [], ranges: [], terms: null, grid: r(null, "2026-10-02", 126, 72.62, 9, 89.9, "grid") })).toMatchObject({ source: "grid", to: "2026-10-02" });
    expect(campaignTotals({ daily: [], ranges: [], grid: null, terms: { impressions: 10, clicks: 2, cost: 1, orders: 0, sales: 0, units: 0 } })!.source).toBe("search_term");
    expect(campaignTotals({ daily: [], ranges: [], grid: null, terms: null })).toBeNull();
  });

  it("break-even ACoS is margin before ads over price; profit after ads takes fees, landed and spend", () => {
    const e = { price: 9.99, fees: 3.2, landed: 2.5 };
    expect(marginBeforeAds(e)!).toBeCloseTo(4.29, 6);
    expect(breakEvenAcos(e)!).toBeCloseTo(4.29 / 9.99, 6);
    expect(profitAfterAds({ impressions: 0, clicks: 195, cost: 107.25, orders: 13, sales: 125.86, units: 13 }, e)!).toBeCloseTo(125.86 - 5.7 * 13 - 107.25, 6);
    expect(breakEvenAcos({ price: 9.99, fees: 3.2, landed: null })).toBeNull();
  });

  it("chips: converting, over target, watch, waste (15 clicks or half the price, no order)", () => {
    expect(termStatus({ clicks: 10, cost: 2, orders: 1, sales: 9.99 }, 0.3, 9.99).status).toBe("converting");
    expect(termStatus({ clicks: 10, cost: 5, orders: 1, sales: 9.99 }, 0.3, 9.99).status).toBe("over_target");
    expect(termStatus({ clicks: 4, cost: 1.42, orders: 0, sales: 0 }, 0.3, 9.99).status).toBe("watch");
    expect(termStatus({ clicks: 23, cost: 12.76, orders: 0, sales: 0 }, 0.3, 9.99)).toMatchObject({ status: "waste", why: "23 clicks and no order (15+)" });
    expect(termStatus({ clicks: 9, cost: 5.2, orders: 0, sales: 0 }, 0.3, 9.99).status).toBe("waste");
    expect(termStatus({ clicks: 9, cost: 5.2, orders: 0, sales: 0 }, 0.3, null).status).toBe("watch");
  });
});

describe("sums keep unknowns unknown", () => {
  it("units and impressions stay null unless a part reports them", async () => {
    const { add, ZERO } = await import("./metrics");
    const noUnits = { impressions: null, clicks: 1, cost: 1, orders: 1, sales: 9, units: null };
    expect(add(ZERO, noUnits)).toMatchObject({ units: null, impressions: null, clicks: 1 });
    expect(add(add(ZERO, noUnits), { ...noUnits, units: 2, impressions: 50 })).toMatchObject({ units: 2, impressions: 50 });
  });
});
