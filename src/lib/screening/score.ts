/**
 * Win score: six weighted groups, each a weighted average of parameters scored 0–100
 * through editable piecewise-linear scales. Plus the band and the one-line "why".
 */
import { landedCost } from "../fees/engine";
import { GROUP_LABELS, SCALE_DEFS, type GroupId, type ProfileConfig, type Scale } from "./config";
import { isDormant, lastSeenLabel } from "./dormant";
import { profitPerMonth, yourShare } from "./sales";
import { monthsLabel } from "./order";
import { firstOrder, tierDisagreement, type GateRun, type ScreenContext } from "./gates";

export interface FitData {
  deliveryDays: number | null;
  supplierRating: number | null;
}

export interface ParamScore {
  key: string;
  value: number;
  score: number;
}

export interface GroupScore {
  group: GroupId;
  score: number | null;
  params: ParamScore[];
}

export interface WinScore {
  score: number | null;
  band: "green" | "amber" | "grey" | null;
  groups: Record<GroupId, GroupScore>;
  why: string;
}

/** Linear interpolation through the scale's points, clamped at the ends. */
export function applyScale(scale: Scale, x: number): number {
  const pts = [...scale.points].sort((a, b) => a[0] - b[0]);
  if (!pts.length) return 0;
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    if (x <= x1) return x1 === x0 ? y1 : y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return pts[pts.length - 1][1];
}

/** Raw parameter values for a screened row. null = not available, left out of its group. */
export function paramValues(ctx: ScreenContext, run: GateRun, p: ProfileConfig, fit: FitData): Record<string, number | null> {
  const m = ctx.market;
  const e = run.economics;
  const outcome = (id: string) => run.outcomes.find((o) => o.gate === id);
  const landed = landedCost(ctx.offer.unitCostGbp, { goodsVatRatePct: ctx.offer.goodsVatRatePct }, p.fees).total;
  const moq = Math.max(1, ctx.offer.moq ?? 1);
  const mirage = outcome("mirage");
  const compliance = outcome("compliance");
  const warnings = run.outcomes.filter((o) => o.status === "warn" && !["compliance", "mirage", "gating", "matchQuality"].includes(o.gate)).length;

  // Dormant (nobody selling now): demand from the past year, as a monthly rate.
  const dormant = isDormant(m);
  return {
    rankDrops: dormant ? (m!.rankDrops12m != null ? m!.rankDrops12m / 12 : null) : m?.rankDrops30d ?? null,
    avgRank: dormant ? m!.avgRank12m ?? null : m?.avgRank90d ?? m?.rankNow ?? null,
    rankTrend: m?.rankTrendPct12m ?? null,
    sellers: m?.fbaOffers ?? m?.offersNow ?? null,
    amazonAbsence: !m?.hasHistory ? null : m.amazonLastSeenDays ?? 10_000,
    topSellerShare: m?.topSellerBbSharePct ?? null,
    offerTrend: m?.offersNow != null && m.offers90dAgo ? (m.offersNow / m.offers90dAgo - 1) * 100 : null,
    priceVsMedian: m?.currentBuyBox != null && m.medianBuyBox12m ? (m.currentBuyBox / m.medianBuyBox12m - 1) * 100 : null,
    priceSlope: m?.bbSlopePctYr ?? null,
    volatility: m?.bbVolatilityPct ?? null,
    profit: e?.profit ?? null,
    profitPerMonth: profitPerMonth(yourShare(m).value, e?.profit ?? null),
    roi: e?.roi ?? null,
    margin: e?.margin ?? null,
    complianceFlags: compliance && compliance.status !== "off" ? run.ruleMatches.filter((r) => p.gates.compliance.rules[r.key] !== "off").length : null,
    mirage: mirage?.status === "warn" ? 1 : mirage?.status === "pass" ? 0 : null,
    gating: !ctx.restriction ? null
      : outcome("gating")?.tags?.includes("BRAND_APPROVED") ? 0
      : ({ open: 0, unknown: 1, approval_required: 2, blocked: 2 } as const)[ctx.restriction.status],
    brandLock: outcome("competition")?.tags?.includes("BRAND_DISTRIBUTOR") ? 1
      : m?.topSellerBbSharePct != null ? (m.topSellerBbSharePct >= 90 ? 1 : 0) : null,
    variations: ctx.product.variationCount ?? null,
    warnings,
    budgetShare: p.budget > 0 ? ((moq * landed) / p.budget) * 100 : null,
    moq,
    deliveryDays: fit.deliveryDays,
    supplierRating: fit.supplierRating,
  };
}

export function winScore(ctx: ScreenContext, run: GateRun, p: ProfileConfig, fit: FitData): WinScore {
  const values = paramValues(ctx, run, p, fit);
  const groups = Object.fromEntries(
    (Object.keys(GROUP_LABELS) as GroupId[]).map((g) => [g, { group: g, score: null, params: [] } as GroupScore]),
  ) as Record<GroupId, GroupScore>;

  for (const [key, def] of Object.entries(SCALE_DEFS)) {
    const v = values[key];
    const scale = p.score.scales[key];
    if (v == null || !Number.isFinite(v) || !scale || scale.weight <= 0) continue;
    groups[def.group].params.push({ key, value: v, score: applyScale(scale, v) });
  }
  for (const g of Object.values(groups)) {
    const w = g.params.reduce((a, x) => a + p.score.scales[x.key].weight, 0);
    g.score = w > 0 ? g.params.reduce((a, x) => a + x.score * p.score.scales[x.key].weight, 0) / w : null;
  }

  let totalW = 0, sum = 0;
  for (const g of Object.values(groups)) {
    const w = p.score.weights[g.group] ?? 0;
    if (g.score == null || w <= 0) continue;
    totalW += w;
    sum += g.score * w;
  }
  // A score needs a sell price (margin) and some demand signal; without them the other
  // groups alone would rank an unknown product highly.
  const missing = (["margin", "demand"] as GroupId[]).filter((g) => groups[g].score == null);
  const score = run.failedGate || totalW === 0 || missing.length ? null : Math.round((sum / totalW) * 10) / 10;
  let band: WinScore["band"] = score == null ? null : score >= p.score.bands.green ? "green" : score >= p.score.bands.amber ? "amber" : "grey";
  // One snapshot of rank and price isn't enough to order stock on: green needs history.
  const capped = band === "green" && !ctx.market?.hasHistory;
  if (capped) band = "amber";
  let why = whyLine(ctx, run, score, groups);
  if (capped) why = why.replace(/\.$/, "; held at amber until there's history.");
  const m = ctx.market;
  // Scored rows: the first order and how long it takes to sell at your share.
  const plan = score != null ? firstOrder(ctx, p, yourShare(m).value) : null;
  if (plan?.months != null) why = why.replace(/\.$/, `. First order ${plan.qty} units${plan.moqOverCap ? " (the MOQ, over the line cap)" : ""} sells in ${monthsLabel(plan.months)}.`);
  if (isDormant(m) && !run.failedGate) {
    const idle = m!.lastOfferDaysAgo != null ? `no seller for ${m!.lastOfferDaysAgo} days` : "no seller now";
    const priced = m!.lastBuyBox12m != null ? `; priced on the ${lastSeenLabel(m!.lastBuyBox12m, m!.lastBuyBoxAt)}` : "";
    why = `Dormant: ${idle}${priced}. ${why}`;
  }
  return { score, band, groups, why };
}

const money = (n: number) => `${n < 0 ? "-" : ""}£${Math.abs(n).toFixed(2)}`;
const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const count = (n: number) => (n >= 0 && n < WORDS.length && Number.isInteger(n) ? WORDS[n] : String(Math.round(n)));

function phrase(g: GroupScore, ctx: ScreenContext, run: GateRun, strong: boolean): string | null {
  const m = ctx.market;
  const val = (k: string) => g.params.find((x) => x.key === k)?.value;
  switch (g.group) {
    case "demand": {
      const drops = val("rankDrops"), rank = val("avgRank");
      const d = drops != null ? `${Math.round(drops)} drops/mo` : rank != null ? `rank ${Math.round(rank).toLocaleString("en-GB")}` : null;
      return d ? `${strong ? "strong" : "thin"} demand (${d})` : null;
    }
    case "competition": {
      const s = val("sellers");
      const bits = [s != null ? `${count(s)} seller${s === 1 ? "" : "s"}` : null];
      if (m?.hasHistory && m.amazonLastSeenDays == null) bits.push("no Amazon");
      if (!strong && m?.offersNow != null && m.offers90dAgo != null && m.offersNow > m.offers90dAgo) bits.push(`offers rising from ${m.offers90dAgo} to ${m.offersNow}`);
      if (!strong && m?.topSellerBbSharePct != null && m.topSellerBbSharePct > 70) bits.push(`one seller holds ${Math.round(m.topSellerBbSharePct)}% of the Buy Box`);
      const t = bits.filter(Boolean).join(", ");
      return t || null;
    }
    case "priceHealth": {
      const v = val("priceVsMedian"), slope = val("priceSlope");
      if (v == null && slope == null) return null;
      if (!strong && slope != null && slope < -10) return `price falling ${Math.round(-slope)}% a year`;
      if (v == null) return null;
      if (Math.abs(v) <= 5) return "price at median";
      return v > 0 ? `price ${Math.round(v)}% over median` : `price ${Math.round(-v)}% under median`;
    }
    case "margin": {
      const e = run.economics;
      return e?.margin != null ? `${Math.round(e.margin)}% margin (${money(e.profit!)} profit)` : null;
    }
    case "risk": {
      const flags = [
        ...run.ruleMatches.map((r) => r.name.toLowerCase()),
        ...run.outcomes.filter((o) => o.gate === "mirage" && o.status === "warn").map(() => "borrowed rank"),
      ].filter(Boolean);
      if (!flags.length) return strong ? "no compliance or gating flags" : null;
      return `flags: ${flags.join(", ")}`;
    }
    case "fit": {
      const share = val("budgetShare");
      return share != null ? `first order ${Math.round(share)}% of budget` : null;
    }
  }
}

/** One sentence from the highest and lowest groups, e.g. "82 — strong demand (140 drops/mo), … Watch: …". */
export function whyLine(ctx: ScreenContext, run: GateRun, score: number | null, groups: Record<GroupId, GroupScore>): string {
  if (run.failedGate) {
    const f = run.outcomes.find((o) => o.gate === run.failedGate)!;
    return `Failed ${f.label.toLowerCase()}: ${f.detail}`;
  }
  // Strong groups read in the plan's order (demand, competition, price, margin); risk and
  // fit only earn a mention when weak. The two weakest groups under 60 become "Watch".
  const scored = Object.values(groups).filter((g) => g.score != null);
  const top = (["demand", "competition", "priceHealth", "margin"] as GroupId[])
    .map((id) => groups[id])
    .filter((g) => g.score != null && g.score >= 60)
    .map((g) => phrase(g, ctx, run, true))
    .filter(Boolean);
  const weak = scored
    .filter((g) => g.score! < 60)
    .sort((a, b) => a.score! - b.score!)
    .slice(0, 2)
    .map((g) => phrase(g, ctx, run, false))
    .filter(Boolean);
  const warns = run.outcomes.filter((o) => o.status === "warn" && o.tags?.some((t) => ["APPROVAL", "SPIKE", "EROSION", "MULTI_ASIN", "BRAND_DISTRIBUTOR", "WAIVED", "PACK_MISMATCH", "AMAZON_DG"].includes(t)));
  const clash = run.outcomes.some((o) => o.tags?.includes("TIER_MISMATCH")) ? tierDisagreement(ctx) : null;

  if (score == null) {
    const need = [groups.margin.score == null ? "a sell price" : null, groups.demand.score == null ? "rank data" : null].filter(Boolean);
    let t = `Not scored: needs ${need.join(" and ") || "more data"}`;
    if (run.hurdlePrice != null) t += `. Clears the profit floors at ${money(run.hurdlePrice)} or more`;
    const w = run.outcomes.filter((o) => o.status === "warn").map((o) => o.detail);
    if (w.length) t += `. Watch: ${w.join("; ")}`;
    return t + ".";
  }
  const head = String(Math.round(score));
  let s = `${head} — ${top.length ? top.join(", ") : "nothing stands out"}`;
  const watch = [...weak, ...warns.map((w) => w.detail), ...(clash ? [clash] : [])];
  if (watch.length) s += `. Watch: ${watch.join("; ")}`;
  if (!ctx.market?.hasHistory) s += ". No Keepa history yet: mirage, Amazon and price-trend gates not checked";
  return s + ".";
}
