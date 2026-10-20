import type { Sparks } from "@/lib/sparkline";
import { firstOrderFigures } from "@/lib/ui/metrics";
import { parseStoredSort, sortStorageKey } from "@/lib/ui/sort";
import { approvalOf } from "@/lib/ui/resultRows";
import { buyPrice, decisionOf, figure, listingMoq, titleOf, type Result, type RowExtras, type SortKey } from "./types";

const mean = (xs: (number | null)[] | null | undefined) => {
  const v = (xs ?? []).filter((x): x is number => x != null && Number.isFinite(x));
  return v.length ? v.reduce((a, x) => a + x, 0) / v.length : null;
};

/**
 * A result's value for a sort column, as the results table sorts it (null sorts last). The 90-day
 * rank and Buy Box are the averages of the row's sparkline once it has loaded (rows load them as
 * they scroll into view); before that, the current rank and Buy Box from the screening stand in.
 */
function resultSortValue(r: Result, key: SortKey, lineBudget: number, sparks?: Record<string, Sparks | null>, x?: RowExtras): number | string | null {
  if (key === "title") return titleOf(r).toLowerCase();
  if (key === "verdict") {
    // Buy, Check, Skip, then Not scored.
    const v = decisionOf(r, x);
    return v == null ? (x?.decision === undefined && r.status !== "pending" ? 2 : 3) : ({ pass: 0, warn: 1, fail: 2 } as const)[v];
  }
  if (key === "buy") return buyPrice(r, x);
  if (key === "bsr") return r.inputs?.market?.rankNow ?? null;
  if (key === "gated") { const a = approvalOf(r); return a == null ? null : ({ open: 0, approval_required: 1, blocked: 2 } as const)[a]; }
  if (key === "maxLanded") return x?.maxLanded !== undefined ? x.maxLanded : r.inputs?.maxLandedGbp ?? null;
  if (key === "screened") return x?.screenedAt ?? r.updated_at ?? null;
  if (key === "supplier") return r.offer?.supplier?.name?.toLowerCase() ?? null;
  if (key === "why") return r.why?.split(/[;·\n]/)[0]?.trim().toLowerCase() || null;
  if (key === "rank90" || key === "bb90") {
    const s = r.product?.asin ? sparks?.[r.product.asin] : null;
    const m = r.inputs?.market;
    return key === "rank90" ? mean(s?.rank) ?? m?.rankNow ?? null : mean(s?.buyBox) ?? m?.currentBuyBox ?? null;
  }
  if (key === "sales" || key === "sellers" || key === "buybox" || key === "share" || key === "profitMo") return figure(r, key).value;
  if (key === "orderQty" || key === "months") {
    return r.score == null ? null : firstOrderFigures(r.inputs?.market, r.landed_cost, listingMoq(r), lineBudget)[key === "orderQty" ? "qty" : "months"].value;
  }
  return (r[key] as number | null) ?? null;
}

/** A comparator for resultSortValue, nulls last whichever way. */
export function compareResults(key: SortKey, dir: 1 | -1, lineBudget: number, sparks?: Record<string, Sparks | null>) {
  const byRow = compareRows(key, dir, lineBudget, sparks);
  return (a: Result, b: Result) => byRow({ r: a }, { r: b });
}

/** The same for table rows that carry a page's extras (the brand map's verdict, best offer). */
export function compareRows(key: SortKey, dir: 1 | -1, lineBudget: number, sparks?: Record<string, Sparks | null>) {
  return (a: { r: Result; x?: RowExtras }, b: { r: Result; x?: RowExtras }) => {
    const x = resultSortValue(a.r, key, lineBudget, sparks, a.x), y = resultSortValue(b.r, key, lineBudget, sparks, b.x);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return (x < y ? -1 : x > y ? 1 : 0) * dir;
  };
}

/**
 * A column's first-click direction: text A–Z (title, verdict pass first, why), the 90-day rank
 * best first (lowest), every other number highest first.
 */
export const firstResultDir = (key: SortKey): 1 | -1 => (["title", "verdict", "why", "rank90", "bsr", "gated", "supplier", "buy"].includes(key) ? 1 : -1);

/** Clicking a results header: a new column starts at its first direction; the same one flips. */
export const nextResultSort = (cur: { key: SortKey; dir: 1 | -1 }, key: SortKey): { key: SortKey; dir: 1 | -1 } =>
  ({ key, dir: cur.key === key ? (cur.dir === 1 ? -1 : 1) : firstResultDir(key) });

const SORT_KEYS: SortKey[] = ["score", "profit", "roi", "margin", "sell_price", "landed_cost", "hurdle_price", "title", "verdict", "sales", "sellers", "buybox", "share", "profitMo", "orderQty", "months", "rank90", "bb90", "why", "buy", "bsr", "gated", "maxLanded", "screened", "supplier"];

/** The results table's remembered sort (per table: "results", "favourites"), as every table stores it. */
export function loadResultSort(tableId: string): { key: SortKey; dir: 1 | -1 } {
  try {
    const s = typeof window === "undefined" ? null : parseStoredSort(localStorage.getItem(sortStorageKey(tableId)), SORT_KEYS);
    if (s) return { key: s.key as SortKey, dir: s.dir === "asc" ? 1 : -1 };
  } catch { /* storage off */ }
  return { key: "score", dir: -1 };
}

export function saveResultSort(tableId: string, s: { key: SortKey; dir: 1 | -1 }) {
  try { localStorage.setItem(sortStorageKey(tableId), JSON.stringify({ key: s.key, dir: s.dir === 1 ? "asc" : "desc" })); } catch { /* not remembered */ }
}
