/**
 * The Sponsored Products reports the app pulls (Amazon Ads Reporting API v3), the dates each covers,
 * and how their rows become the same shapes the bulk-export import stores. Read-only: these only ask
 * Amazon to build report files.
 *
 * Units match the file imports: spend and sales in the account's currency, orders = 7-day purchases,
 * sales = 7-day sales, units = 7-day units sold. Match types and states use the bulk file's wording
 * ("Broad", "enabled") so rules, proposals and exports read API rows like imported ones.
 */
import type { ReportRequest } from "./client";

export type ReportKind = "campaigns" | "search_terms" | "targeting" | "advertised_products";
export type Trigger = "backfill" | "daily" | "manual";
export const KINDS: ReportKind[] = ["campaigns", "search_terms", "targeting", "advertised_products"];

interface Def { label: string; reportTypeId: string; groupBy: string[]; timeUnit: "DAILY" | "SUMMARY"; columns: string[]; core: string[] }

const PERF = ["impressions", "clicks", "cost", "purchases7d", "sales7d"];
/**
 * `columns` is what we ask for; `core` is the fallback when Amazon rejects a column name (400): the
 * same report without the optional columns (units, status, budget). Names are from Amazon's v3
 * report-type docs; none has been checked against a live response yet.
 */
export const REPORTS: Record<ReportKind, Def> = {
  campaigns: {
    label: "Campaigns (daily)", reportTypeId: "spCampaigns", groupBy: ["campaign"], timeUnit: "DAILY",
    columns: ["date", "campaignId", "campaignName", "campaignStatus", "campaignBudgetAmount", "campaignBudgetCurrencyCode", ...PERF, "unitsSoldClicks7d"],
    core: ["date", "campaignId", "campaignName", ...PERF],
  },
  search_terms: {
    label: "Search terms (daily)", reportTypeId: "spSearchTerm", groupBy: ["searchTerm"], timeUnit: "DAILY",
    columns: ["date", "campaignId", "campaignName", "adGroupId", "adGroupName", "keywordId", "keyword", "matchType", "targeting", "searchTerm", ...PERF, "unitsSoldClicks7d"],
    core: ["date", "campaignId", "campaignName", "adGroupId", "adGroupName", "keywordId", "keyword", "matchType", "targeting", "searchTerm", ...PERF],
  },
  targeting: {
    label: "Targeting: keywords and product targets (summary)", reportTypeId: "spTargeting", groupBy: ["targeting"], timeUnit: "SUMMARY",
    columns: ["campaignId", "campaignName", "adGroupId", "adGroupName", "keywordId", "keyword", "keywordBid", "keywordType", "matchType", "targeting", "adKeywordStatus", ...PERF, "unitsSoldClicks7d"],
    core: ["campaignId", "campaignName", "adGroupId", "adGroupName", "keywordId", "keyword", "keywordBid", "keywordType", "matchType", "targeting", ...PERF],
  },
  advertised_products: {
    label: "Advertised products (summary)", reportTypeId: "spAdvertisedProduct", groupBy: ["advertiser"], timeUnit: "SUMMARY",
    columns: ["campaignId", "campaignName", "adGroupId", "adGroupName", "advertisedAsin", "advertisedSku", ...PERF, "unitsSoldClicks7d"],
    core: ["campaignId", "campaignName", "adGroupId", "adGroupName", "advertisedAsin", "advertisedSku", ...PERF],
  },
};

export function reportBody(kind: ReportKind, from: string, to: string, core = false): ReportRequest {
  const d = REPORTS[kind];
  return {
    name: `Wholesale Scout ${d.reportTypeId} ${from} to ${to}`, startDate: from, endDate: to,
    configuration: { adProduct: "SPONSORED_PRODUCTS", groupBy: d.groupBy, columns: core ? d.core : d.columns, reportTypeId: d.reportTypeId, timeUnit: d.timeUnit, format: "GZIP_JSON" },
  };
}

/* ===================== dates ===================== */

/** Today's date in the UK (the UK profile's day), YYYY-MM-DD. */
export const ukDate = (now: Date = new Date()): string => now.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
/** Minutes since UK midnight. */
export function ukMinutes(now: Date = new Date()): number {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  return Number(p.find((x) => x.type === "hour")!.value) % 24 * 60 + Number(p.find((x) => x.type === "minute")!.value);
}
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** The daily pull starts from 06:30 UK time. */
export const DAILY_AT_MINUTES = 6 * 60 + 30;

/**
 * The days a pull covers, ending yesterday (today's still filling). Backfill: the last 30 days. The
 * daily pull: the last 7 (attribution is revised after the fact, so recent days are fetched again),
 * except targeting, whose keyword performance is a range the rules read as a window like a bulk
 * export's: it stays 30 days so a daily refresh doesn't narrow it to a week.
 */
export function windowFor(kind: ReportKind, trigger: Trigger, now: Date = new Date()): { from: string; to: string } {
  const to = addDays(ukDate(now), -1);
  const days = trigger === "backfill" || kind === "targeting" ? 30 : 7;
  return { from: addDays(to, -(days - 1)), to };
}

/** When the next daily pull is due: today 06:30 UK if that's still ahead and none ran today, else tomorrow. As an ISO instant. */
export function nextDailyAt(ranToday: boolean, now: Date = new Date()): string {
  const day = ranToday || ukMinutes(now) >= DAILY_AT_MINUTES ? addDays(ukDate(now), 1) : ukDate(now);
  // 06:30 on that UK date: find the UTC instant (BST is UTC+1, GMT UTC+0).
  for (const offset of [0, 1]) {
    const t = new Date(`${day}T06:30:00Z`); t.setUTCHours(t.getUTCHours() - offset);
    if (ukDate(t) === day && ukMinutes(t) === DAILY_AT_MINUTES) return t.toISOString();
  }
  return new Date(`${day}T06:30:00Z`).toISOString();
}

/* ===================== polling ===================== */

const BACKOFF_S = [30, 30, 60, 60, 120, 180, 300];
/** Seconds to wait before checking again: 30 s at first, backing off to 5 minutes; Amazon's Retry-After if longer. */
export const backoffS = (attempts: number, retryAfterS?: number) => Math.max(BACKOFF_S[Math.min(attempts, BACKOFF_S.length - 1)], retryAfterS ?? 0);
/** A report Amazon hasn't finished in this long is given up on. */
export const GIVE_UP_MS = 2 * 60 * 60_000;

/* ===================== parsing ===================== */

type Raw = Record<string, unknown>;
const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? 0 : Number(v));
const numOrNull = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const str = (v: unknown) => (v == null || v === "" ? null : String(v));
const rows = (json: unknown): Raw[] => (Array.isArray(json) ? (json as Raw[]) : []);

export interface Perf { impressions: number | null; clicks: number; cost: number; orders: number; sales: number; units: number | null }
const perf = (r: Raw): Perf => ({ impressions: numOrNull(r.impressions), clicks: num(r.clicks), cost: num(r.cost), orders: num(r.purchases7d), sales: num(r.sales7d), units: numOrNull(r.unitsSoldClicks7d) });

/** "BROAD" → "Broad", as the bulk file says it. */
export const matchTypeName = (v: unknown): string | null => { const s = str(v); return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : null; };
/** "ENABLED" → "enabled". */
export const stateName = (v: unknown): string | null => str(v)?.toLowerCase() ?? null;

export interface CampaignDayRow extends Perf { date: string; campaignId: string; campaignName: string; state: string | null; budget: number | null; currency: string | null }
export function parseCampaigns(json: unknown): CampaignDayRow[] {
  return rows(json).filter((r) => str(r.date) && str(r.campaignId)).map((r) => ({
    date: String(r.date), campaignId: String(r.campaignId), campaignName: str(r.campaignName) ?? String(r.campaignId),
    state: stateName(r.campaignStatus), budget: numOrNull(r.campaignBudgetAmount), currency: str(r.campaignBudgetCurrencyCode), ...perf(r),
  }));
}

export interface SearchTermRow extends Perf { date: string; campaignId: string; campaignName: string; adGroupId: string; adGroupName: string | null; keywordId: string; keywordText: string | null; matchType: string | null; term: string }
export function parseSearchTerms(json: unknown): SearchTermRow[] {
  return rows(json).filter((r) => str(r.date) && str(r.campaignId) && str(r.searchTerm)).map((r) => ({
    date: String(r.date), campaignId: String(r.campaignId), campaignName: str(r.campaignName) ?? String(r.campaignId),
    adGroupId: str(r.adGroupId) ?? "", adGroupName: str(r.adGroupName), keywordId: str(r.keywordId) ?? "",
    keywordText: str(r.keyword) ?? str(r.targeting), matchType: matchTypeName(r.matchType), term: String(r.searchTerm).toLowerCase(), ...perf(r),
  }));
}

interface TargetBase extends Perf { campaignId: string; campaignName: string; adGroupId: string; id: string; bid: number | null; state: string | null }
export interface KeywordRow extends TargetBase { text: string; matchType: string }
export interface ProductTargetRow extends TargetBase { expression: string }
/** Keywords and product targets come in one report: a keywordType of TARGETING_EXPRESSION* is a product target. */
export function parseTargeting(json: unknown): { keywords: KeywordRow[]; targets: ProductTargetRow[] } {
  const keywords: KeywordRow[] = [], targets: ProductTargetRow[] = [];
  for (const r of rows(json)) {
    const id = str(r.keywordId), campaignId = str(r.campaignId), adGroupId = str(r.adGroupId);
    if (!id || !campaignId || !adGroupId) continue;
    const base = { campaignId, campaignName: str(r.campaignName) ?? campaignId, adGroupId, id, bid: numOrNull(r.keywordBid), state: stateName(r.adKeywordStatus), ...perf(r) };
    if (/^TARGETING_EXPRESSION/i.test(String(r.keywordType ?? ""))) targets.push({ ...base, expression: str(r.targeting) ?? str(r.keyword) ?? "" });
    else if (str(r.keyword)) keywords.push({ ...base, text: String(r.keyword), matchType: matchTypeName(r.matchType) ?? "" });
  }
  return { keywords, targets };
}

export interface AdvertisedRow extends Perf { campaignId: string; campaignName: string; adGroupId: string; asin: string; sku: string | null }
export function parseAdvertised(json: unknown): AdvertisedRow[] {
  return rows(json).filter((r) => str(r.campaignId) && str(r.adGroupId) && str(r.advertisedAsin)).map((r) => ({
    campaignId: String(r.campaignId), campaignName: str(r.campaignName) ?? String(r.campaignId), adGroupId: String(r.adGroupId),
    asin: String(r.advertisedAsin), sku: str(r.advertisedSku), ...perf(r),
  }));
}
