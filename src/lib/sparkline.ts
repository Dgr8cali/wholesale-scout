/** Stored Keepa series ([unix ms, value], a step function; null or non-finite = no value) as a few points for a sparkline. */
export type SeriesPoint = [number, number | null];

const DAY = 86_400_000;

/**
 * The value in force at `samples` evenly spaced moments over the last `days` days, oldest
 * first. A moment with no value (no data yet, out of stock) is null. All null: no data.
 */
export function sampleSeries(series: SeriesPoint[] | null | undefined, now: number, days = 90, samples = 30): (number | null)[] | null {
  if (!series?.length) return null;
  const pts = [...series].sort((a, b) => a[0] - b[0]);
  const from = now - days * DAY;
  const out: (number | null)[] = [];
  let i = 0;
  let cur: number | null = null;
  for (let s = 0; s < samples; s++) {
    const t = from + ((now - from) * s) / (samples - 1);
    while (i < pts.length && pts[i][0] <= t) {
      const v = pts[i][1];
      cur = v != null && Number.isFinite(v) && v >= 0 ? v : null;
      i++;
    }
    out.push(cur);
  }
  return out.some((v) => v != null) ? out : null;
}

/** 90-day sparklines for one ASIN: sales rank (lower is better) and Buy Box price (GBP). */
export interface Sparks { rank: (number | null)[] | null; buyBox: (number | null)[] | null }
