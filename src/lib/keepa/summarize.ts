/**
 * Keepa series decoding and the summary the gates score on.
 * Pure — tested on synthetic series.
 */
import type { KeepaSummary, Point } from "./types";

const DAY = 86_400_000;

/** Keepa minutes → unix ms. */
export const keepaTimeToMs = (t: number) => (t + 21_564_000) * 60_000;

/**
 * Decode a Keepa csv array. Plain series are [t, v, t, v, ...]; price+shipping series
 * (Buy Box) are [t, price, shipping, ...]. -1 means no offer / no data and is dropped.
 * Prices come in pence and are returned in pounds when `pence` is set.
 */
export function decodeSeries(csv: number[] | null | undefined, opts: { withShipping?: boolean; pence?: boolean } = {}): Point[] {
  if (!csv) return [];
  const stride = opts.withShipping ? 3 : 2;
  const out: Point[] = [];
  for (let i = 0; i + stride - 1 < csv.length; i += stride) {
    const t = keepaTimeToMs(csv[i]);
    let v = csv[i + 1];
    if (v < 0) {
      out.push([t, NaN]);
      continue;
    }
    if (opts.withShipping) v += Math.max(0, csv[i + 2]);
    out.push([t, opts.pence ? v / 100 : v]);
  }
  return out;
}

const valid = (s: Point[]) => s.filter(([, v]) => Number.isFinite(v));

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Value in force at time t (step function), or null. */
export function valueAt(series: Point[], t: number): number | null {
  let v: number | null = null;
  for (const [ts, x] of series) {
    if (ts > t) break;
    v = Number.isFinite(x) ? x : null;
  }
  return v;
}

/** Daily samples of a step series between from and to (inclusive), skipping gaps. */
export function daily(series: Point[], from: number, to: number): number[] {
  const out: number[] = [];
  for (let t = from; t <= to; t += DAY) {
    const v = valueAt(series, t);
    if (v != null) out.push(v);
  }
  return out;
}

/** Daily samples as [days since `from`, value], skipping days with no value. */
export function dailyPoints(series: Point[], from: number, to: number): [number, number][] {
  const out: [number, number][] = [];
  for (let t = from, d = 0; t <= to; t += DAY, d++) {
    const v = valueAt(series, t);
    if (v != null) out.push([d, v]);
  }
  return out;
}

/**
 * The part of a series the gates read, for storage: points from `since` on, plus the
 * point in force at `since` (series are step functions). Full Keepa histories run to
 * hundreds of KB per ASIN; a year and a quarter is a small fraction of that.
 */
export function trimSeries(series: Point[], since: number): Point[] {
  const i = series.findIndex(([t]) => t >= since);
  if (i === -1) return series.length ? [series[series.length - 1]] : [];
  return i > 0 ? series.slice(i - 1) : series;
}

/** Count of rank improvements (a sale, roughly) inside the window. */
export function rankDrops(rank: Point[], from: number, to: number): number {
  const pts = valid(rank).filter(([t]) => t >= from - DAY && t <= to);
  let drops = 0;
  for (let i = 1; i < pts.length; i++) if (pts[i][0] >= from && pts[i][1] < pts[i - 1][1]) drops++;
  return drops;
}

function mean(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/** Least-squares slope of daily values, per year, as % of `base`. */
/**
 * Least-squares slope per year as % of `base`, on real day positions (gaps stay gaps).
 * Needs 60 priced days spanning at least 90, or a few points would extrapolate wildly.
 */
function slopePctPerYear(points: [number, number][], base: number | null): number | null {
  if (points.length < 60 || !base || points[points.length - 1][0] - points[0][0] < 90) return null;
  const n = points.length;
  const mx = points.reduce((a, [x]) => a + x, 0) / n;
  const my = points.reduce((a, [, y]) => a + y, 0) / n;
  let num = 0, den = 0;
  for (const [x, y] of points) {
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  }
  return den ? ((num / den) * 365 / base) * 100 : null;
}

export interface SummaryInput {
  now: number;
  rank: Point[];
  buyBox: Point[];
  offerCount: Point[];
  fbaOfferCount?: number | null;
  amazon: Point[];
  reviewCount: Point[];
  /** Buy Box seller history: [unix ms, sellerId]. */
  buyBoxSellers?: [number, string][];
  /** First data point of the variation parent, when this ASIN is a child. */
  parentFirstSeen?: number | null;
  /** Amazon's "bought in past month", from Keepa's monthlySold. */
  monthlySold?: number | null;
}

export function summarize(i: SummaryInput): KeepaSummary {
  const { now } = i;
  const yearAgo = now - 365 * DAY;
  const firstPoint = Math.min(...[i.rank, i.buyBox, i.offerCount].map((s) => valid(s)[0]?.[0] ?? Infinity));
  const historyDays = Number.isFinite(firstPoint) ? Math.floor((now - firstPoint) / DAY) : null;

  const bbPoints = dailyPoints(i.buyBox, yearAgo, now);
  const bbDaily = bbPoints.map(([, v]) => v);
  const medianBuyBox12m = median(bbDaily);
  const bbMean = mean(bbDaily);
  const bbSd = bbMean == null ? null : Math.sqrt(bbDaily.reduce((a, v) => a + (v - bbMean) ** 2, 0) / bbDaily.length);

  const avgRank90d = mean(daily(i.rank, now - 90 * DAY, now));
  const avgRank90dYearAgo = mean(daily(i.rank, yearAgo - 90 * DAY, yearAgo));

  // Amazon holds an offer from each valid price point until the next point.
  let amazonLastSeenDays: number | null = null;
  for (let k = i.amazon.length - 1; k >= 0; k--) {
    if (Number.isFinite(i.amazon[k][1])) {
      const until = k + 1 < i.amazon.length ? i.amazon[k + 1][0] : now;
      amazonLastSeenDays = Math.max(0, Math.floor((now - until) / DAY));
      break;
    }
  }

  // Buy Box share by seller over the last year, by time held.
  let topSellerBbSharePct: number | null = null;
  let topSellers: { sellerId: string; sharePct: number }[] = [];
  if (i.buyBoxSellers?.length) {
    const held = new Map<string, number>();
    const s = i.buyBoxSellers;
    for (let k = 0; k < s.length; k++) {
      const start = Math.max(s[k][0], yearAgo);
      const end = k + 1 < s.length ? s[k + 1][0] : now;
      if (end <= start || !s[k][1] || s[k][1] === "-1" || s[k][1] === "-2") continue;
      held.set(s[k][1], (held.get(s[k][1]) ?? 0) + (end - start));
    }
    const total = [...held.values()].reduce((a, b) => a + b, 0);
    if (total > 0) {
      topSellerBbSharePct = (Math.max(...held.values()) / total) * 100;
      topSellers = [...held.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(([sellerId, ms]) => ({ sellerId, sharePct: Math.round((ms / total) * 1000) / 10 }));
    }
  }

  // Review count: biggest one-day jump.
  let reviewJumpPct: number | null = null;
  const rc = valid(i.reviewCount);
  for (let k = 1; k < rc.length; k++) {
    const [t0, a] = rc[k - 1];
    const [t1, b] = rc[k];
    if (a > 0 && t1 - t0 <= 1.5 * DAY) reviewJumpPct = Math.max(reviewJumpPct ?? 0, ((b - a) / a) * 100);
  }

  return {
    historyDays,
    rankNow: valueAt(i.rank, now),
    rankDrops30d: valid(i.rank).length ? rankDrops(i.rank, now - 30 * DAY, now) : null,
    monthlySold: i.monthlySold != null && i.monthlySold > 0 ? i.monthlySold : null,
    avgRank90d: avgRank90d == null ? null : Math.round(avgRank90d),
    rankTrendPct12m: avgRank90d != null && avgRank90dYearAgo ? ((avgRank90d - avgRank90dYearAgo) / avgRank90dYearAgo) * 100 : null,
    currentBuyBox: valueAt(i.buyBox, now),
    medianBuyBox12m,
    bbSlopePctYr: slopePctPerYear(bbPoints, medianBuyBox12m),
    bbVolatilityPct: bbSd != null && bbMean ? (bbSd / bbMean) * 100 : null,
    offersNow: valueAt(i.offerCount, now),
    offers90dAgo: valueAt(i.offerCount, now - 90 * DAY),
    // Keepa uses negative numbers for "not collected".
    fbaOffers: i.fbaOfferCount != null && i.fbaOfferCount >= 0 ? i.fbaOfferCount : null,
    amazonLastSeenDays,
    topSellerBbSharePct,
    topSellers,
    reviewJumpPct,
    youngerThanParent: i.parentFirstSeen == null || !Number.isFinite(firstPoint) ? null : firstPoint > i.parentFirstSeen + 30 * DAY,
  };
}
