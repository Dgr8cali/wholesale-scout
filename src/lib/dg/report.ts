/**
 * Seller Central's Dangerous Goods lookup result (the file it returns for a list of ASINs),
 * read into one status per ASIN. Amazon's column names and wording vary between exports and
 * marketplaces, so columns are found by their headers and statuses by their words; anything
 * not understood is reported back rather than guessed.
 */
import type { Cell } from "../ingest/mapping";

export type DgLookupStatus = "not_dg" | "dg_fulfillable" | "dg_not_fulfillable" | "review_required" | "unknown";

export interface DgLookup {
  status: DgLookupStatus;
  /** Amazon's own words for the status, as in the file. */
  text: string;
  /** The programme or storage the lookup names (e.g. "FBA", "Pan-European FBA"), if any. */
  programme: string | null;
  /** When it was imported, and from which file. */
  at: string;
  file: string | null;
}

export const DG_STATUS_LABEL: Record<DgLookupStatus, string> = {
  not_dg: "not dangerous goods",
  dg_fulfillable: "dangerous goods, fulfillable",
  dg_not_fulfillable: "dangerous goods, not fulfillable",
  review_required: "review required",
  unknown: "status not recognised",
};

/** Amazon's wording to a status. Order matters: "not dangerous goods" before "dangerous goods". */
export function dgStatusOf(text: string): DgLookupStatus {
  const t = text.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return "unknown";
  if (/\b(review|pending|under review|more information|info(rmation)? (needed|required)|sds|safety data sheet|exemption sheet|upload|missing|incomplete)\b/.test(t)) return "review_required";
  if (/\b(not|non|isn'?t)\s*(a\s+)?(dangerous goods|dg|hazmat|hazardous)\b|\bnon ?dg\b|\bnon ?hazmat\b|^no$|^none$|not regulated|^standard$/.test(t)) return "not_dg";
  if (/(dangerous goods|\bdg\b|hazmat|hazardous)/.test(t) || /^yes$/.test(t)) {
    if (/ineligible|not (fulfillable|fulfilable|sellable|allowed|permitted|eligible|accepted)|(cannot|can'?t) be (fulfilled|sold|stored)|prohibited|restricted|rejected|unfulfillable|not supported/.test(t)) return "dg_not_fulfillable";
    return "dg_fulfillable";
  }
  if (/\b(prohibited|not eligible|ineligible|cannot be fulfilled)\b/.test(t)) return "dg_not_fulfillable";
  return "unknown";
}

const norm = (c: Cell) => String(c ?? "").trim();
const ASIN_RE = /^(B0[A-Z0-9]{8}|\d{9}[\dX])$/i;

export interface ParsedDgReport {
  entries: { asin: string; status: DgLookupStatus; text: string; programme: string | null }[];
  /** The headers read, for showing what was used. */
  columns: { asin: string; status: string; programme: string | null } | null;
  /** Status wordings that weren't understood, with how many rows had each. */
  unrecognised: { text: string; rows: number }[];
  /** Rows skipped: no ASIN, or no status. */
  skipped: number;
  error: string | null;
}

/** Read the lookup file's rows (as a spreadsheet library gives them) into statuses per ASIN. */
export function parseDgReport(rows: Cell[][]): ParsedDgReport {
  const empty = (error: string): ParsedDgReport => ({ entries: [], columns: null, unrecognised: [], skipped: 0, error });
  // The header row: the first of the top 20 with an ASIN column.
  const h = rows.slice(0, 20).findIndex((r) => r.some((c) => /^\s*(asin|child asin|product asin)\s*$/i.test(norm(c))));
  if (h < 0) return empty("No ASIN column found: the file needs a header named ASIN.");
  const headers = rows[h].map(norm);
  const asinCol = headers.findIndex((x) => /^(asin|child asin|product asin)$/i.test(x));
  const score = (x: string) =>
    /dangerous goods (classification|status)|hazmat (classification|status)|dg (classification|status)/i.test(x) ? 5
      : /classification|hazmat|dangerous|\bdg\b/i.test(x) ? 4
      : /status|result|review/i.test(x) ? 2 : 0;
  let statusCol = -1, best = 0;
  headers.forEach((x, i) => { if (i !== asinCol && !/program|storage|reason|date|updated|title|name/i.test(x) && score(x) > best) { best = score(x); statusCol = i; } });
  if (statusCol < 0) return empty(`No dangerous-goods status column found among: ${headers.filter(Boolean).join(", ")}.`);
  const progCol = headers.findIndex((x, i) => i !== statusCol && /program(me)?|storage type|fulfil(l)?ment (program|type)/i.test(x));

  const byAsin = new Map<string, ParsedDgReport["entries"][number]>();
  const unknown = new Map<string, number>();
  let skipped = 0;
  for (const r of rows.slice(h + 1)) {
    const asin = norm(r[asinCol]).toUpperCase();
    const text = norm(r[statusCol]);
    if (!ASIN_RE.test(asin) || !text) { if (r.some((c) => norm(c))) skipped++; continue; }
    const status = dgStatusOf(text);
    if (status === "unknown") unknown.set(text, (unknown.get(text) ?? 0) + 1);
    byAsin.set(asin, { asin, status, text: text.slice(0, 200), programme: progCol >= 0 ? norm(r[progCol]).slice(0, 80) || null : null });
  }
  if (!byAsin.size) return { ...empty("No rows with an ASIN and a status."), columns: { asin: headers[asinCol], status: headers[statusCol], programme: progCol >= 0 ? headers[progCol] : null }, skipped };
  return {
    entries: [...byAsin.values()],
    columns: { asin: headers[asinCol], status: headers[statusCol], programme: progCol >= 0 ? headers[progCol] : null },
    unrecognised: [...unknown].map(([text, n]) => ({ text, rows: n })).sort((a, b) => b.rows - a.rows),
    skipped,
    error: null,
  };
}

/** The Compliance line's words for a lookup: "Amazon DG lookup: dangerous goods, fulfillable (Pan-European FBA)". */
export function dgLookupText(l: Pick<DgLookup, "status" | "text" | "programme">): string {
  const said = l.status === "unknown" ? `“${l.text}”` : DG_STATUS_LABEL[l.status];
  return `Amazon DG lookup: ${said}${l.programme ? ` (${l.programme})` : ""}`;
}
