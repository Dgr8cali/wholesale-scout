/**
 * Calibration: how the app's predictions compare with what your purchases actually did, and
 * the correction to your-share it suggests. Pure.
 */
import type { Actuals } from "./actuals";
import type { Prediction } from "./tracker";

/** Purchases needed before a correction is suggested, and before it's called solid. */
export const MIN_FOR_SUGGESTION = 5;
export const SOLID_AT = 10;
/** A purchase counts once it's been live this long (or has sold out). */
export const MIN_DAYS_LIVE = 30;

export interface Measure {
  /** Actual ÷ predicted: the median, and the middle half's range. */
  median: number | null;
  low: number | null;
  high: number | null;
  n: number;
}

export interface Calibration {
  /** Purchases that count, and all purchases with actual figures. */
  eligible: number;
  withActuals: number;
  /** Your sales a month ÷ the app's uncorrected your-share. */
  share: Measure;
  price: Measure;
  fees: Measure;
  profit: Measure;
  /** The your-share factor it suggests (from the uncorrected estimate), when there are enough. */
  suggestedFactor: number | null;
  strength: "none" | "early" | "solid";
  /** The factor in force on the default profile. */
  currentFactor: number;
  /** Plain-words findings. */
  notes: string[];
}

export interface CalibrationItem { prediction: Prediction; actuals: Actuals | null; units: number }

function measure(ratios: number[]): Measure {
  const xs = ratios.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (!xs.length) return { median: null, low: null, high: null, n: 0 };
  const q = (p: number) => { const i = (xs.length - 1) * p; const lo = Math.floor(i), hi = Math.ceil(i); return xs[lo] + (xs[hi] - xs[lo]) * (i - lo); };
  const r = (x: number) => Math.round(x * 100) / 100;
  return { median: r(q(0.5)), low: r(q(0.25)), high: r(q(0.75)), n: xs.length };
}

const pct = (r: number) => `${Math.abs(Math.round((r - 1) * 100))}%`;

export function calibrate(items: CalibrationItem[], currentFactor = 1): Calibration {
  const withActuals = items.filter((i) => i.actuals && i.actuals.unitsSold > 0);
  const eligible = withActuals.filter((i) => i.actuals!.daysLive >= MIN_DAYS_LIVE || i.actuals!.unitsSold >= i.units);
  const ratio = (a: number | null | undefined, p: number | null | undefined) => (a != null && p != null && p > 0 ? a / p : NaN);
  // Against the raw estimate: a prediction made with a factor in force is divided back out.
  const share = measure(eligible.map((i) => ratio(i.actuals!.unitsPerMonth, i.prediction.sharePerMonth != null ? i.prediction.sharePerMonth / (i.prediction.shareFactor || 1) : null)));
  const price = measure(eligible.map((i) => ratio(i.actuals!.avgPrice, i.prediction.sellPrice)));
  const fees = measure(eligible.map((i) => ratio(i.actuals!.feesPerUnit, i.prediction.feesPerUnit)));
  const profit = measure(eligible.map((i) => ratio(i.actuals!.profitPerUnit, i.prediction.profitPerUnit)));
  const strength = share.n >= SOLID_AT ? "solid" : share.n >= MIN_FOR_SUGGESTION ? "early" : "none";
  const suggestedFactor = strength !== "none" && share.median != null ? Math.min(2, Math.max(0.3, Math.round(share.median * 20) / 20)) : null;

  const notes: string[] = [];
  if (share.median != null && share.n >= 3) {
    notes.push(share.median < 0.95 ? `You sell ${pct(share.median)} fewer a month than the app's your-share estimate (median of ${share.n}).`
      : share.median > 1.05 ? `You sell ${pct(share.median)} more a month than the app's your-share estimate (median of ${share.n}).`
      : `Your sales a month match the your-share estimate (median of ${share.n}).`);
    if (share.low != null && share.high != null && share.high / share.low > 2) notes.push("They vary a lot from product to product, so treat a single prediction with care.");
  }
  if (price.median != null && price.n >= 3 && Math.abs(price.median - 1) > 0.03) notes.push(`You sell ${pct(price.median)} ${price.median < 1 ? "below" : "above"} the predicted price: ${price.median < 1 ? "consider scoring on the lower of current and median, or a tighter price band" : "the price estimate is cautious"}.`);
  if (fees.median != null && fees.n >= 3 && Math.abs(fees.median - 1) > 0.05) notes.push(`Amazon's fees come out ${pct(fees.median)} ${fees.median > 1 ? "higher" : "lower"} than predicted: check the products' dimensions and size tiers.`);
  if (!eligible.length) notes.push(`Nothing to learn from yet: a purchase counts once it has been live ${MIN_DAYS_LIVE} days or has sold out.`);
  else if (strength === "none") notes.push(`${eligible.length} purchase${eligible.length === 1 ? "" : "s"} so far; a correction is suggested from ${MIN_FOR_SUGGESTION}, and is solid from ${SOLID_AT}.`);

  return { eligible: eligible.length, withActuals: withActuals.length, share, price, fees, profit, suggestedFactor, strength, currentFactor, notes };
}
