/**
 * The twelve screening gates. Pure: each reads a ScreenContext and returns an outcome.
 * A gate whose data isn't available (no Keepa yet, no price) is "skipped", never failed.
 */
import {
  economics,
  hurdlePrice,
  landedCost,
  type AmazonFeeOverride,
  type Dims,
  type Economics,
} from "../fees/engine";
import type { RateCard } from "../fees/rateCard";
import { applyLinks, approvalKind } from "../spapi/parse";
import type { RestrictionLink, RestrictionStatus } from "../spapi/types";
import { GATE_LABELS, GATE_ORDER, type GateId, type GateMode, type ProfileConfig } from "./config";
import { doubtfulMatch, type Listing } from "./match";
import { matchRules, type CategoryRule, type RuleMatch } from "./rules";

export type GateStatus = "pass" | "warn" | "fail" | "skipped" | "off";

export interface GateOutcome {
  gate: GateId;
  label: string;
  status: GateStatus;
  /** Plain-English reason, shown in the results "why" filter. */
  detail: string;
  /** Short machine tags, e.g. SPIKE, EROSION, MULTI_ASIN. */
  tags?: string[];
  /** Gating: Amazon's links for requesting approval, shown as "Apply on Amazon". */
  links?: RestrictionLink[];
}

/** Market data, from Keepa history when available, else SP-API's current snapshot. */
export interface MarketData {
  hasHistory: boolean;
  historyDays: number | null;
  rankNow: number | null;
  rankDrops30d: number | null;
  avgRank90d: number | null;
  rankTrendPct12m: number | null;
  currentBuyBox: number | null;
  medianBuyBox12m: number | null;
  bbSlopePctYr: number | null;
  bbVolatilityPct: number | null;
  offersNow: number | null;
  offers90dAgo: number | null;
  fbaOffers: number | null;
  amazonLastSeenDays: number | null;
  topSellerBbSharePct: number | null;
  reviewJumpPct: number | null;
  youngerThanParent: boolean | null;
}

export interface ScreenContext {
  now: Date;
  card: RateCard;
  rules: CategoryRule[];
  /** Row's own text: product name, brand, supplier category. */
  text: string;
  /** The sheet line's own brand and name, and the matched Amazon listing's. */
  sheet?: Listing;
  listing?: Listing;
  amazonCategory: string | null;
  offer: {
    unitCostGbp: number;
    moq: number | null;
    goodsVatRatePct: number;
    supplierMovGbp: number | null;
  };
  /** Null until the EAN has been looked up. `note` explains a miss (what was tried). */
  match: { asin: string | null; asinCount: number; looked: boolean; note?: string } | null;
  product: {
    brand?: string | null;
    referralCategory: string | null;
    dimsCm: Dims | null;
    weightG: number | null;
    variationCount: number | null;
    hazmat: string[];
  };
  market: MarketData | null;
  /** A brand you've recorded as approved on the Brands page, with the date. */
  brandApproval?: { status: "approved"; date: string | null } | null;
  /** `links` is undefined for restrictions checked before links were kept. */
  restriction: { status: RestrictionStatus; message: string; links?: RestrictionLink[] } | null;
  amazonFees: AmazonFeeOverride | null;
}

export interface GateRun {
  outcomes: GateOutcome[];
  /** First gate that failed in fail mode, if any. Evaluation stops there. */
  failedGate: GateId | null;
  scoringPrice: number | null;
  priceSource: string | null;
  economics: Economics | null;
  hurdlePrice: number | null;
  ruleMatches: RuleMatch[];
}

const money = (n: number) => `${n < 0 ? "-" : ""}£${Math.abs(n).toFixed(2)}`;
const pct = (n: number) => `${Math.round(n)}%`;

/** Status for a failed check under a gate mode. */
const failAs = (mode: GateMode): GateStatus => (mode === "fail" ? "fail" : "warn");

/** The price the fee gate and score use, per the profile rule. */
export function scoringPrice(m: MarketData | null, rule: ProfileConfig["scoringPrice"]): { price: number | null; source: string | null } {
  if (!m) return { price: null, source: null };
  const cur = m.currentBuyBox, med = m.medianBuyBox12m;
  if (rule === "current") return cur != null ? { price: cur, source: "current Buy Box" } : med != null ? { price: med, source: "12-month median" } : { price: null, source: null };
  if (rule === "median") return med != null ? { price: med, source: "12-month median" } : cur != null ? { price: cur, source: "current Buy Box (no history)" } : { price: null, source: null };
  if (cur != null && med != null) return cur <= med ? { price: cur, source: "current Buy Box" } : { price: med, source: "12-month median" };
  if (cur != null) return { price: cur, source: "current Buy Box (no history)" };
  if (med != null) return { price: med, source: "12-month median" };
  return { price: null, source: null };
}

/**
 * Scoring price including the spike rule: when the Buy Box is more than the spike
 * tolerance over its median with offers falling, score on the median whatever the rule.
 */
export function resolveScoringPrice(m: MarketData | null, p: ProfileConfig): { price: number | null; source: string | null } {
  const base = scoringPrice(m, p.scoringPrice);
  if (
    m?.hasHistory && m.currentBuyBox != null && m.medianBuyBox12m != null && p.gates.priceRegime.mode !== "off" &&
    (m.currentBuyBox / m.medianBuyBox12m - 1) * 100 > p.gates.priceRegime.spikePct &&
    m.offersNow != null && m.offers90dAgo != null && m.offersNow < m.offers90dAgo
  ) {
    return { price: m.medianBuyBox12m, source: "12-month median (spike)" };
  }
  return base;
}

type Evaluator = (ctx: ScreenContext, p: ProfileConfig, run: GateRun) => Omit<GateOutcome, "gate" | "label">;

const skipped = (detail: string) => ({ status: "skipped" as const, detail });

const EVALUATORS: Record<GateId, Evaluator> = {
  priceBand(ctx, p, run) {
    const g = p.gates.priceBand;
    if (run.scoringPrice == null) return skipped("No sell price yet");
    const x = run.scoringPrice;
    if (x < g.min) return { status: failAs(g.mode), detail: `Sells at ${money(x)}, under the ${money(g.min)} floor` };
    if (x > g.max) return { status: failAs(g.mode), detail: `Sells at ${money(x)}, over the ${money(g.max)} ceiling` };
    return { status: "pass", detail: `${money(x)} is inside ${money(g.min)}–${money(g.max)}` };
  },

  compliance(ctx, p, run) {
    const g = p.gates.compliance;
    const matches = matchRules(ctx.rules, ctx.text, ctx.amazonCategory);
    for (const h of ctx.product.hazmat) {
      if (!matches.some((m) => m.key === "fragrance" || m.key === "aerosol" || m.key === "chemical")) {
        matches.push({ key: "chemical", name: "Declared hazmat", hit: `Amazon lists ${h} regulation` });
      }
    }
    run.ruleMatches = matches;
    const active = matches.filter((m) => (g.rules[m.key] ?? "warn") !== "off");
    if (!active.length) return { status: "pass", detail: "No compliance rule matched" };
    const worst = active.some((m) => g.rules[m.key] === "fail") ? "fail" : "warn";
    const status: GateStatus = g.mode === "fail" && worst === "fail" ? "fail" : "warn";
    return {
      status,
      detail: active.map((m) => `${m.name} (${m.hit})`).join("; "),
      tags: active.map((m) => m.key.toUpperCase()),
    };
  },

  budgetFit(ctx, p) {
    const g = p.gates.budgetFit;
    const landed = landedCost(ctx.offer.unitCostGbp, { goodsVatRatePct: ctx.offer.goodsVatRatePct }, p.fees).total;
    const moq = Math.max(1, ctx.offer.moq ?? 1);
    const order = moq * landed;
    const cap = (p.budget * g.maxLineSharePct) / 100;
    if (order > cap) return { status: failAs(g.mode), detail: `MOQ ${moq} × ${money(landed)} = ${money(order)}, over the ${money(cap)} line cap` };
    if (ctx.offer.supplierMovGbp != null && ctx.offer.supplierMovGbp > p.budget) {
      return { status: failAs(g.mode), detail: `Supplier minimum order ${money(ctx.offer.supplierMovGbp)} is over the ${money(p.budget)} budget` };
    }
    return { status: "pass", detail: `First order ${money(order)} of ${money(p.budget)}` };
  },

  matchQuality(ctx, p) {
    const g = p.gates.matchQuality;
    if (!ctx.match || !ctx.match.looked) return skipped("Not looked up yet");
    if (!ctx.match.asin) {
      return { status: failAs(g.mode), detail: `EAN didn't resolve to an Amazon UK listing${ctx.match.note ? `: ${ctx.match.note}` : ""}` };
    }
    if (ctx.match.asinCount > 1) {
      // Several listings on one EAN: drop one that's clearly another product. Not scored
      // whatever the gate's mode (unless the gate is off).
      const doubt = ctx.sheet && ctx.listing ? doubtfulMatch(ctx.sheet, ctx.listing) : null;
      if (doubt) return { status: "fail", detail: `Doubtful match: ${doubt}`, tags: ["DOUBTFUL_MATCH", "MULTI_ASIN"] };
      return { status: "warn", detail: `EAN maps to ${ctx.match.asinCount} ASINs; each is scored`, tags: ["MULTI_ASIN"] };
    }
    return { status: "pass", detail: `Matched ${ctx.match.asin}` };
  },

  mirage(ctx, p) {
    const g = p.gates.mirage;
    const m = ctx.market;
    if (!m?.hasHistory) return skipped("Needs Keepa history");
    const reasons: string[] = [];
    if (m.historyDays != null && m.historyDays < g.minHistoryDays) reasons.push(`rank history is ${m.historyDays} days old`);
    if (m.reviewJumpPct != null && m.reviewJumpPct > g.maxReviewJumpPct) reasons.push(`reviews jumped ${pct(m.reviewJumpPct)} in a day`);
    if (m.youngerThanParent) reasons.push("variation child younger than its parent");
    if (reasons.length) return { status: failAs(g.mode), detail: `Borrowed rank: ${reasons.join(", ")}`, tags: ["MIRAGE"] };
    return { status: "pass", detail: `${m.historyDays} days of history, no review jumps` };
  },

  amazonPresence(ctx, p) {
    const g = p.gates.amazonPresence;
    const m = ctx.market;
    if (!m?.hasHistory) return skipped("Needs Keepa history");
    if (m.amazonLastSeenDays != null && m.amazonLastSeenDays <= g.days) {
      const when = m.amazonLastSeenDays === 0 ? "is selling now" : `sold ${m.amazonLastSeenDays} days ago`;
      return { status: failAs(g.mode), detail: `Amazon ${when}`, tags: ["AMAZON"] };
    }
    return { status: "pass", detail: m.amazonLastSeenDays == null ? "Amazon never on the listing" : `Amazon last sold ${m.amazonLastSeenDays} days ago` };
  },

  competition(ctx, p) {
    const g = p.gates.competition;
    const m = ctx.market;
    const sellers = m?.fbaOffers ?? m?.offersNow ?? null;
    if (sellers == null) return skipped("No offer count");
    const reasons: string[] = [];
    if (sellers < g.minSellers) reasons.push(`${sellers} sellers, under ${g.minSellers}`);
    if (sellers > g.maxSellers) reasons.push(`${sellers} sellers, over ${g.maxSellers}`);
    if (m?.topSellerBbSharePct != null && m.topSellerBbSharePct > g.maxBbSharePct) reasons.push(`one seller held the Buy Box ${pct(m.topSellerBbSharePct)} of the year`);
    if (reasons.length) return { status: failAs(g.mode), detail: reasons.join("; ") };
    return { status: "pass", detail: `${sellers} sellers${m?.topSellerBbSharePct != null ? `, top Buy Box share ${pct(m.topSellerBbSharePct)}` : ""}` };
  },

  demand(ctx, p) {
    const g = p.gates.demand;
    const m = ctx.market;
    const rank = m?.avgRank90d ?? m?.rankNow ?? null;
    if (!m || (m.rankDrops30d == null && rank == null)) return skipped("No rank data");
    const reasons: string[] = [];
    if (m.rankDrops30d != null && m.rankDrops30d < g.minRankDrops30d) reasons.push(`${m.rankDrops30d} rank drops in 30 days, under ${g.minRankDrops30d}`);
    if (rank != null && rank > g.maxAvgRank90d) reasons.push(`${m.avgRank90d != null ? "90-day average" : "current"} rank ${rank.toLocaleString("en-GB")}, over ${g.maxAvgRank90d.toLocaleString("en-GB")}`);
    if (reasons.length) return { status: failAs(g.mode), detail: reasons.join("; ") };
    const parts = [
      m.rankDrops30d != null ? `${m.rankDrops30d} drops/30d` : null,
      rank != null ? `${m.avgRank90d != null ? "avg" : "current"} rank ${rank.toLocaleString("en-GB")}` : null,
    ].filter(Boolean);
    return { status: "pass", detail: parts.join(", ") + (m.hasHistory ? "" : " (no history: current rank only)") };
  },

  priceRegime(ctx, p) {
    const g = p.gates.priceRegime;
    const m = ctx.market;
    if (!m?.hasHistory || m.currentBuyBox == null || m.medianBuyBox12m == null) return skipped("Needs Keepa history");
    const above = (m.currentBuyBox / m.medianBuyBox12m - 1) * 100;
    const offersFalling = m.offersNow != null && m.offers90dAgo != null && m.offersNow < m.offers90dAgo;
    if (above > g.spikePct && offersFalling) {
      return { status: failAs(g.mode), detail: `SPIKE: Buy Box ${money(m.currentBuyBox)} is ${pct(above)} over the ${money(m.medianBuyBox12m)} median with offers falling; scored on the median`, tags: ["SPIKE"] };
    }
    return { status: "pass", detail: `Buy Box ${money(m.currentBuyBox)} vs median ${money(m.medianBuyBox12m)}` };
  },

  priceDrift(ctx, p) {
    const g = p.gates.priceDrift;
    const m = ctx.market;
    if (!m?.hasHistory || m.bbSlopePctYr == null) return skipped("Needs Keepa history");
    if (m.bbSlopePctYr < -g.maxDeclinePctYr) return { status: failAs(g.mode), detail: `EROSION: Buy Box falling ${pct(-m.bbSlopePctYr)} a year`, tags: ["EROSION"] };
    return { status: "pass", detail: `Buy Box trend ${m.bbSlopePctYr >= 0 ? "+" : ""}${pct(m.bbSlopePctYr)} a year` };
  },

  gating(ctx, p) {
    const g = p.gates.gating;
    const r = ctx.restriction;
    if (!r) return skipped("Not checked (SP-API not configured)");
    // "Brand approval needed (Nuxe)", "Category approval needed (Beauty)", from Amazon's reason text.
    const kind = approvalKind(r.message);
    const what = kind === "brand" ? ctx.product.brand : kind === "category" ? ctx.amazonCategory : null;
    const label = kind ? `${kind[0].toUpperCase()}${kind.slice(1)} approval` : "Approval";
    const reason = r.message ? `: ${r.message}` : "";
    const links = applyLinks(r.links);
    const withLinks = links.length ? { links } : {};
    if (r.status === "blocked") {
      return { status: failAs(g.mode), detail: `Blocked for your account${kind ? ` (${kind}${what ? `: ${what}` : ""})` : ""}${reason}`, tags: ["BLOCKED"], ...withLinks };
    }
    // A brand you've been approved for is open, unless Amazon wants category or product approval.
    if (r.status === "approval_required" && ctx.brandApproval && kind !== "category" && kind !== "product") {
      const on = ctx.brandApproval.date ? ` on ${ctx.brandApproval.date}` : "";
      return { status: "pass", detail: `Open: brand approval${ctx.product.brand ? ` for ${ctx.product.brand}` : ""} recorded as approved${on}`, tags: ["BRAND_APPROVED"] };
    }
    if (r.status === "approval_required") {
      const mode: GateMode = g.mode === "off" ? "off" : g.approvalRequired;
      if (mode !== "off") {
        return { status: failAs(mode), detail: `${label} needed${what ? ` (${what})` : ""}${reason}`, tags: ["APPROVAL", ...(kind ? [kind.toUpperCase()] : [])], ...withLinks };
      }
    }
    if (r.status === "unknown") return { status: "skipped", detail: r.message || "Restriction status unknown" };
    return { status: "pass", detail: r.status === "open" ? "Open to list" : "Approval needed (allowed by profile)" };
  },

  fees(ctx, p, run) {
    const g = p.gates.fees;
    if (run.scoringPrice == null) return skipped("No sell price: see hurdle price");
    const e = run.economics!;
    if (e.profit == null) return { status: failAs(g.mode), detail: `No FBA fee: ${e.fees.tier?.name ?? "unknown size"}` };
    const misses: string[] = [];
    if (e.profit < g.minProfit) misses.push(`profit ${money(e.profit)} < ${money(g.minProfit)}`);
    if (e.roi! < g.minRoiPct) misses.push(`ROI ${pct(e.roi!)} < ${pct(g.minRoiPct)}`);
    if (e.margin! < g.minMarginPct) misses.push(`margin ${pct(e.margin!)} < ${pct(g.minMarginPct)}`);
    const tail = run.hurdlePrice != null ? `; passes at ${money(run.hurdlePrice)}` : "";
    if (misses.length) return { status: failAs(g.mode), detail: `At ${money(run.scoringPrice)}: ${misses.join(", ")}${tail}` };
    return {
      status: "pass",
      detail: `${money(e.profit)} profit, ${pct(e.roi!)} ROI, ${pct(e.margin!)} margin at ${money(run.scoringPrice)}${e.fees.dimsEstimated ? " (size assumed)" : ""}`,
      tags: e.fees.source === "amazon" ? ["AMAZON_FEE"] : undefined,
    };
  },
};

/**
 * Run gates in order, stopping at the first fail-mode failure.
 * `only` limits the run to a subset (the cheap pre-screen before any API call).
 */
export function runGates(ctx: ScreenContext, p: ProfileConfig, only?: GateId[]): GateRun {
  const { price, source } = resolveScoringPrice(ctx.market, p);
  const run: GateRun = {
    outcomes: [],
    failedGate: null,
    scoringPrice: price,
    priceSource: source,
    economics: null,
    hurdlePrice: null,
    ruleMatches: [],
  };

  const item = {
    referralCategory: ctx.product.referralCategory,
    dimsCm: ctx.product.dimsCm,
    weightG: ctx.product.weightG,
    goodsVatRatePct: ctx.offer.goodsVatRatePct,
  };
  const g = p.gates.fees;
  if (!only || only.includes("fees")) {
    run.hurdlePrice = hurdlePrice(ctx.offer.unitCostGbp, item, ctx.card, p.fees, { minProfit: g.minProfit, minRoiPct: g.minRoiPct, minMarginPct: g.minMarginPct }, { date: ctx.now });
    if (price != null) run.economics = economics(price, ctx.offer.unitCostGbp, item, ctx.card, p.fees, { date: ctx.now, amazon: ctx.amazonFees });
  }

  for (const id of GATE_ORDER) {
    if (only && !only.includes(id)) continue;
    const mode = p.gates[id].mode;
    if (mode === "off") {
      run.outcomes.push({ gate: id, label: GATE_LABELS[id], status: "off", detail: "Gate off in this profile" });
      continue;
    }
    const r = EVALUATORS[id](ctx, p, run);
    run.outcomes.push({ gate: id, label: GATE_LABELS[id], ...r });
    if (r.status === "fail") {
      run.failedGate = id;
      break;
    }
  }
  return run;
}

/** Overall verdict: fail if a fail-mode gate failed, warn if any gate warned, else pass. */
export function verdictOf(outcomes: GateOutcome[]): "pass" | "warn" | "fail" {
  if (outcomes.some((o) => o.status === "fail")) return "fail";
  if (outcomes.some((o) => o.status === "warn")) return "warn";
  return "pass";
}
