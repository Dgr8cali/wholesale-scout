/**
 * Results filters: every active filter must match (AND). Pure, shared by the run page and
 * the Favourites page.
 */

export const RANGE_KEYS = ["sales", "sellers", "profit", "roi", "margin", "sell"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

export const RANGE_LABELS: Record<RangeKey, { label: string; unit: string }> = {
  sales: { label: "Sales / mo", unit: "" },
  sellers: { label: "Sellers", unit: "" },
  profit: { label: "Profit", unit: "£" },
  roi: { label: "ROI", unit: "%" },
  margin: { label: "Margin", unit: "%" },
  sell: { label: "Sell price", unit: "£" },
};

/** "dormant" isn't a gate verdict: it picks listings nobody sells now, whatever their verdict. */
export type Verdict = "pass" | "warn" | "fail" | "error" | "dormant";
export type Approval = "open" | "approval_required" | "blocked";
export const APPROVAL_LABELS: Record<Approval, string> = { open: "Open", approval_required: "Approval needed", blocked: "Blocked" };

export interface Range {
  min: number | null;
  max: number | null;
}

export interface FilterSet {
  verdicts: Verdict[];
  bands: string[];
  gates: string[];
  brands: string[];
  supplier: string | null;
  amazon: "any" | "yes" | "no";
  approval: Approval[];
  favouritesOnly: boolean;
  /** Only rows with a gate you've waived. */
  waivedOnly: boolean;
  ranges: Partial<Record<RangeKey, Range>>;
  q: string;
}

export const EMPTY_FILTERS: FilterSet = {
  verdicts: [], bands: [], gates: [], brands: [], supplier: null, amazon: "any", approval: [], favouritesOnly: false, waivedOnly: false, ranges: {}, q: "",
};

/** What a filter needs to know about a row. */
export interface FilterRow {
  verdict: Verdict | null;
  band: string | null;
  failedGate: string | null;
  brand: string | null;
  supplier: string | null;
  /** Amazon on the listing per the Amazon-presence gate; null when not known. */
  amazon: "yes" | "no" | null;
  approval: Approval | null;
  favourite: boolean;
  /** A gate on this row is waived. */
  waived: boolean;
  /** Nobody sells the listing now (see screening/dormant). */
  dormant: boolean;
  values: Record<RangeKey, number | null>;
  /** Searchable text: name, brand, EAN, ASIN, supplier, why. */
  text: string;
}

const inRange = (v: number | null, r: Range | undefined) =>
  !r || (r.min == null && r.max == null) || (v != null && (r.min == null || v >= r.min) && (r.max == null || v <= r.max));

export function matches(row: FilterRow, f: FilterSet): boolean {
  if (f.verdicts.length && !f.verdicts.some((v) => (v === "dormant" ? row.dormant : v === row.verdict))) return false;
  if (f.bands.length && (!row.band || !f.bands.includes(row.band))) return false;
  if (f.gates.length && (!row.failedGate || !f.gates.includes(row.failedGate))) return false;
  if (f.brands.length && (!row.brand || !f.brands.includes(row.brand))) return false;
  if (f.supplier && row.supplier !== f.supplier) return false;
  if (f.amazon !== "any" && row.amazon !== f.amazon) return false;
  if (f.approval.length && (!row.approval || !f.approval.includes(row.approval))) return false;
  if (f.favouritesOnly && !row.favourite) return false;
  if (f.waivedOnly && !row.waived) return false;
  for (const k of RANGE_KEYS) if (!inRange(row.values[k], f.ranges[k])) return false;
  const q = f.q.trim().toLowerCase();
  if (q && !row.text.toLowerCase().includes(q)) return false;
  return true;
}

export function isEmpty(f: FilterSet): boolean {
  return activeChips(f, {}).length === 0;
}

/** Fill any fields a stored filter set lacks (older saves, other versions). */
export function normalizeFilters(f: Partial<FilterSet> | null | undefined): FilterSet {
  return { ...EMPTY_FILTERS, ...(f ?? {}), ranges: { ...(f?.ranges ?? {}) } };
}

export interface Chip {
  id: string;
  label: string;
  remove: (f: FilterSet) => FilterSet;
}

const without = <T,>(xs: T[], x: T) => xs.filter((y) => y !== x);
const fmt = (k: RangeKey, v: number) => (RANGE_LABELS[k].unit === "£" ? `£${v}` : `${v}${RANGE_LABELS[k].unit}`);

/** One removable chip per active filter value. */
export function activeChips(f: FilterSet, gateLabels: Record<string, string>): Chip[] {
  const chips: Chip[] = [];
  for (const v of f.verdicts) chips.push({ id: `v:${v}`, label: `Verdict: ${v}`, remove: (s) => ({ ...s, verdicts: without(s.verdicts, v) }) });
  for (const b of f.bands) chips.push({ id: `b:${b}`, label: `Band: ${b}`, remove: (s) => ({ ...s, bands: without(s.bands, b) }) });
  for (const g of f.gates) chips.push({ id: `g:${g}`, label: `Failed: ${gateLabels[g] ?? g}`, remove: (s) => ({ ...s, gates: without(s.gates, g) }) });
  for (const b of f.brands) chips.push({ id: `br:${b}`, label: `Brand: ${b}`, remove: (s) => ({ ...s, brands: without(s.brands, b) }) });
  if (f.supplier) chips.push({ id: "s", label: `Supplier: ${f.supplier}`, remove: (s) => ({ ...s, supplier: null }) });
  if (f.amazon !== "any") chips.push({ id: "a", label: `Amazon on listing: ${f.amazon}`, remove: (s) => ({ ...s, amazon: "any" }) });
  for (const a of f.approval) chips.push({ id: `ap:${a}`, label: APPROVAL_LABELS[a], remove: (s) => ({ ...s, approval: without(s.approval, a) }) });
  if (f.favouritesOnly) chips.push({ id: "fav", label: "Favourites only", remove: (s) => ({ ...s, favouritesOnly: false }) });
  if (f.waivedOnly) chips.push({ id: "waived", label: "Waived", remove: (s) => ({ ...s, waivedOnly: false }) });
  for (const k of RANGE_KEYS) {
    const r = f.ranges[k];
    if (!r || (r.min == null && r.max == null)) continue;
    const text = r.min != null && r.max != null ? `${fmt(k, r.min)}–${fmt(k, r.max)}` : r.min != null ? `≥ ${fmt(k, r.min)}` : `≤ ${fmt(k, r.max!)}`;
    chips.push({ id: `r:${k}`, label: `${RANGE_LABELS[k].label} ${text}`, remove: (s) => ({ ...s, ranges: { ...s.ranges, [k]: undefined } }) });
  }
  if (f.q.trim()) chips.push({ id: "q", label: `“${f.q.trim()}”`, remove: (s) => ({ ...s, q: "" }) });
  return chips;
}
