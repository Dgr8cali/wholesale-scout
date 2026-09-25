/**
 * The first order for a line, and how long it takes to sell. The order is what the line's
 * share of the budget buys at the landed cost (whole units), raised to the supplier's MOQ
 * when that's larger (flagged: the MOQ alone is over the line cap). Months to sell is that
 * order divided by your share of sales a month.
 */
export interface OrderPlan {
  qty: number;
  /** Units the line cap buys at the landed cost. */
  capUnits: number;
  /** The MOQ is larger than the line cap buys: the order is the MOQ. */
  moqOverCap: boolean;
  /** null without a share figure; Infinity when your share is 0. */
  months: number | null;
}

export function orderPlan(x: { lineCapGbp: number; landedGbp: number | null; moq: number | null; sharePerMonth: number | null }): OrderPlan | null {
  if (x.landedGbp == null || !(x.landedGbp > 0)) return null;
  const capUnits = Math.max(0, Math.floor(x.lineCapGbp / x.landedGbp));
  const moq = x.moq != null && x.moq > 0 ? x.moq : null;
  const moqOverCap = moq != null && moq > capUnits;
  const qty = moqOverCap ? moq : Math.max(1, capUnits);
  const months = x.sharePerMonth == null ? null : x.sharePerMonth <= 0 ? Infinity : qty / x.sharePerMonth;
  return { qty, capUnits, moqOverCap, months };
}

/** "8 months", "2.1 months", "under a week" */
export function monthsLabel(m: number): string {
  if (!Number.isFinite(m)) return "never at your share";
  if (m < 0.25) return "under a week";
  return `${m < 10 ? m.toFixed(1).replace(/\.0$/, "") : Math.round(m)} month${m === 1 ? "" : "s"}`;
}

/** Largest single-item volume in a product's text, in ml ("2 x 250ml" is 250). null when none. */
export function volumeMl(text: string): number | null {
  let best: number | null = null;
  const re = /(\d+(?:[.,]\d+)?)\s?(ml|millilit(?:re|er)s?|cl|l|ltr|litres?|liters?)\b/gi;
  for (const m of text.matchAll(re)) {
    const n = Number(m[1].replace(",", "."));
    const unit = m[2].toLowerCase();
    const ml = unit.startsWith("m") ? n : unit === "cl" ? n * 10 : n * 1000;
    if (Number.isFinite(ml)) best = Math.max(best ?? 0, ml);
  }
  return best;
}
