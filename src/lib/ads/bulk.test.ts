import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { BULK_CAMPAIGNS_SHEET, BULK_COLUMNS, bulkRangeFromFileName, parseBulk, writeBulk, writeBulkFile } from "./bulk";

const file = readFileSync(join(__dirname, "../../../docs/samples/ads/bulk-template.xlsx"));
const bulk = parseBulk(new Uint8Array(file), { fileName: "bulk-template.xlsx", dateFrom: "2026-08-10", dateTo: "2026-10-02" });
const AD_READY = "97105648594138";

describe("parseBulk (the pill box account's bulk export, 10 Aug – 2 Oct)", () => {
  it("reads every entity", () => {
    expect(bulk.campaigns).toHaveLength(7);
    expect(bulk.placements).toHaveLength(28);
    expect(bulk.adGroups).toHaveLength(7);
    expect(bulk.productAds).toHaveLength(9);
    expect(bulk.keywords).toHaveLength(107);
    expect(bulk.negatives).toHaveLength(69);
    expect(bulk.targets).toHaveLength(12);
    expect(bulk.searchTerms).toHaveLength(115);
    expect([bulk.dateFrom, bulk.dateTo]).toEqual(["2026-08-10", "2026-10-02"]);
  });

  it("maps the 5 pill box campaigns to B0H9ZKYYHZ from their product ads, and leaves the 2-ASIN ones", () => {
    const mapped = [...bulk.campaignAsins.entries()].filter(([, a]) => a === "B0H9ZKYYHZ");
    expect(mapped).toHaveLength(5);
    expect(bulk.campaignAsins.size).toBe(5);
    expect(bulk.warnings.filter((w) => /advertises 2 ASINs/.test(w))).toHaveLength(2);
  });

  it("has a keyword ID, match type and bid on every keyword", () => {
    expect(bulk.keywords.every((k) => /^\d+$/.test(k.keywordId) && k.matchType && k.bid != null)).toBe(true);
    expect(bulk.keywords.filter((k) => k.matchType === "Broad")).toHaveLength(89);
    expect(bulk.keywords.filter((k) => k.matchType === "Exact")).toHaveLength(18);
    expect(bulk.negatives.every((n) => n.keywordId && n.matchType === "Negative phrase" && n.level === "ad group")).toBe(true);
  });

  it("reads campaign settings and totals with IDs exact", () => {
    const c = bulk.campaigns.find((x) => x.campaignId === AD_READY)!;
    expect(c).toMatchObject({ name: "AD_READY: B0H9ZKYYHZ", budget: 10, clicks: 126, orders: 9, units: 10, impressions: 22740, startDate: "2026-08-10" });
    expect(c.cost).toBeCloseTo(72.62, 2);
    expect(c.sales).toBeCloseTo(89.9, 2);
    expect(c.biddingStrategy).toMatch(/up and down/);
  });

  it("reads AD_READY's placements with their performance", () => {
    const p = (name: string) => bulk.placements.find((x) => x.campaignId === AD_READY && x.placement === name)!;
    expect(p("rest of search")).toMatchObject({ clicks: 59, orders: 5 });
    expect(p("rest of search").cost).toBeCloseTo(32.13, 2);
    expect(p("product page")).toMatchObject({ clicks: 51, orders: 4 });
    expect(p("product page").cost).toBeCloseTo(29.36, 2);
    expect(p("top").percentage).toBe(0);
  });

  it("links each search term to the keyword or targeting that matched it", () => {
    expect(bulk.searchTerms.filter((t) => t.keywordId)).toHaveLength(111);
    expect(bulk.searchTerms.filter((t) => t.targetId)).toHaveLength(4);
    const ids = new Set(bulk.keywords.map((k) => k.keywordId));
    expect(bulk.searchTerms.filter((t) => t.keywordId).every((t) => ids.has(t.keywordId!))).toBe(true);
    expect(bulk.searchTerms.reduce((a, t) => a + t.clicks, 0)).toBe(195);
    expect(bulk.searchTerms.reduce((a, t) => a + t.cost, 0)).toBeCloseTo(107.25, 2);
    const po = bulk.searchTerms.filter((t) => t.campaignId === AD_READY && t.term === "pill organiser");
    expect(po.find((t) => t.keywordText === "pill organiser" && t.matchType === "Broad")).toMatchObject({ clicks: 11 });
  });

  it("asks for the range when neither given nor in the file name", () => {
    const b = parseBulk(new Uint8Array(file), { fileName: "bulk-template.xlsx" });
    expect(b.dateFrom).toBeNull();
    expect(b.warnings.some((w) => /which dates/.test(w))).toBe(true);
    expect(bulkRangeFromFileName("bulk-a1b2-20260810-20261002-1759400000.xlsx")).toEqual({ from: "2026-08-10", to: "2026-10-02" });
  });
});

describe("writeBulk (Phase 2's upload)", () => {
  const changes = [
    { kind: "keyword_bid", campaignId: AD_READY, adGroupId: "1", keywordId: "2", bid: 0.45 },
    { kind: "keyword_state", campaignId: AD_READY, adGroupId: "1", keywordId: "3", state: "paused" },
    { kind: "campaign_budget", campaignId: AD_READY, dailyBudget: 12 },
    { kind: "placement", campaignId: AD_READY, biddingStrategy: "Dynamic bids - up and down", placement: "top", percentage: 25 },
    { kind: "create_keyword", campaignId: AD_READY, adGroupId: "1", text: "weekly pill box", matchType: "Exact", bid: 0.5 },
    { kind: "create_negative", campaignId: AD_READY, adGroupId: "1", text: "pill organiser", matchType: "Negative exact" },
  ] as const;

  it("writes the template's sheets and exact column order, informational columns blank", () => {
    const wb = XLSX.read(writeBulkFile([...changes]), { type: "array" });
    expect(wb.SheetNames).toEqual(["Portfolios", BULK_CAMPAIGNS_SHEET, "Sheet3"]);
    const template = XLSX.read(file, { type: "buffer" });
    const header = (w: XLSX.WorkBook, n: string) => XLSX.utils.sheet_to_json<string[]>(w.Sheets[n], { header: 1 })[0];
    expect(header(wb, BULK_CAMPAIGNS_SHEET)).toEqual(header(template, BULK_CAMPAIGNS_SHEET));
    expect(header(wb, BULK_CAMPAIGNS_SHEET)).toEqual([...BULK_COLUMNS]);
    expect(header(wb, "Portfolios")).toEqual(header(template, "Portfolios"));
    expect(header(wb, "Sheet3")).toEqual(header(template, "Sheet3"));
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets[BULK_CAMPAIGNS_SHEET], { defval: "", raw: false });
    expect(rows.map((r) => `${r.Entity}/${r.Operation}`)).toEqual(["Keyword/Update", "Keyword/Update", "Campaign/Update", "Bidding adjustment/Update", "Keyword/Create", "Negative keyword/Create"]);
    for (const r of rows) for (const k of BULK_COLUMNS.filter((c) => /Informational only|^(Impressions|Clicks|Spend|Sales|Orders|Units|ACOS|CPC|ROAS)$/.test(c))) expect(r[k]).toBe("");
    expect(rows[0]).toMatchObject({ "Keyword ID": "2", Bid: "0.45", "Campaign ID": AD_READY });
    expect(rows[3]).toMatchObject({ Placement: "Placement top", Percentage: "25" });
  });

  it("reads back through the parser", () => {
    const b = parseBulk(new Uint8Array(writeBulkFile([...changes])), { dateFrom: "2026-10-02", dateTo: "2026-10-02" });
    expect(b.keywords.map((k) => k.text)).toContain("weekly pill box");
    expect(b.negatives[0]).toMatchObject({ text: "pill organiser", matchType: "Negative exact" });
    expect(writeBulk([]).SheetNames).toHaveLength(3);
  });
});
