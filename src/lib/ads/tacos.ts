/**
 * TACoS mode and listing health. Pure.
 *
 * TACoS = ad spend ÷ all sales (ads and organic). A product that sells mostly organically can afford
 * ads over its break-even ACoS: the ad spend is paid for by the margin on every unit sold. Break-even
 * TACoS = margin ÷ price (the whole margin of every unit, organic and ad, goes on ads). The bid rules
 * still see keywords' ACoS, so a target TACoS becomes an ACoS target: target TACoS ÷ the ad share of
 * sales (ad sales ÷ all sales), capped at 100%.
 */

export type Optimise = "acos" | "tacos";

export interface SalesSplit { adUnits: number; totalUnits: number | null; adSales: number; totalSales: number | null }

/** Organic units = all units − ad units (never below 0); null without the orders sync. */
export function organicShare(s: SalesSplit): number | null {
  if (s.totalUnits == null || s.totalUnits <= 0) return null;
  return Math.max(0, s.totalUnits - s.adUnits) / s.totalUnits;
}

export const breakEvenTacos = (margin: number | null, price: number | null) => (margin != null && price ? Math.max(0, margin / price) : null);

/** The ACoS a target TACoS allows at this ad share of sales; capped at 100%. */
export function acosForTacos(targetTacos: number, s: SalesSplit): { acos: number; adShare: number | null; capped: boolean } {
  const adShare = s.totalSales && s.totalSales > 0 ? Math.min(1, s.adSales / s.totalSales) : null;
  if (!adShare) return { acos: targetTacos, adShare: null, capped: false };
  const raw = targetTacos / adShare;
  return { acos: Math.min(1, raw), adShare, capped: raw > 1 };
}

/** Suggest TACoS mode: mostly organic (over 50%) for 30 days, and 30+ reviews. */
export function suggestTacos(share30: number | null, reviews: number | null): boolean {
  return share30 != null && share30 > 0.5 && reviews != null && reviews >= 30;
}

/* ===================== listing health ===================== */

export const DEFAULT_CTR_BENCHMARK = 0.004;
export const HEALTH_MIN_CLICKS = 100;
export const HEALTH_RATIO = 0.6;

export interface Health {
  status: "ok" | "problem" | "not enough data";
  ctr: number | null; cvr: number | null; ctrBenchmark: number; cvrBenchmark: number | null;
  cvrSource: string; clicks: number; problems: ("ctr" | "cvr")[]; message: string;
}

const p2 = (v: number) => `${(v * 100).toFixed(2)}%`;
const p1 = (v: number) => `${(v * 100).toFixed(1)}%`;

/**
 * The listing's ad CTR and CVR against its niche: CVR from the private-label candidate's Gate 3
 * search conversion when linked, else the account's median; CTR 0.4% (editable). Under 60% of either:
 * likely a listing problem (images, price, title), not a bidding one.
 */
export function listingHealth(x: { impressions: number | null; clicks: number; orders: number; period: string }, b: { ctr: number; cvr: number | null; cvrSource: string }): Health {
  const ctr = x.impressions ? x.clicks / x.impressions : null;
  const cvr = x.clicks ? x.orders / x.clicks : null;
  const base = { ctr, cvr, ctrBenchmark: b.ctr, cvrBenchmark: b.cvr, cvrSource: b.cvrSource, clicks: x.clicks };
  if (x.clicks < HEALTH_MIN_CLICKS) return { ...base, status: "not enough data", problems: [], message: `${x.clicks} clicks ${x.period}: listing health needs ${HEALTH_MIN_CLICKS}+` };
  const problems: ("ctr" | "cvr")[] = [];
  if (ctr != null && ctr < b.ctr * HEALTH_RATIO) problems.push("ctr");
  if (cvr != null && b.cvr != null && cvr < b.cvr * HEALTH_RATIO) problems.push("cvr");
  const parts = [
    ctr != null ? `CTR ${p2(ctr)} vs ${p2(b.ctr)} benchmark ${problems.includes("ctr") ? "(low)" : "ok"}` : "CTR — (no impressions)",
    cvr != null ? `CVR ${p1(cvr)} vs ${b.cvr != null ? `${p1(b.cvr)} ${b.cvrSource}` : "no benchmark"} ${problems.includes("cvr") ? "(low)" : b.cvr != null ? "ok" : ""}`.trim() : "CVR —",
  ];
  return {
    ...base, status: problems.length ? "problem" : "ok", problems,
    message: `${parts.join(" · ")} ${x.period}.${problems.length ? " Likely a listing problem, not a bidding one — fix images/price/title before raising bids." : ""}`,
  };
}

/** The middle value (the account median CVR across products). */
export function median(xs: number[]): number | null {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
