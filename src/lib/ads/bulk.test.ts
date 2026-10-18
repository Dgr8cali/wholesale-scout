import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { BULK_CAMPAIGNS_SHEET, BULK_COLUMNS, BULK_UPLOAD_SHEETS, bulkProblems, bulkRangeFromFileName, parseBulk, uploadPlacement, uploadStrategy, writeBulk, writeBulkFile, type BulkChange } from "./bulk";
import { buildLaunch } from "./launch";

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

  it("writes the template's campaigns sheet in its exact column order, informational columns blank", () => {
    const wb = XLSX.read(writeBulkFile([...changes]), { type: "array" });
    expect(wb.SheetNames).toEqual([BULK_CAMPAIGNS_SHEET]);
    const template = XLSX.read(file, { type: "buffer" });
    const header = (w: XLSX.WorkBook, n: string) => XLSX.utils.sheet_to_json<string[]>(w.Sheets[n], { header: 1 })[0];
    expect(header(wb, BULK_CAMPAIGNS_SHEET)).toEqual(header(template, BULK_CAMPAIGNS_SHEET));
    expect(header(wb, BULK_CAMPAIGNS_SHEET)).toEqual([...BULK_COLUMNS]);
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets[BULK_CAMPAIGNS_SHEET], { defval: "", raw: false });
    expect(rows.map((r) => `${r.Entity}/${r.Operation}`)).toEqual(["Keyword/Update", "Keyword/Update", "Campaign/Update", "Bidding adjustment/Update", "Keyword/Create", "Negative keyword/Create"]);
    for (const r of rows) for (const k of BULK_COLUMNS.filter((c) => /Informational only|^(Impressions|Clicks|Spend|Sales|Orders|Units|ACOS|CPC|ROAS)$/.test(c))) expect(r[k]).toBe("");
    expect(rows[0]).toMatchObject({ "Keyword ID": "2", Bid: "0.45", "Campaign ID": AD_READY });
    expect(rows[3]).toMatchObject({ Placement: "Placement Top", Percentage: "25" });
  });

  it("reads back through the parser", () => {
    const b = parseBulk(new Uint8Array(writeBulkFile([...changes])), { dateFrom: "2026-10-02", dateTo: "2026-10-02" });
    expect(b.keywords.map((k) => k.text)).toContain("weekly pill box");
    expect(b.negatives[0]).toMatchObject({ text: "pill organiser", matchType: "Negative exact" });
    expect(writeBulk([]).SheetNames).toEqual([BULK_CAMPAIGNS_SHEET]);
  });

  // Amazon rejects the whole file when any sheet doesn't start Product, Entity, Operation
  // (docs/samples/ads/bulk-error-report.xlsx: the export's "Sheet3" did that to the first launch upload).
  it("every exported workbook, proposals or launch, has only the upload sheets, each starting Product, Entity, Operation", () => {
    const launch = buildLaunch({
      asin: "B0HM8FBX3T", sku: "SKU-1", price: 9.99, competitorAsins: ["B0AAAAAAA1"], dailyBudget: 10, targetAcos: 0.3, steadyTargetAcos: null,
      startingBid: 0.4, startDate: "2026-10-19", headTerms: ["lens wipes", "glasses wipes"],
    }).changes;
    for (const sheet of [[...changes], launch, []]) {
      const wb = XLSX.read(writeBulkFile(sheet), { type: "array" });
      expect(wb.SheetNames).toEqual([...BULK_UPLOAD_SHEETS]);
      for (const n of wb.SheetNames) expect(XLSX.utils.sheet_to_json<string[]>(wb.Sheets[n], { header: 1 })[0].slice(0, 3)).toEqual(["Product", "Entity", "Operation"]);
    }
  });

  it("Amazon's error report for the first upload names Sheet3 as the only error", () => {
    const report = XLSX.read(readFileSync(join(__dirname, "../../../docs/samples/ads/bulk-error-report.xlsx")), { type: "buffer" });
    expect(report.SheetNames).toEqual(["Upload processing summary", BULK_CAMPAIGNS_SHEET, "Sheet3"]);
    const errors = XLSX.utils.sheet_to_json<Record<string, string>>(report.Sheets.Sheet3, { defval: "" });
    expect(errors).toEqual([expect.objectContaining({ "Original sheet": "Sheet3", "Error type": "Input error", "Error code": "Invalid headers" })]);
  });
});

describe("writeBulk: new campaigns and product targeting", () => {
  it("creates a campaign, ad group, product ad and keywords linked by temporary IDs (their names)", () => {
    const wb = writeBulk([
      { kind: "create_campaign", name: "B0H9ZKYYHZ Exact", dailyBudget: 5, biddingStrategy: "Dynamic bids - down only", startDate: "2026-10-03", adGroupName: "Exact", defaultBid: 0.5, sku: "7P-8CUC-BXQ5", keywords: [{ text: "pill box", matchType: "Exact", bid: 0.67 }] },
      { kind: "target_bid", campaignId: "275256283859083", adGroupId: "9", targetId: "8", bid: 0.2 },
    ]);
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets[BULK_CAMPAIGNS_SHEET], { defval: "", raw: false });
    expect(rows.map((r) => `${r.Entity}/${r.Operation}/${r["Campaign ID"]}/${r["Ad group ID"]}`)).toEqual([
      "Campaign/Create/B0H9ZKYYHZ Exact/", "Ad group/Create/B0H9ZKYYHZ Exact/Exact", "Product ad/Create/B0H9ZKYYHZ Exact/Exact", "Keyword/Create/B0H9ZKYYHZ Exact/Exact",
      "Product targeting/Update/275256283859083/9",
    ]);
    expect(rows[0]).toMatchObject({ "Start date": "20261003", "Targeting type": "Manual", "Daily budget": "5.00" });
    expect(rows[3]).toMatchObject({ "Keyword text": "pill box", "Match type": "Exact", Bid: "0.67" });
    expect(rows[4]).toMatchObject({ "Product Targeting ID": "8", Bid: "0.20" });
  });
});

// Amazon's second rejection: "campaign name has invalid characters" (an en dash), and the export's
// en-dash bidding strategy isn't a value the upload takes.
describe("the upload's exact values, ASCII only", () => {
  const camp = (over: Partial<Extract<BulkChange, { kind: "create_campaign" }>> = {}): BulkChange => ({
    kind: "create_campaign", name: "B0HM8FBX3T Auto - 2026-10-19", dailyBudget: 3.33, biddingStrategy: "Dynamic bids – down only", startDate: "2026-10-19",
    adGroupName: "Auto ad group", defaultBid: 0.4, sku: "SKU-1", keywords: [], targetingType: "Auto", placements: [{ placement: "top", percentage: 0 }], ...over,
  });

  it("maps the export's strategies and placements to the upload's", () => {
    expect(uploadStrategy("Dynamic bids – down only")).toBe("Dynamic bids - down only");
    expect(uploadStrategy("Dynamic bids — up and down")).toBe("Dynamic bids - up and down");
    expect(uploadStrategy("fixed bid")).toBe("Fixed bid");
    expect(["top", "Placement top", "rest of search", "product page", "Amazon Business"].map(uploadPlacement))
      .toEqual(["Placement Top", "Placement Top", "Placement Rest Of Search", "Placement Product Page", "Placement Amazon Business"]);
  });

  it("writes a campaign from imported (en-dash) values with plain hyphens", () => {
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(writeBulk([camp()]).Sheets[BULK_CAMPAIGNS_SHEET], { defval: "", raw: false });
    expect(rows.slice(0, 2).map((r) => [r.Entity, r["Bidding strategy"], r.Placement])).toEqual([["Campaign", "Dynamic bids - down only", ""], ["Bidding adjustment", "Dynamic bids - down only", "Placement Top"]]);
    const placement = { kind: "placement" as const, campaignId: "1", biddingStrategy: "Dynamic bids – up and down", placement: "rest of search", percentage: 10 };
    expect(bulkProblems([camp(), placement])).toEqual([]);
  });

  it("rejects a non-ASCII character in a name or fixed value before export, and says which", () => {
    const bad = camp({ name: "B0HM8FBX3T Auto – 2026-10-19" });
    expect(bulkProblems([bad])[0]).toBe('Campaign Campaign ID "B0HM8FBX3T Auto – 2026-10-19" has "–" (U+2013): Amazon accepts only plain ASCII there');
    expect(bulkProblems([bad]).some((p) => p.includes("Campaign name"))).toBe(true);
    expect(bulkProblems([camp({ adGroupName: "Café group" })]).some((p) => p.startsWith('Ad group Ad group name "Café group"'))).toBe(true);
    expect(() => writeBulk([bad])).toThrow(/would be rejected/);
    // Keyword text isn't a name: a keyword can be any word shoppers type.
    expect(bulkProblems([{ kind: "create_keyword", campaignId: "1", adGroupId: "g", text: "café pill box", matchType: "Exact", bid: 0.5 }])).toEqual([]);
  });

  it("a launch sheet has no problems", () => {
    const l = buildLaunch({ asin: "B0HM8FBX3T", sku: "SKU-1", price: 9.99, competitorAsins: ["B0AAAAAAA1"], dailyBudget: 10, targetAcos: 0.3, steadyTargetAcos: null, startingBid: 0.4, startDate: "2026-10-19", headTerms: ["lens wipes"] });
    expect(l.campaigns.map((c) => c.name)).toEqual(["B0HM8FBX3T Auto - 2026-10-19", "B0HM8FBX3T Broad - 2026-10-19", "B0HM8FBX3T Exact - 2026-10-19", "B0HM8FBX3T PT - 2026-10-19"]);
    expect(bulkProblems(l.changes)).toEqual([]);
  });
});
