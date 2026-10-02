/**
 * Amazon Ads bulk files (Sponsored Products): read the bulk export, the primary import, and write
 * the bulk upload Phase 2's changes go back as. Pure (SheetJS works in the browser and on the server).
 *
 * The export's "Sponsored Products Campaigns" sheet has one row per entity: Campaign, Bidding
 * adjustment (a placement), Ad group, Product ad (SKU and ASIN: what a campaign advertises),
 * Keyword, Negative keyword, Product targeting (an auto campaign's targeting groups), each with its
 * IDs, settings and performance. "SP Search Term Report" ties each customer search term to the
 * keyword (or targeting) that matched it. The file carries no date range: the performance covers
 * whatever period the export was made for, so the range is given at import (or read from the file
 * name when it has one).
 */
import * as XLSX from "xlsx";
import { date as parseDate, num as parseNum } from "./parse";

export const BULK_CAMPAIGNS_SHEET = "Sponsored Products Campaigns";
export const BULK_TERMS_SHEET = "SP Search Term Report";
export const BULK_PORTFOLIOS_SHEET = "Portfolios";
export const BULK_VERSION_SHEET = "Sheet3";

/**
 * The bulk sheet's columns, in the exact order of Amazon's export (docs/samples/ads/bulk-template.xlsx):
 * the upload is written in this order so Amazon accepts it.
 */
export const BULK_COLUMNS = [
  "Product", "Entity", "Operation", "Campaign ID", "Ad group ID", "Portfolio ID", "Ad ID", "Keyword ID", "Product Targeting ID",
  "Campaign name", "Ad group name", "Campaign name (Informational only)", "Ad group name (Informational only)", "Portfolio name (Informational only)",
  "Start date", "End date", "Targeting type", "State", "Campaign state (Informational only)", "Ad Group State (Informational only)", "Daily budget",
  "SKU", "ASIN (Informational only)", "Eligibility status (Informational only)", "Reason for ineligibility (Informational only)",
  "Ad Group Default Bid", "Ad Group Default Bid (Informational only)", "Bid", "Keyword text", "Native language keyword", "Native language locale",
  "Match type", "Bidding strategy", "Placement", "Percentage", "Product targeting expression",
  "Resolved product targeting expression (Informational only)", "Audience ID", "Shopper Cohort Percentage", "Shopper Cohort Type",
  "Segment Name (Informational only)", "Sites", "Off-Amazon ad serving",
  "Impressions", "Clicks", "Click-through rate", "Spend", "Sales", "Orders", "Units", "Conversion rate", "ACOS", "CPC", "ROAS",
] as const;
export type BulkColumn = (typeof BULK_COLUMNS)[number];

export const PORTFOLIO_COLUMNS = ["Product", "Entity", "Operation", "Portfolio ID", "Portfolio name", "Budget amount", "Budget currency code", "Budget policy", "Budget start date", "Budget end date", "State (Informational only)", "In Budget (Informational only)"];

/* ===================== reading ===================== */

export interface Perf { impressions: number | null; clicks: number; cost: number; orders: number; sales: number; units: number | null }

export interface BulkCampaign extends Perf {
  campaignId: string; name: string; targeting: string | null; state: string | null; budget: number | null; biddingStrategy: string | null;
  startDate: string | null; endDate: string | null; portfolioId: string | null;
}
export interface BulkPlacement extends Perf { campaignId: string; placement: string; percentage: number | null; biddingStrategy: string | null }
export interface BulkAdGroup extends Perf { campaignId: string; adGroupId: string; name: string; defaultBid: number | null; state: string | null }
export interface BulkProductAd extends Perf { campaignId: string; adGroupId: string; adId: string; sku: string | null; asin: string | null; state: string | null; eligibility: string | null }
export interface BulkKeyword extends Perf { campaignId: string; adGroupId: string; keywordId: string; text: string; matchType: string; bid: number | null; state: string | null }
export interface BulkNegative { campaignId: string; adGroupId: string | null; keywordId: string; text: string; matchType: string; state: string | null; level: "ad group" | "campaign" }
export interface BulkTarget extends Perf { campaignId: string; adGroupId: string; targetId: string; expression: string; bid: number | null; state: string | null }
export interface BulkSearchTerm extends Perf {
  campaignId: string; adGroupId: string; campaignName: string | null; adGroupName: string | null;
  /** The keyword (or product targeting) that matched the search: its ID, text and match type. */
  keywordId: string | null; targetId: string | null; keywordText: string | null; matchType: string | null; term: string;
}

export interface ParsedBulk {
  type: "bulk";
  label: string;
  campaigns: BulkCampaign[]; placements: BulkPlacement[]; adGroups: BulkAdGroup[]; productAds: BulkProductAd[];
  keywords: BulkKeyword[]; negatives: BulkNegative[]; targets: BulkTarget[]; searchTerms: BulkSearchTerm[];
  /** The period the performance covers: given at import, or from the file name; null when unknown. */
  dateFrom: string | null; dateTo: string | null;
  /** Each campaign's ASIN when its product ads advertise exactly one. */
  campaignAsins: Map<string, string>;
  warnings: string[];
}

type Row = Record<string, string>;
const s = (r: Row, k: string) => { const v = (r[k] ?? "").toString().trim(); return v === "" ? null : v; };
const perf = (r: Row): Perf => ({
  impressions: parseNum(r.Impressions), clicks: parseNum(r.Clicks) ?? 0, cost: parseNum(r.Spend) ?? 0,
  orders: parseNum(r.Orders) ?? 0, sales: parseNum(r.Sales) ?? 0, units: parseNum(r.Units),
});
/** The export writes dates as yyyymmdd. */
const ymd = (v: string | null) => (v ? parseDate(v) : null);

/** "bulk-…-20260810-20261002-….xlsx" → that range; otherwise null (it's asked for at import). */
export function bulkRangeFromFileName(name: string): { from: string; to: string } | null {
  const m = name.match(/(20\d{6})\D+(20\d{6})/);
  if (!m) return null;
  const from = parseDate(m[1]), to = parseDate(m[2]);
  return from && to && from <= to ? { from, to } : null;
}

/** Is this workbook (or file name) a bulk export? */
export const isBulkWorkbook = (wb: XLSX.WorkBook) => wb.SheetNames.includes(BULK_CAMPAIGNS_SHEET);

export function parseBulk(data: ArrayBuffer | Uint8Array, opts: { fileName?: string; dateFrom?: string | null; dateTo?: string | null } = {}): ParsedBulk {
  const wb = XLSX.read(data, { type: "array" });
  if (!isBulkWorkbook(wb)) throw new Error(`${opts.fileName || "This file"}: no "${BULK_CAMPAIGNS_SHEET}" sheet, so not an Amazon Ads bulk export`);
  // As text, as shown in the file: IDs stay exact (they're stored as text), money as written.
  const sheet = (name: string): Row[] => (wb.Sheets[name] ? XLSX.utils.sheet_to_json<Row>(wb.Sheets[name], { defval: "", raw: false }) : []);
  const rows = sheet(BULK_CAMPAIGNS_SHEET).filter((r) => !s(r, "Product") || /sponsored products/i.test(r.Product));
  const of = (e: string) => rows.filter((r) => (r.Entity ?? "").trim().toLowerCase() === e);
  const warnings: string[] = [];

  const campaigns: BulkCampaign[] = of("campaign").map((r) => ({
    campaignId: s(r, "Campaign ID")!, name: s(r, "Campaign name") ?? s(r, "Campaign name (Informational only)") ?? "",
    targeting: s(r, "Targeting type"), state: s(r, "State"), budget: parseNum(r["Daily budget"]), biddingStrategy: s(r, "Bidding strategy"),
    startDate: ymd(s(r, "Start date")), endDate: ymd(s(r, "End date")), portfolioId: s(r, "Portfolio ID"), ...perf(r),
  }));
  const placements: BulkPlacement[] = of("bidding adjustment").map((r) => ({
    campaignId: s(r, "Campaign ID")!, placement: (s(r, "Placement") ?? "").replace(/^Placement\s+/i, ""), percentage: parseNum(r.Percentage),
    biddingStrategy: s(r, "Bidding strategy"), ...perf(r),
  }));
  const adGroups: BulkAdGroup[] = of("ad group").map((r) => ({
    campaignId: s(r, "Campaign ID")!, adGroupId: s(r, "Ad group ID")!, name: s(r, "Ad group name") ?? s(r, "Ad group name (Informational only)") ?? "",
    defaultBid: parseNum(r["Ad Group Default Bid"]) ?? parseNum(r["Ad Group Default Bid (Informational only)"]), state: s(r, "State"), ...perf(r),
  }));
  const productAds: BulkProductAd[] = of("product ad").map((r) => ({
    campaignId: s(r, "Campaign ID")!, adGroupId: s(r, "Ad group ID")!, adId: s(r, "Ad ID")!, sku: s(r, "SKU"),
    asin: s(r, "ASIN (Informational only)")?.toUpperCase() ?? null, state: s(r, "State"), eligibility: s(r, "Eligibility status (Informational only)"), ...perf(r),
  }));
  const keywords: BulkKeyword[] = of("keyword").map((r) => ({
    campaignId: s(r, "Campaign ID")!, adGroupId: s(r, "Ad group ID")!, keywordId: s(r, "Keyword ID")!, text: s(r, "Keyword text") ?? "",
    matchType: s(r, "Match type") ?? "", bid: parseNum(r.Bid), state: s(r, "State"), ...perf(r),
  }));
  const negatives: BulkNegative[] = [...of("negative keyword"), ...of("campaign negative keyword")].map((r) => ({
    campaignId: s(r, "Campaign ID")!, adGroupId: s(r, "Ad group ID"), keywordId: s(r, "Keyword ID")!, text: s(r, "Keyword text") ?? "",
    matchType: s(r, "Match type") ?? "", state: s(r, "State"), level: /campaign/i.test(r.Entity) || !s(r, "Ad group ID") ? "campaign" : "ad group",
  }));
  const targets: BulkTarget[] = of("product targeting").map((r) => ({
    campaignId: s(r, "Campaign ID")!, adGroupId: s(r, "Ad group ID")!, targetId: s(r, "Product Targeting ID")!,
    expression: s(r, "Product targeting expression") ?? s(r, "Resolved product targeting expression (Informational only)") ?? "", bid: parseNum(r.Bid), state: s(r, "State"), ...perf(r),
  }));
  const searchTerms: BulkSearchTerm[] = sheet(BULK_TERMS_SHEET).filter((r) => s(r, "Customer search term")).map((r) => ({
    campaignId: s(r, "Campaign ID")!, adGroupId: s(r, "Ad group ID") ?? "", campaignName: s(r, "Campaign name (Informational only)"), adGroupName: s(r, "Ad group name (Informational only)"),
    keywordId: s(r, "Keyword ID"), targetId: s(r, "Product Targeting ID"), keywordText: s(r, "Keyword text") ?? s(r, "Product targeting expression"),
    matchType: s(r, "Match type"), term: s(r, "Customer search term")!.toLowerCase(), ...perf(r),
  }));

  for (const [what, list, key] of [["keyword", keywords, "keywordId"], ["negative keyword", negatives, "keywordId"], ["campaign", campaigns, "campaignId"]] as const) {
    const missing = (list as unknown as Record<string, unknown>[]).filter((x) => !x[key]).length;
    if (missing) warnings.push(`${missing} ${what} row${missing === 1 ? "" : "s"} without an ID`);
  }
  // What each campaign advertises: one ASIN maps it; several leave it to you.
  const campaignAsins = new Map<string, string>();
  for (const c of campaigns) {
    const asins = [...new Set(productAds.filter((p) => p.campaignId === c.campaignId && p.asin).map((p) => p.asin!))];
    if (asins.length === 1) campaignAsins.set(c.campaignId, asins[0]);
    else if (asins.length > 1) warnings.push(`"${c.name}" advertises ${asins.length} ASINs (${asins.join(", ")}): set which one it counts towards`);
  }
  const range = opts.dateFrom && opts.dateTo ? { from: opts.dateFrom, to: opts.dateTo } : bulkRangeFromFileName(opts.fileName ?? "");
  if (!range) warnings.push("A bulk export doesn't say which dates its figures cover: give the range it was exported for");
  return {
    type: "bulk", label: "Bulk export", campaigns, placements, adGroups, productAds, keywords, negatives, targets, searchTerms,
    dateFrom: range?.from ?? null, dateTo: range?.to ?? null, campaignAsins, warnings,
  };
}

/* ===================== writing (Phase 2) ===================== */

/**
 * One change for Amazon, as a bulk upload row. Updates change bids, states, budgets and placement
 * percentages on existing entities (by ID); creates add keywords and negative keywords.
 */
export type BulkChange =
  | { kind: "keyword_bid"; campaignId: string; adGroupId: string; keywordId: string; bid: number }
  | { kind: "keyword_state"; campaignId: string; adGroupId: string; keywordId: string; state: "enabled" | "paused" | "archived" }
  | { kind: "ad_group_bid"; campaignId: string; adGroupId: string; defaultBid: number }
  | { kind: "campaign_budget"; campaignId: string; dailyBudget: number }
  | { kind: "campaign_state"; campaignId: string; state: "enabled" | "paused" | "archived" }
  | { kind: "placement"; campaignId: string; biddingStrategy: string; placement: string; percentage: number }
  | { kind: "create_keyword"; campaignId: string; adGroupId: string; text: string; matchType: "Exact" | "Phrase" | "Broad"; bid: number }
  | { kind: "create_negative"; campaignId: string; adGroupId: string | null; text: string; matchType: "Negative exact" | "Negative phrase" };

const money = (n: number) => n.toFixed(2);

/** A change as a row of BULK_COLUMNS: only the columns Amazon reads for it; informational columns blank. */
export function bulkRow(c: BulkChange): Partial<Record<BulkColumn, string>> {
  const base = { Product: "Sponsored Products", "Campaign ID": c.campaignId };
  switch (c.kind) {
    case "keyword_bid":
      return { ...base, Entity: "Keyword", Operation: "Update", "Ad group ID": c.adGroupId, "Keyword ID": c.keywordId, Bid: money(c.bid) };
    case "keyword_state":
      return { ...base, Entity: "Keyword", Operation: "Update", "Ad group ID": c.adGroupId, "Keyword ID": c.keywordId, State: c.state };
    case "ad_group_bid":
      return { ...base, Entity: "Ad group", Operation: "Update", "Ad group ID": c.adGroupId, "Ad Group Default Bid": money(c.defaultBid) };
    case "campaign_budget":
      return { ...base, Entity: "Campaign", Operation: "Update", "Daily budget": money(c.dailyBudget) };
    case "campaign_state":
      return { ...base, Entity: "Campaign", Operation: "Update", State: c.state };
    case "placement":
      return { ...base, Entity: "Bidding adjustment", Operation: "Update", "Bidding strategy": c.biddingStrategy, Placement: c.placement.startsWith("Placement") ? c.placement : `Placement ${c.placement}`, Percentage: String(Math.round(c.percentage)) };
    case "create_keyword":
      return { ...base, Entity: "Keyword", Operation: "Create", "Ad group ID": c.adGroupId, "Keyword text": c.text, "Match type": c.matchType, Bid: money(c.bid), State: "enabled" };
    case "create_negative":
      return c.adGroupId
        ? { ...base, Entity: "Negative keyword", Operation: "Create", "Ad group ID": c.adGroupId, "Keyword text": c.text, "Match type": c.matchType, State: "enabled" }
        : { ...base, Entity: "Campaign negative keyword", Operation: "Create", "Keyword text": c.text, "Match type": c.matchType, State: "enabled" };
  }
}

/**
 * The bulk upload: Portfolios (header only), "Sponsored Products Campaigns" in the export's exact
 * column order with one row per change, and the "Sheet3" version sheet, as in Amazon's template.
 */
export function writeBulk(changes: BulkChange[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([PORTFOLIO_COLUMNS]), BULK_PORTFOLIOS_SHEET);
  const rows = changes.map((c) => { const r = bulkRow(c); return BULK_COLUMNS.map((k) => r[k] ?? ""); });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[...BULK_COLUMNS], ...rows]), BULK_CAMPAIGNS_SHEET);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Version", "Version (1.0)"]]), BULK_VERSION_SHEET);
  return wb;
}

/** The upload as .xlsx bytes. */
export const writeBulkFile = (changes: BulkChange[]): Uint8Array => XLSX.write(writeBulk(changes), { type: "array", bookType: "xlsx" }) as Uint8Array;
