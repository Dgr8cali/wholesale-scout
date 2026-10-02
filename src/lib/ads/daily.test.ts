import { describe, expect, it } from "vitest";
import { dailySignals, windowOf } from "./daily";
import { parseReport, placementName } from "./parse";

const row = (date: string, o: Partial<{ impressions: number; cost: number }> = {}) => ({ date, impressions: 100, clicks: 5, cost: 4, orders: 1, sales: 20, ...o });

describe("daily signals", () => {
  const rows = Array.from({ length: 14 }, (_, i) => row(`2026-09-${String(17 + i).padStart(2, "0")}`, { impressions: i < 7 ? 200 : 100, cost: i >= 10 ? 9.6 : 4 }));
  it("windows, days out of budget (95%) and the impressions trend", () => {
    const s = dailySignals(rows, 10, "2026-10-01")!;
    expect(s).toMatchObject({ last: "2026-09-30", fresh: true, budgetLimitedDays: 4 });
    expect(s.week).toMatchObject({ days: 7, from: "2026-09-24", to: "2026-09-30", impressions: 700 });
    expect(s.prevWeek.impressions).toBe(1400);
    expect(s.impressionsChange).toBeCloseTo(-0.5);
    expect(s.fortnight.days).toBe(14);
    expect(windowOf(rows, "2026-09-30", 3).cost).toBeCloseTo(28.8);
  });
  it("stale after 10 days; no trend without both weeks", () => {
    expect(dailySignals(rows, 10, "2026-10-15")!.fresh).toBe(false);
    expect(dailySignals(rows.slice(-7), 10, "2026-10-01")!.impressionsChange).toBeNull();
    expect(dailySignals([], 10, "2026-10-01")).toBeNull();
  });
});

describe("daily reports", () => {
  it("reads the daily Campaign report: one row per campaign per day", () => {
    const csv = [
      "Date,Campaign Name,Campaign ID,Status,Budget,Impressions,Clicks,Spend,7 Day Total Orders (#),7 Day Total Sales,7 Day Total Units (#)",
      "\"Sep 29, 2026\",AD_READY: B0H9ZKYYHZ,97105648594138,enabled,10,812,6,9.71,1,8.99,1",
      "\"Sep 30, 2026\",AD_READY: B0H9ZKYYHZ,97105648594138,enabled,10,640,4,4.10,0,0,0",
    ].join("\n");
    const r = parseReport(csv, "Sponsored_Products_Campaign_report.csv");
    expect(r.type).toBe("campaign_daily");
    expect(r.rows.map((x) => [x.dateFrom, x.dateTo, x.impressions, x.cost, x.orders, x.budget])).toEqual([["2026-09-29", "2026-09-29", 812, 9.71, 1, 10], ["2026-09-30", "2026-09-30", 640, 4.1, 0, 10]]);
  });
  it("reads the daily Placement report and names placements as the bulk file does", () => {
    const csv = [
      "Date,Campaign Name,Placement,Impressions,Clicks,Spend,7 Day Total Orders (#),7 Day Total Sales",
      "\"Sep 30, 2026\",AD_READY: B0H9ZKYYHZ,Top of Search on-Amazon,100,3,2.10,1,8.99",
      "\"Sep 30, 2026\",AD_READY: B0H9ZKYYHZ,Detail Page on-Amazon,300,2,1.10,0,0",
    ].join("\n");
    const r = parseReport(csv, "placement.csv");
    expect(r.type).toBe("placement");
    expect(r.rows.map((x) => [placementName(x.placement), x.dateFrom])).toEqual([["top", "2026-09-30"], ["product page", "2026-09-30"]]);
    expect(["Other on-Amazon", "Rest of search", "Amazon Business"].map(placementName)).toEqual(["rest of search", "rest of search", "Amazon Business"]);
  });
});
