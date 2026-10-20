/**
 * Results filters: every active filter must match (AND). Pure, shared by the run page and
 * the Favourites page.
 */

export const RANGE_KEYS = ["sales", "sellers", "profit", "roi", "margin", "sell", "bsr"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

export const RANGE_LABELS: Record<RangeKey, { label: string; unit: string }> = {
  sales: { label: "Sales / mo", unit: "" },
  sellers: { label: "Sellers", unit: "" },
  profit: { label: "Profit", unit: "£" },
  roi: { label: "ROI", unit: "%" },
  margin: { label: "Margin", unit: "%" },
  sell: { label: "Sell price", unit: "£" },
  bsr: { label: "BSR", unit: "" },
};

/**
 * "dormant" isn't a gate verdict: it picks listings nobody sells now, whatever their verdict.
 * "unscored" picks rows with no verdict yet (Not scored).
 */
export type Verdict = "pass" | "warn" | "fail" | "unscored" | "error" | "dormant";
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
  /** Gated: yes = approval needed or blocked, no = open to sell. */
  gated: "any" | "yes" | "no";
  favouritesOnly: boolean;
  /** Only rows with a gate you've waived. */
  waivedOnly: boolean;
  ranges: Partial<Record<RangeKey, Range>>;
  q: string;
}

export const EMPTY_FILTERS: FilterSet = {
  verdicts: [], bands: [], gates: [], brands: [], supplier: null, amazon: "any", approval: [], gated: "any", favouritesOnly: false, waivedOnly: false, ranges: {}, q: "",
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
  if (f.verdicts.length && !f.verdicts.some((v) => (v === "dormant" ? row.dormant : v === "unscored" ? row.verdict == null : v === row.verdict))) return false;
  if (f.bands.length && (!row.band || !f.bands.includes(row.band))) return false;
  if (f.gates.length && (!row.failedGate || !f.gates.includes(row.failedGate))) return false;
  if (f.brands.length && (!row.brand || !f.brands.includes(row.brand))) return false;
  if (f.supplier && row.supplier !== f.supplier) return false;
  if (f.amazon !== "any" && row.amazon !== f.amazon) return false;
  if (f.approval.length && (!row.approval || !f.approval.includes(row.approval))) return false;
  if (f.gated !== "any" && (!row.approval || (row.approval !== "open") !== (f.gated === "yes"))) return false;
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
const fmt = (k: RangeKey, v: number) => (RANGE_LABELS[k].unit === "£" ? `£${v}` : `${v.toLocaleString("en-GB")}${RANGE_LABELS[k].unit}`);

/** The verdict filter's words: the product decision for pass / warn / fail. */
export const VERDICT_WORDS: Record<Verdict, string> = { pass: "Buy", warn: "Check", fail: "Skip", unscored: "Not scored", error: "Error", dormant: "Dormant" };

/** One removable chip per active filter value. */
export function activeChips(f: FilterSet, gateLabels: Record<string, string>): Chip[] {
  const chips: Chip[] = [];
  for (const v of f.verdicts) chips.push({ id: `v:${v}`, label: VERDICT_WORDS[v] ?? v, remove: (s) => ({ ...s, verdicts: without(s.verdicts, v) }) });
  for (const b of f.bands) chips.push({ id: `b:${b}`, label: `Band: ${b}`, remove: (s) => ({ ...s, bands: without(s.bands, b) }) });
  for (const g of f.gates) chips.push({ id: `g:${g}`, label: `Failed: ${gateLabels[g] ?? g}`, remove: (s) => ({ ...s, gates: without(s.gates, g) }) });
  for (const b of f.brands) chips.push({ id: `br:${b}`, label: `Brand: ${b}`, remove: (s) => ({ ...s, brands: without(s.brands, b) }) });
  if (f.supplier) chips.push({ id: "s", label: `Supplier: ${f.supplier}`, remove: (s) => ({ ...s, supplier: null }) });
  if (f.amazon !== "any") chips.push({ id: "a", label: `Amazon on listing: ${f.amazon}`, remove: (s) => ({ ...s, amazon: "any" }) });
  if (f.gated !== "any") chips.push({ id: "gated", label: f.gated === "yes" ? "Gated" : "Not gated", remove: (s) => ({ ...s, gated: "any" }) });
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

/*
 * Filters in the address, so a filtered view can be bookmarked or linked to (Today, ⌘K):
 *   q=text · verdict=buy,check,skip,none,error,dormant · profit=5 (a minimum), roi=..80 (a maximum),
 *   sales=30..200 (both) and the same for sellers, margin, sell, bsr · gated=yes|no · supplier=Name ·
 *   brand=A&brand=B · band=green,amber · gate=demand,fees · amazon=yes|no ·
 *   approval=open,approval_required,blocked · fav=1 · waived=1.
 * Anything unreadable is ignored. Other parameters (tab, page) are left alone.
 */
const VERDICT_PARAM: Record<Verdict, string> = { pass: "buy", warn: "check", fail: "skip", unscored: "none", error: "error", dormant: "dormant" };
// The stored words are read too (old links: ?verdict=pass).
const PARAM_VERDICT = { ...Object.fromEntries(Object.entries(VERDICT_PARAM).map(([k, v]) => [v, k])), pass: "pass", warn: "warn", fail: "fail", unscored: "unscored" } as Record<string, Verdict>;
/** Every parameter the filters own. */
export const FILTER_PARAMS = ["q", "verdict", ...RANGE_KEYS, "gated", "supplier", "brand", "band", "gate", "amazon", "approval", "fav", "waived"] as const;

const list = (v: string | null) => (v ?? "").split(",").map((x) => x.trim()).filter(Boolean);
const numOrNull = (v: string) => (v.trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** "5" is a minimum, "..80" a maximum, "30..200" both. */
export function parseRange(v: string | null): Range | undefined {
  if (v == null || !v.trim()) return undefined;
  const [a, b] = v.includes("..") ? v.split("..", 2) : [v, ""];
  const r = { min: numOrNull(a), max: numOrNull(b) };
  return r.min == null && r.max == null ? undefined : r;
}

export function rangeParam(r: Range | undefined): string | null {
  if (!r || (r.min == null && r.max == null)) return null;
  return r.max == null ? String(r.min) : `${r.min ?? ""}..${r.max}`;
}

export function filtersFromQuery(p: URLSearchParams): FilterSet {
  const ranges: FilterSet["ranges"] = {};
  for (const k of RANGE_KEYS) {
    const r = parseRange(p.get(k));
    if (r) ranges[k] = r;
  }
  const yn = (v: string | null) => (v === "yes" || v === "no" ? v : "any");
  return {
    ...EMPTY_FILTERS,
    q: p.get("q") ?? "",
    verdicts: [...new Set(list(p.get("verdict")).map((v) => PARAM_VERDICT[v.toLowerCase()]).filter(Boolean))],
    ranges,
    gated: yn(p.get("gated")),
    supplier: p.get("supplier") || null,
    brands: p.getAll("brand").filter(Boolean),
    bands: list(p.get("band")).filter((b) => ["green", "amber", "grey"].includes(b)),
    gates: list(p.get("gate")),
    amazon: yn(p.get("amazon")),
    approval: list(p.get("approval")).filter((a): a is Approval => a in APPROVAL_LABELS),
    favouritesOnly: p.get("fav") === "1",
    waivedOnly: p.get("waived") === "1",
  };
}

/** The filters written into `base` (its other parameters kept); the empty filters write nothing. */
export function filtersToQuery(f: FilterSet, base: URLSearchParams = new URLSearchParams()): URLSearchParams {
  const p = new URLSearchParams(base);
  for (const k of FILTER_PARAMS) p.delete(k);
  if (f.q.trim()) p.set("q", f.q);
  if (f.verdicts.length) p.set("verdict", f.verdicts.map((v) => VERDICT_PARAM[v]).join(","));
  for (const k of RANGE_KEYS) {
    const v = rangeParam(f.ranges[k]);
    if (v) p.set(k, v);
  }
  if (f.gated !== "any") p.set("gated", f.gated);
  if (f.supplier) p.set("supplier", f.supplier);
  for (const b of f.brands) p.append("brand", b);
  if (f.bands.length) p.set("band", f.bands.join(","));
  if (f.gates.length) p.set("gate", f.gates.join(","));
  if (f.amazon !== "any") p.set("amazon", f.amazon);
  if (f.approval.length) p.set("approval", f.approval.join(","));
  if (f.favouritesOnly) p.set("fav", "1");
  if (f.waivedOnly) p.set("waived", "1");
  return p;
}
