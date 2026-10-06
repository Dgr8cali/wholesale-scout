/**
 * Gate 4's review boxes: one for every ASIN on the candidate, in its order (no cap), then one for
 * each ASIN with saved reviews that isn't on it: removed from the candidate (its reviews kept),
 * received from the extension and waiting for you to add it or keep it separate, or kept separate.
 * Pure.
 */

export type ReviewBoxState = "on" | "removed" | "pending" | "separate";
export interface ReviewBox { asin: string; brand: string | null; state: ReviewBoxState }

export function reviewBoxes(
  asins: { asin: string; brand?: string | null }[],
  dumps: { asin: string; removed_at?: string | null; kept_separate?: boolean | null }[],
): ReviewBox[] {
  const on = new Set(asins.map((a) => a.asin));
  const out: ReviewBox[] = asins.map((a) => ({ asin: a.asin, brand: a.brand ?? null, state: "on" }));
  for (const d of dumps) {
    if (on.has(d.asin)) continue;
    on.add(d.asin);
    out.push({ asin: d.asin, brand: null, state: d.kept_separate ? "separate" : d.removed_at ? "removed" : "pending" });
  }
  return out;
}
