/**
 * Amazon Ads reports (Sponsored Products) read into one shape, whatever the export. Pure: the
 * Imports page previews with it, the server stores with it, and the Ads API will feed the same
 * canonical fields later.
 *
 * - Columns are found by name (any order), through FIELD_ALIASES: a new export's column name is one
 *   line there.
 * - The report type is the first REPORT_TYPES entry whose required fields are all present: a new
 *   report type is one entry there.
 * - Values: the ="…" wrapper Amazon puts on IDs is stripped; "£1,234.50", "4.0000%" and "<5%" are
 *   read as numbers (a percentage as a fraction); "Aug 25, 2026 - Sep 12, 2026" becomes a start and
 *   end date; dd/mm/yyyy (the Campaign Manager grid) and ISO dates are read too.
 */

/* ===================== CSV ===================== */

/** RFC 4180 CSV: quoted fields, doubled quotes, commas and newlines inside quotes; a BOM is dropped. */
export function parseCsv(text: string): string[][] {
  const s = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [], field = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

/* ===================== values ===================== */

/** Amazon wraps IDs as ="123" so spreadsheets keep them as text. */
export const unwrap = (v: string | undefined | null): string => (v ?? "").trim().replace(/^="(.*)"$/, "$1").trim();

/** "£1,234.50" → 1234.5; "4.0000%" → 0.04; "<5%" → 0.05; "" → null. */
export function num(v: string | undefined | null): number | null {
  const s = unwrap(v).replace(/^[<>~≈]\s*/, "").replace(/[£$€,\s]/g, "");
  if (!s || s === "-" || s === "--") return null;
  const pct = s.endsWith("%");
  const n = Number(pct ? s.slice(0, -1) : s);
  return Number.isFinite(n) ? (pct ? n / 100 : n) : null;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** "Aug 25, 2026", "25/08/2026" (UK, as the grid writes it), "2026-08-25", "20260825" → "2026-08-25". */
export function date(v: string | undefined | null): string | null {
  const s = unwrap(v);
  if (!s) return null;
  const month = (w: string) => MONTHS[w.slice(0, 4).toLowerCase()] ?? MONTHS[w.slice(0, 3).toLowerCase()];
  let m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m && month(m[1])) return iso(Number(m[3]), month(m[1]), Number(m[2]));
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})$/);
  if (m && month(m[2])) return iso(Number(m[3]), month(m[2]), Number(m[1]));
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return iso(Number(m[3]), Number(m[2]), Number(m[1]));
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  return null;
}

/** "Aug 23, 2026 - Sep 13, 2026" → both ends; a single date is a one-day range. */
export function dateRange(v: string | undefined | null): { from: string; to: string } | null {
  const s = unwrap(v);
  if (!s) return null;
  const parts = s.split(/\s+[-–]\s+/);
  const from = date(parts[0]), to = date(parts[1] ?? parts[0]);
  return from && to ? { from, to } : null;
}

/* ===================== fields and report types ===================== */

/** Canonical fields and every column name they're known by (lower case). Add an export's name here. */
export const FIELD_ALIASES = {
  dateRange: ["date range"],
  date: ["date", "day"],
  startDate: ["start date", "report start date"],
  endDate: ["end date", "report end date"],
  currency: ["budget currency", "currency"],
  campaignId: ["campaign id"],
  campaignName: ["campaign name", "campaign"],
  adGroupId: ["ad group id"],
  adGroupName: ["ad group name", "ad group"],
  searchTerm: ["search term", "customer search term"],
  keyword: ["keyword", "keyword text"],
  matchType: ["match type"],
  placement: ["placement", "placement type"],
  impressions: ["impressions"],
  clicks: ["clicks"],
  cost: ["total cost", "spend", "cost"],
  orders: ["purchases", "7 day total orders (#)", "orders", "14 day total orders (#)"],
  sales: ["sales", "7 day total sales", "7 day total sales (£)", "14 day total sales"],
  units: ["units sold", "7 day total units (#)", "units"],
  state: ["state", "campaign status"],
  status: ["status"],
  type: ["type", "ad product", "campaign type"],
  targeting: ["targeting", "targeting type"],
  campaignStart: ["campaign start date"],
  campaignEnd: ["campaign end date"],
  budget: ["campaign budget amount", "budget", "daily budget"],
  topOfSearchShare: ["top-of-search impression share"],
} as const;

export type Field = keyof typeof FIELD_ALIASES;

export type ReportType = "search_term" | "keyword" | "placement" | "campaign_daily" | "campaign" | "campaign_grid";

/**
 * Report types, most specific first: the first whose required fields are all present wins. The
 * Campaign Manager grid has campaign settings and totals but no date range: its totals cover
 * whatever range was picked in the console, so they're kept as "as exported".
 */
export const REPORT_TYPES: { type: ReportType; label: string; requires: Field[]; without?: Field[] }[] = [
  { type: "search_term", label: "Search term report", requires: ["campaignName", "searchTerm", "clicks", "cost"] },
  { type: "keyword", label: "Targeting (keyword) report", requires: ["campaignName", "keyword", "clicks", "cost"] },
  { type: "placement", label: "Placement report", requires: ["campaignName", "placement", "clicks", "cost"] },
  { type: "campaign_daily", label: "Campaign report (daily)", requires: ["campaignName", "date", "clicks", "cost"] },
  { type: "campaign", label: "Campaign report", requires: ["campaignName", "clicks", "cost"], without: ["targeting", "campaignStart"] },
  { type: "campaign_grid", label: "Campaign Manager export", requires: ["campaignName", "state", "targeting", "campaignStart", "clicks", "cost"] },
];

export const REPORT_LABEL = Object.fromEntries(REPORT_TYPES.map((r) => [r.type, r.label])) as Record<ReportType, string>;

/** Header columns by canonical field (the first matching column, exact name, case and spaces ignored). */
export function mapHeader(header: string[]): Partial<Record<Field, number>> {
  const norm = header.map((h) => h.replace(/^﻿/, "").trim().toLowerCase().replace(/\s+/g, " "));
  const out: Partial<Record<Field, number>> = {};
  for (const [f, names] of Object.entries(FIELD_ALIASES) as [Field, readonly string[]][]) {
    const i = norm.findIndex((h) => names.includes(h));
    if (i >= 0) out[f] = i;
  }
  return out;
}

export function detectType(cols: Partial<Record<Field, number>>): ReportType | null {
  const has = (f: Field) => cols[f] != null;
  // A range or a date makes a report dated; without either, a campaign table is the grid export.
  for (const r of REPORT_TYPES) {
    if (!r.requires.every(has)) continue;
    if (r.without?.some(has)) continue;
    if (r.type === "campaign" && !has("dateRange") && !(has("startDate") && has("endDate"))) continue;
    return r.type;
  }
  return null;
}

/** One report row in the canonical shape. Counts are numbers (0 when blank); IDs are unwrapped. */
export interface AdsRow {
  campaignId: string | null;
  campaignName: string;
  adGroupId: string | null;
  adGroupName: string | null;
  searchTerm: string | null;
  keyword: string | null;
  matchType: string | null;
  placement: string | null;
  /** The row's own period: a day (daily reports), a range, or null (the grid: "as exported"). */
  dateFrom: string | null;
  dateTo: string | null;
  impressions: number | null;
  clicks: number;
  cost: number;
  orders: number;
  sales: number;
  units: number | null;
  // Campaign settings (the grid export).
  state: string | null;
  type: string | null;
  targeting: string | null;
  campaignStart: string | null;
  campaignEnd: string | null;
  budget: number | null;
  topOfSearchShare: string | null;
  currency: string | null;
}

export interface ParsedReport {
  type: ReportType;
  label: string;
  rows: AdsRow[];
  /** The earliest and latest dates the rows cover (null for the grid). */
  dateFrom: string | null;
  dateTo: string | null;
  columns: Field[];
  warnings: string[];
}

/** "Campaign_Oct_2_2026.csv" → 2026-10-02: when a grid export was made, if its name says. */
export function dateFromFileName(name: string): string | null {
  const m = name.match(/([A-Za-z]{3,9})[_\s-]+(\d{1,2})[_\s-]+(\d{4})/);
  return m ? date(`${m[1]} ${m[2]}, ${m[3]}`) : null;
}

/** Read one exported report. Throws a readable error when the format isn't one it knows. */
export function parseReport(text: string, fileName = ""): ParsedReport {
  const all = parseCsv(text);
  // Some exports put a title or notes above the header: the header is the first row naming a campaign column.
  const hi = all.findIndex((r) => r.some((c) => FIELD_ALIASES.campaignName.includes(c.replace(/^﻿/, "").trim().toLowerCase() as never)));
  if (hi < 0) throw new Error(`${fileName || "This file"}: no "Campaign name" column, so not an Amazon Ads report this app knows`);
  const header = all[hi];
  const cols = mapHeader(header);
  const type = detectType(cols);
  if (!type) throw new Error(`${fileName || "This file"}: the columns don't match a known report (found ${Object.keys(cols).join(", ")})`);
  const get = (r: string[], f: Field) => (cols[f] == null ? undefined : r[cols[f]!]);
  const text_ = (r: string[], f: Field) => { const v = unwrap(get(r, f)); return v || null; };
  const warnings: string[] = [];
  const rows: AdsRow[] = [];
  let skipped = 0;
  for (const r of all.slice(hi + 1)) {
    const name = text_(r, "campaignName");
    if (!name) { skipped++; continue; }
    let from: string | null = null, to: string | null = null;
    if (cols.date != null) { from = to = date(get(r, "date")); }
    else if (cols.dateRange != null) { const d = dateRange(get(r, "dateRange")); from = d?.from ?? null; to = d?.to ?? null; }
    else if (cols.startDate != null && cols.endDate != null) { from = date(get(r, "startDate")); to = date(get(r, "endDate")); }
    if (type !== "campaign_grid" && (!from || !to)) { skipped++; continue; }
    rows.push({
      campaignId: text_(r, "campaignId"), campaignName: name,
      adGroupId: text_(r, "adGroupId"), adGroupName: text_(r, "adGroupName"),
      searchTerm: text_(r, "searchTerm")?.toLowerCase() ?? null, keyword: text_(r, "keyword"), matchType: text_(r, "matchType"), placement: text_(r, "placement"),
      dateFrom: from, dateTo: to,
      impressions: num(get(r, "impressions")),
      clicks: num(get(r, "clicks")) ?? 0, cost: num(get(r, "cost")) ?? 0, orders: num(get(r, "orders")) ?? 0, sales: num(get(r, "sales")) ?? 0,
      units: num(get(r, "units")),
      state: text_(r, "state"), type: text_(r, "type"), targeting: text_(r, "targeting"),
      campaignStart: date(get(r, "campaignStart")), campaignEnd: date(get(r, "campaignEnd")), budget: num(get(r, "budget")),
      topOfSearchShare: text_(r, "topOfSearchShare"), currency: text_(r, "currency"),
    });
  }
  if (skipped) warnings.push(`${skipped} row${skipped === 1 ? "" : "s"} without a campaign or a date left out`);
  const currencies = [...new Set(rows.map((r) => r.currency).filter(Boolean))];
  if (currencies.some((c) => c !== "GBP")) warnings.push(`Currency ${currencies.join(", ")}: figures are read as they are, not converted`);
  if (type === "campaign_grid") warnings.push("The Campaign Manager export has no date range: its totals cover whatever range was picked in the console, and are used only for campaigns no dated report covers");
  const dates = rows.flatMap((r) => [r.dateFrom, r.dateTo]).filter((x): x is string => !!x).sort();
  return {
    type, label: REPORT_LABEL[type], rows,
    dateFrom: dates[0] ?? null, dateTo: dates.at(-1) ?? null,
    columns: Object.keys(cols) as Field[], warnings,
  };
}

/** An ASIN in a campaign's name ("AD_READY: B0H9ZKYYHZ"), when there's exactly one. */
export function asinFromName(name: string | null | undefined): string | null {
  const m = [...new Set((name ?? "").toUpperCase().match(/\bB0[A-Z0-9]{8}\b/g) ?? [])];
  return m.length === 1 ? m[0] : null;
}
