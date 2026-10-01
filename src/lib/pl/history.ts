/**
 * Gate 2's history questions answered from a year of Keepa series: is the sales rank growing,
 * flat, seasonal or a spike/decline; is the new-offer count climbing; is the Buy Box sliding.
 * Pure; each answer comes with the figures behind it.
 */
import { median } from "../format";
import type { Point } from "../keepa/types";

const DAY = 86_400_000;

/** Value in force at t (series are step functions), or null in a gap. */
function valueAt(series: Point[], t: number): number | null {
  let v: number | null = null;
  for (const [ts, x] of series) {
    if (ts > t) break;
    v = Number.isFinite(x) && x > 0 ? x : null;
  }
  return v;
}

function daily(series: Point[], from: number, to: number): number[] {
  const out: number[] = [];
  for (let t = from; t <= to; t += DAY) {
    const v = valueAt(series, t);
    if (v != null) out.push(v);
  }
  return out;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export type RankTrend = "0" | "1" | "2" | "3";
export interface RankTrendResult { value: RankTrend | null; why: string; months: number[] }

/**
 * Twelve 30-day buckets of the daily rank (oldest first; a bucket needs 10 days of rank).
 * A month over 5× the median rank is left out (out of stock, or before the listing sold), and said.
 * On log rank (lower is better):
 *  - Spike: exactly one month far better than the rest (under 40% of the median rank).
 *  - Seasonal: months swing widely (standard deviation of log rank over 0.2, about ±60%)
 *    without a straight-line trend explaining it (R² under 0.5).
 *  - Decline: the last three months' rank over 1.5× the first three's.
 *  - Growing: under 0.67× (a third better).
 *  - Flat otherwise. Fewer than six usable months: no answer.
 */
export function rankTrend(rank: Point[], now: number): RankTrendResult {
  const all: number[] = [];
  for (let k = 11; k >= 0; k--) {
    const to = now - k * 30 * DAY, from = to - 30 * DAY + DAY;
    const d = daily(rank, from, to);
    if (d.length >= 10) all.push(Math.round(mean(d)));
  }
  const allMed = median(all) ?? 0;
  const months = all.filter((m) => m <= allMed * 5);
  const left = all.length - months.length;
  const leftOut = left ? ` (${left} month${left === 1 ? "" : "s"} over 5× the median left out: out of stock or not yet selling)` : "";
  if (months.length < 6) return { value: null, why: `Only ${months.length} usable month${months.length === 1 ? "" : "s"} of rank history${leftOut}`, months: all };
  const med = median(months)!;
  const spikes = months.filter((m) => m < 0.4 * med).length;
  if (spikes === 1) return { value: "0", why: `One month at under 40% of the median rank (${med.toLocaleString("en-GB")}): a spike${leftOut}`, months: all };

  const logs = months.map((m) => Math.log10(m));
  const n = logs.length, mx = (n - 1) / 2, my = mean(logs);
  let sxy = 0, sxx = 0, syy = 0;
  logs.forEach((y, x) => { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; });
  const r2 = syy ? (sxy * sxy) / (sxx * syy) : 0;
  const sd = Math.sqrt(syy / n);
  const first = mean(months.slice(0, 3)), last = mean(months.slice(-3));
  const ratio = last / first;
  const figures = `last 3 months ${Math.round(last).toLocaleString("en-GB")} vs first 3 ${Math.round(first).toLocaleString("en-GB")}`;
  if (sd > 0.2 && r2 < 0.5) return { value: "1", why: `Months swing widely without a trend (spread ${sd.toFixed(2)} log, R² ${r2.toFixed(2)}): seasonal${leftOut}`, months: all };
  if (ratio > 1.5) return { value: "0", why: `Rank worsening: ${figures}${leftOut}`, months: all };
  if (ratio < 0.67) return { value: "3", why: `Rank improving: ${figures}${leftOut}`, months: all };
  return { value: "2", why: `Within a third either way: ${figures}${leftOut}`, months: all };
}

export interface TrendResult<T extends string> { value: T | null; why: string }

/** New-offer count: climbing when the last 90 days average 1.5× the first 90 of the year and at least 2 more. */
export function offerTrend(offerCount: Point[], now: number): TrendResult<"steady" | "climbing"> {
  const yearAgo = now - 365 * DAY;
  const first = daily(offerCount, yearAgo, yearAgo + 89 * DAY), last = daily(offerCount, now - 89 * DAY, now);
  if (!first.length || !last.length) return { value: null, why: "Not enough offer-count history" };
  const a = mean(first), b = mean(last);
  const why = `${b.toFixed(1)} offers in the last 90 days vs ${a.toFixed(1)} a year ago`;
  return { value: b >= a * 1.5 && b - a >= 2 ? "climbing" : "steady", why };
}

/** Buy Box: sliding when the last 90 days' median is under 90% of the first 90 days' of the year. */
export function bbTrend(buyBox: Point[], now: number): TrendResult<"holds" | "sliding"> {
  const yearAgo = now - 365 * DAY;
  const first = daily(buyBox, yearAgo, yearAgo + 89 * DAY), last = daily(buyBox, now - 89 * DAY, now);
  if (first.length < 20 || last.length < 20) return { value: null, why: "Not enough Buy Box history" };
  const a = median(first)!, b = median(last)!;
  const why = `£${b.toFixed(2)} median in the last 90 days vs £${a.toFixed(2)} a year ago`;
  return { value: b < a * 0.9 ? "sliding" : "holds", why };
}
