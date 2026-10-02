import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { asinFromName, date, dateFromFileName, dateRange, detectType, mapHeader, num, parseCsv, parseReport, unwrap } from "./parse";

/** The three real exports (docs/samples/ads): the parser is pinned to Amazon's actual formats. */
const sample = (f: string) => readFileSync(join(process.cwd(), "docs/samples/ads", f), "utf8");
const SEARCH = sample("pill_bpx_serch_trem.csv");
const CAMPAIGN = sample("pillboc_campaign.csv");
const GRID = sample("Campaign_Oct_2_2026.csv");

describe("Ads report values", () => {
  it("reads Amazon's wrapped IDs, money, percentages and date ranges", () => {
    expect(unwrap('="97105648594138"')).toBe("97105648594138");
    expect([num("£72.62"), num("1,234.50"), num("4.0000%"), num("<5%"), num(""), num("0.00000")]).toEqual([72.62, 1234.5, 0.04, 0.05, null, 0]);
    expect(dateRange("Aug 25, 2026 - Sep 12, 2026")).toEqual({ from: "2026-08-25", to: "2026-09-12" });
    expect(dateRange("Aug 21, 2026 - Aug 21, 2026")).toEqual({ from: "2026-08-21", to: "2026-08-21" });
    expect([date("10/08/2026"), date("2026-09-01"), date("Sept 3, 2026"), date("3 Sep 2026"), date("20260903")]).toEqual(["2026-08-10", "2026-09-01", "2026-09-03", "2026-09-03", "2026-09-03"]);
    expect(dateFromFileName("Campaign_Oct_2_2026.csv")).toBe("2026-10-02");
    expect(parseCsv('a,"b,c","d ""e"""\r\n1,2,3\n')).toEqual([["a", "b,c", 'd "e"'], ["1", "2", "3"]]);
  });

  it("finds columns by name in any order, and a report type by its fields", () => {
    const cols = mapHeader(["Clicks", "Total cost", "Customer Search Term", "Campaign Name", "Date"]);
    expect(cols).toMatchObject({ clicks: 0, cost: 1, searchTerm: 2, campaignName: 3, date: 4 });
    expect(detectType(cols)).toBe("search_term");
    expect(detectType(mapHeader(["Date", "Campaign name", "Clicks", "Spend"]))).toBe("campaign_daily");
    expect(detectType(mapHeader(["Date range", "Campaign name", "Placement", "Clicks", "Total cost"]))).toBe("placement");
    expect(detectType(mapHeader(["Foo", "Bar"]))).toBeNull();
  });

  it("names the ASIN in a campaign name when there's exactly one", () => {
    expect(asinFromName("AD_READY: B0H9ZKYYHZ")).toBe("B0H9ZKYYHZ");
    expect(asinFromName("Pill Box AD_READY: B0H9ZKYYHZ")).toBe("B0H9ZKYYHZ");
    expect(asinFromName("PILL EXACT HERO")).toBeNull();
  });
});

describe("the three sample exports", () => {
  it("search term report: 106 rows, ranges as dates, IDs unwrapped, terms lower case", () => {
    const r = parseReport(SEARCH, "pill_bpx_serch_trem.csv");
    expect(r).toMatchObject({ type: "search_term", dateFrom: "2026-08-11", dateTo: "2026-09-13" });
    expect(r.rows).toHaveLength(106);
    expect(r.rows[0]).toMatchObject({
      campaignId: "73527101425940", campaignName: "PILL EXACT HERO", adGroupId: "100760527399887", searchTerm: "pill organiser",
      dateFrom: "2026-08-25", dateTo: "2026-09-12", impressions: 100, clicks: 4, cost: 1.42, orders: 0, sales: 0, units: 0, currency: "GBP",
    });
    const ad = r.rows.filter((x) => x.campaignName === "AD_READY: B0H9ZKYYHZ");
    const sum = (k: "clicks" | "cost" | "orders" | "sales") => Math.round(ad.reduce((a, x) => a + x[k], 0) * 100) / 100;
    expect([sum("clicks"), sum("cost"), sum("orders"), sum("sales")]).toEqual([126, 72.62, 9, 89.9]);
  });

  it("campaign report: one row per campaign with its range", () => {
    const r = parseReport(CAMPAIGN, "pillboc_campaign.csv");
    expect(r.type).toBe("campaign");
    expect(r.rows.map((x) => [x.campaignId, x.campaignName, x.dateFrom, x.dateTo, x.clicks, x.cost, x.orders, x.sales, x.impressions])).toEqual([
      ["97105648594138", "AD_READY: B0H9ZKYYHZ", "2026-08-14", "2026-08-23", 126, 72.62, 9, 89.9, 22740],
      ["73527101425940", "PILL EXACT HERO", "2026-08-23", "2026-09-13", 45, 27.87, 3, 26.97, 5432],
      ["259121294523137", "Pill Box AD_READY: B0H9ZKYYHZ", "2026-08-11", "2026-08-15", 2, 0.7, 0, 0, 468],
      ["133423243093838", "PILL BROAD RESEARCH", "2026-08-23", "2026-09-13", 17, 4.89, 1, 8.99, 912],
      ["275256283859083", "PILL AUTO DISCOVERY", "2026-08-23", "2026-09-13", 5, 1.17, 0, 0, 2146],
    ]);
  });

  it("Campaign Manager export: settings and undated totals, console IDs, UK dates", () => {
    const r = parseReport(GRID, "Campaign_Oct_2_2026.csv");
    expect(r).toMatchObject({ type: "campaign_grid", dateFrom: null, dateTo: null });
    expect(r.rows).toHaveLength(7);
    expect(r.rows[0]).toMatchObject({
      campaignId: "A026878720WFGECOBS0EH", campaignName: "AD_READY: B0H9ZKYYHZ", state: "PAUSED", type: "SP", targeting: "MANUAL",
      campaignStart: "2026-08-10", budget: 10, clicks: 126, cost: 72.62, orders: 9, sales: 89.9, topOfSearchShare: "<5%", dateFrom: null,
    });
    // "Total cost" (the account's currency), not "(converted)", which is £0.00 for the 2024 campaigns.
    expect(r.rows.find((x) => x.campaignName.startsWith("Campaign - 18/04/2024"))).toMatchObject({ cost: 6.01, sales: 24.99, campaignEnd: "2024-04-19" });
    expect(r.warnings.join(" ")).toMatch(/no date range/);
  });

  it("refuses a file it can't read, saying why", () => {
    expect(() => parseReport("a,b\n1,2", "x.csv")).toThrow(/no "Campaign name" column/);
  });
});
