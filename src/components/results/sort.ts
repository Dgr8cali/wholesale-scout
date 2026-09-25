import { firstOrderFigures } from "@/lib/ui/metrics";
import { figure, listingMoq, titleOf, type Result, type SortKey } from "./types";

/** A result's value for a sort column, as the results table sorts it (null sorts last). */
export function resultSortValue(r: Result, key: SortKey, lineBudget: number): number | string | null {
  if (key === "title") return titleOf(r).toLowerCase();
  if (key === "verdict") return ({ pass: 0, warn: 1, fail: 2 } as const)[r.verdict ?? "fail"];
  if (key === "sales" || key === "sellers" || key === "buybox" || key === "share" || key === "profitMo") return figure(r, key).value;
  if (key === "orderQty" || key === "months") {
    return r.score == null ? null : firstOrderFigures(r.inputs?.market, r.landed_cost, listingMoq(r), lineBudget)[key === "orderQty" ? "qty" : "months"].value;
  }
  return (r[key] as number | null) ?? null;
}

/** A comparator for resultSortValue, nulls last whichever way. */
export function compareResults(key: SortKey, dir: 1 | -1, lineBudget: number) {
  return (a: Result, b: Result) => {
    const x = resultSortValue(a, key, lineBudget), y = resultSortValue(b, key, lineBudget);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return (x < y ? -1 : x > y ? 1 : 0) * dir;
  };
}
