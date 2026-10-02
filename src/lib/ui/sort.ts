/**
 * Click-to-sort for every table in the app, implemented once. Pure: values are read as numbers,
 * dates or text; blanks always sort last; "≥ 201", "£12.50", "45%" and "1,200" sort by their number.
 * First click: numbers and dates descending (highest, newest first), text ascending; second flips.
 */

export type SortKind = "number" | "date" | "text";
export type SortDir = "asc" | "desc";
export interface SortState { key: string; dir: SortDir }

/** Blank: null, undefined, NaN, "", "—", "-". */
export function isBlank(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "number") return !Number.isFinite(v);
  if (typeof v === "string") return /^\s*(—|-|–|n\/a)?\s*$/i.test(v);
  return false;
}

const NUM = /^[≥≤<>~≈+]?\s*[£$€]?\s*-?\d[\d,]*(\.\d+)?\s*(%|x|×|p|k)?$/i;

/** A string's number when it is one ("≥ 201" → 201, "£1,234.50" → 1234.5, "45%" → 45, "−3" → -3); else null. */
export function numberOf(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/−/g, "-").replace(/^(-?)\s*([£$€])/, "$1");
  if (!NUM.test(s)) return null;
  const n = Number(s.replace(/^[≥≤<>~≈+]\s*/, "").replace(/[£$€,\s%x×pk]/gi, ""));
  return Number.isFinite(n) ? (/k$/i.test(s) ? n * 1000 : n) : null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ][\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;
/** A date's time (ms) when the value is a Date or an ISO date string; else null. */
export function dateOf(v: unknown): number | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime();
  if (typeof v === "string" && ISO_DATE.test(v.trim())) { const t = Date.parse(v); return Number.isNaN(t) ? null : t; }
  return null;
}

/** What a column holds, from its values: numbers, dates, else text. */
export function inferKind(values: unknown[]): SortKind {
  const vs = values.filter((v) => !isBlank(v));
  if (!vs.length) return "text";
  if (vs.every((v) => dateOf(v) != null)) return "date";
  if (vs.every((v) => numberOf(v) != null)) return "number";
  return "text";
}

/** The first click's direction: numbers and dates highest/newest first, text A–Z. */
export const firstDir = (kind: SortKind): SortDir => (kind === "text" ? "asc" : "desc");

/** Clicking a header: a new column starts at its first direction; the same column flips. */
export function nextSort(cur: SortState | null, key: string, kind: SortKind): SortState {
  return cur?.key === key ? { key, dir: cur.dir === "asc" ? "desc" : "asc" } : { key, dir: firstDir(kind) };
}

const collator = new Intl.Collator("en-GB", { numeric: true, sensitivity: "base" });

/** Compare two values of a column; blanks last whichever the direction. */
export function compareValues(a: unknown, b: unknown, kind: SortKind, dir: SortDir): number {
  const ab = isBlank(a), bb = isBlank(b);
  if (ab || bb) return ab === bb ? 0 : ab ? 1 : -1;
  const s = dir === "asc" ? 1 : -1;
  if (kind === "number") {
    const x = numberOf(a), y = numberOf(b);
    if (x == null || y == null) return x == null && y == null ? 0 : x == null ? 1 : -1;
    return (x - y) * s;
  }
  if (kind === "date") {
    const x = dateOf(a), y = dateOf(b);
    if (x == null || y == null) return x == null && y == null ? 0 : x == null ? 1 : -1;
    return (x - y) * s;
  }
  return collator.compare(String(a), String(b)) * s;
}

/** Rows sorted by one column (stable: equal rows keep their order). */
export function sortRows<T>(rows: T[], value: (row: T) => unknown, kind: SortKind, dir: SortDir): T[] {
  return rows.map((r, i) => ({ r, i, v: value(r) })).sort((a, b) => compareValues(a.v, b.v, kind, dir) || a.i - b.i).map((x) => x.r);
}

/** A remembered sort, checked: anything malformed is ignored. */
export function parseStoredSort(raw: string | null, keys?: string[]): SortState | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Partial<SortState>;
    if (typeof s.key !== "string" || (s.dir !== "asc" && s.dir !== "desc")) return null;
    if (keys && !keys.includes(s.key)) return null;
    return { key: s.key, dir: s.dir };
  } catch {
    return null;
  }
}

export const sortStorageKey = (tableId: string) => `ws.sort.${tableId}`;
