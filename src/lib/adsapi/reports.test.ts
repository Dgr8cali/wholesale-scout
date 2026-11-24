import { describe, expect, it } from "vitest";
import { preferApi, summariseSources } from "../ads/source";
import { backoffS, nextDailyAt, parseAdvertised, parseCampaigns, parseSearchTerms, parseTargeting, REPORTS, reportBody, ukDate, ukMinutes, windowFor } from "./reports";

describe("report requests", () => {
  it("asks for Sponsored Products, read-only report files, gzip JSON, with the right grouping and time unit", () => {
    const b = reportBody("search_terms", "2026-11-17", "2026-11-23");
    expect(b).toMatchObject({ startDate: "2026-11-17", endDate: "2026-11-23", configuration: { adProduct: "SPONSORED_PRODUCTS", reportTypeId: "spSearchTerm", groupBy: ["searchTerm"], timeUnit: "DAILY", format: "GZIP_JSON" } });
    expect(reportBody("campaigns", "a", "b").configuration).toMatchObject({ reportTypeId: "spCampaigns", groupBy: ["campaign"], timeUnit: "DAILY" });
    expect(reportBody("targeting", "a", "b").configuration).toMatchObject({ reportTypeId: "spTargeting", groupBy: ["targeting"], timeUnit: "SUMMARY" });
    expect(reportBody("advertised_products", "a", "b").configuration).toMatchObject({ reportTypeId: "spAdvertisedProduct", groupBy: ["advertiser"], timeUnit: "SUMMARY" });
  });
  it("every type carries the performance columns, and its core fallback is a subset without the optional ones", () => {
    for (const d of Object.values(REPORTS)) {
      for (const c of ["impressions", "clicks", "cost", "purchases7d", "sales7d"]) { expect(d.columns).toContain(c); expect(d.core).toContain(c); }
      expect(d.core.every((c) => d.columns.includes(c))).toBe(true);
      expect(d.core).not.toContain("unitsSoldClicks7d");
    }
    expect(reportBody("campaigns", "a", "b", true).configuration.columns).not.toContain("campaignBudgetAmount");
    expect(REPORTS.targeting.columns).toContain("keywordBid");
  });
  it("never asks for a write: only report creation columns, no entity fields to change", () => {
    expect(JSON.stringify(Object.values(REPORTS))).not.toMatch(/budgetAmount":|update|delete/i);
  });
});

describe("windows and times", () => {
  const now = new Date("2026-11-24T10:00:00Z"); // 24 Nov, GMT
  it("ends yesterday: 30 days for a backfill, 7 for the daily pull, 30 for targeting always", () => {
    expect(windowFor("campaigns", "backfill", now)).toEqual({ from: "2026-10-25", to: "2026-11-23" });
    expect(windowFor("campaigns", "daily", now)).toEqual({ from: "2026-11-17", to: "2026-11-23" });
    expect(windowFor("search_terms", "manual", now)).toEqual({ from: "2026-11-17", to: "2026-11-23" });
    expect(windowFor("targeting", "daily", now)).toEqual({ from: "2026-10-25", to: "2026-11-23" });
  });
  it("uses the UK day and clock, in summer time too", () => {
    const summer = new Date("2026-07-10T05:30:00Z"); // 06:30 BST
    expect(ukDate(summer)).toBe("2026-07-10");
    expect(ukMinutes(summer)).toBe(6 * 60 + 30);
    expect(ukMinutes(new Date("2026-11-24T06:30:00Z"))).toBe(6 * 60 + 30);
    expect(ukDate(new Date("2026-07-09T23:30:00Z"))).toBe("2026-07-10"); // 00:30 BST is already the 10th
  });
  it("schedules the next daily run at 06:30 UK: today if still ahead, else tomorrow", () => {
    expect(nextDailyAt(false, new Date("2026-11-24T05:00:00Z"))).toBe("2026-11-24T06:30:00.000Z");
    expect(nextDailyAt(true, new Date("2026-11-24T05:00:00Z"))).toBe("2026-11-25T06:30:00.000Z");
    expect(nextDailyAt(false, new Date("2026-11-24T08:00:00Z"))).toBe("2026-11-25T06:30:00.000Z");
    expect(nextDailyAt(false, new Date("2026-07-10T01:00:00Z"))).toBe("2026-07-10T05:30:00.000Z"); // BST: 06:30 is 05:30 UTC
  });
  it("backs off from 30 s to 5 minutes, and never below Amazon's Retry-After", () => {
    expect([0, 1, 2, 4, 6, 20].map((n) => backoffS(n))).toEqual([30, 30, 60, 120, 300, 300]);
    expect(backoffS(0, 90)).toBe(90);
    expect(backoffS(6, 10)).toBe(300);
  });
});

describe("parsing: the shapes the file imports store", () => {
  it("campaigns: 7-day orders and sales, status lower-cased, junk rows dropped", () => {
    const rows = parseCampaigns([
      { date: "2026-11-20", campaignId: 9, campaignName: "AD_READY: B0AAA", campaignStatus: "ENABLED", campaignBudgetAmount: 10, campaignBudgetCurrencyCode: "GBP", impressions: 100, clicks: 5, cost: 4.2, purchases7d: 2, sales7d: 25.98, unitsSoldClicks7d: 3 },
      { campaignId: 1 }, { date: "2026-11-20" },
    ]);
    expect(rows).toEqual([{ date: "2026-11-20", campaignId: "9", campaignName: "AD_READY: B0AAA", state: "enabled", budget: 10, currency: "GBP", impressions: 100, clicks: 5, cost: 4.2, orders: 2, sales: 25.98, units: 3 }]);
    expect(parseCampaigns({})).toEqual([]);
  });
  it("search terms: lower-cased term, Title-case match type, the keyword that matched", () => {
    const [r] = parseSearchTerms([{ date: "2026-11-20", campaignId: 9, adGroupId: 4, adGroupName: "G", keywordId: 77, keyword: "bin bags", matchType: "BROAD", searchTerm: "Black Bin Bags", impressions: 10, clicks: 1, cost: 0.5, purchases7d: 0, sales7d: 0 }]);
    expect(r).toMatchObject({ term: "black bin bags", matchType: "Broad", keywordId: "77", keywordText: "bin bags", adGroupId: "4", units: null });
  });
  it("targeting: keywords and product targets apart, with current bids and bulk-style states", () => {
    const { keywords, targets } = parseTargeting([
      { campaignId: 9, adGroupId: 4, keywordId: 77, keyword: "bin bags", keywordBid: 0.45, keywordType: "BROAD", matchType: "BROAD", targeting: "bin bags", adKeywordStatus: "ENABLED", clicks: 3, cost: 1 },
      { campaignId: 9, adGroupId: 4, keywordId: 88, keywordBid: 0.3, keywordType: "TARGETING_EXPRESSION", targeting: 'asin="B0BBB"', adKeywordStatus: "PAUSED", clicks: 1, cost: 0.2 },
      { campaignId: 9, keywordId: 99, keyword: "x" }, // no ad group: unusable
    ]);
    expect(keywords).toHaveLength(1);
    expect(keywords[0]).toMatchObject({ id: "77", text: "bin bags", matchType: "Broad", bid: 0.45, state: "enabled" });
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({ id: "88", expression: 'asin="B0BBB"', bid: 0.3, state: "paused" });
  });
  it("advertised products: ASIN and SKU per campaign and ad group", () => {
    expect(parseAdvertised([{ campaignId: 9, adGroupId: 4, advertisedAsin: "B0AAA", advertisedSku: "SKU-1", clicks: 2, cost: 1, purchases7d: 1, sales7d: 9.99 }, { campaignId: 9 }]))
      .toEqual([expect.objectContaining({ campaignId: "9", adGroupId: "4", asin: "B0AAA", sku: "SKU-1", orders: 1, sales: 9.99 })]);
  });
});

describe("which source counts", () => {
  const row = (campaign: string, date: string, source: string) => ({ campaign, date, source, cost: source === "api" ? 2 : 1 });
  it("uses the API's row where both cover a campaign and day, and leaves the rest", () => {
    const rows = [row("c1", "d1", "import"), row("c1", "d1", "api"), row("c1", "d2", "import"), row("c2", "d1", "import")];
    expect(preferApi(rows).map((r) => `${r.campaign}${r.date}${r.source}`)).toEqual(["c1d1api", "c1d2import", "c2d1import"]);
    const none = [row("c1", "d1", "import")];
    expect(preferApi(none)).toBe(none);
  });
  it("summarises the sources for Settings", () => {
    expect(summariseSources([{ date: "2026-11-01", source: "import" }, { date: "2026-11-02", source: "import" }, { date: "2026-11-02", source: "api" }, { date: "2026-11-03", source: "api" }]))
      .toEqual({ api: { from: "2026-11-02", to: "2026-11-03", days: 2 }, import: { from: "2026-11-01", to: "2026-11-02", days: 2 }, overlapDays: 1 });
  });
});
