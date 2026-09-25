/**
 * The twelve screening gates. Pure: each reads a ScreenContext and returns an outcome.
 * A gate whose data isn't available (no Keepa yet, no price) is "skipped", never failed.
 */
import { isDormant, lastSeenLabel } from "./dormant";
import { monthsLabel, orderPlan, volumeMl, type OrderPlan } from "./order";
import { salesPerMonth, yourShare } from "./sales";
import {
  economics,
  hurdlePrice,
  maxLandedCost,
  landedCost,
  sizeTier,
  type AmazonFeeOverride,
  type Dims,
  type Economics,
} from "../fees/engine";
import type { RateCard } from "../fees/rateCard";
import { applyLinks, approvalKind } from "../spapi/parse";
import type { RestrictionLink, RestrictionStatus } from "../spapi/types";
import { GATE_LABELS, GATE_ORDER, type GateId, type GateMode, type ProfileConfig } from "./config";
import { doubtfulMatch, type Listing } from "./match";
import { amazonRuleMatches, DEFAULT_RULES, DG_RULE_KEYS, matchReason, matchRules, type CategoryRule, type DgFacts, type RuleMatch } from "./rules";
import { dgLookupText, type DgLookup } from "../dg/report";
import { ipRiskText, type IpRiskMatch } from "../ipRisk";

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
  monthlySold?: number | null;
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
  amazonLastSeenAt?: string | null;
  topSellerBbSharePct: number | null;
  reviewJumpPct: number | null;
  youngerThanParent: boolean | null;
  // From Keepa, when history exists (see KeepaSummary).
  keepaRankDrops30?: number | null;
  topSellers?: { sellerId: string; sharePct: number }[];
  fbaFee?: number | null;
  referralFeePct?: number | null;
  packageDims?: Dims | null;
  packageWeightG?: number | null;
  variationCount?: number | null;
  /** False for stage-1 Keepa data: no Buy Box seller history yet (see keepa/types). */
  buyBoxFetched?: boolean;
  /** Keepa was asked and had nothing for this ASIN: don't ask again in this run. */
  keepaEmpty?: boolean;
  /** From SP-API's current offers before any Keepa history: Amazon holds an offer now. */
  amazonNow?: boolean | null;
  /** Seller holding the Buy Box now: SP-API's current offers, else the end of Keepa's history. */
  buyBoxSellerId?: string | null;
  // From the Keepa history, for dormant listings (see ./dormant).
  lastBuyBox12m?: number | null;
  lastBuyBoxAt?: string | null;
  rankDrops12m?: number | null;
  avgRank12m?: number | null;
  lastOfferDaysAgo?: number | null;
}

/** A top Buy Box seller with its Keepa profile. */
export interface SellerView {
  sellerId: string;
  /** Share of the Buy Box over 365 days, %. */
  sharePct: number;
  name: string | null;
  ratingPct: number | null;
  ratingCount: number | null;
  storefrontSize: number | null;
  /** How much of the storefront is this product's brand, %. null when unknown. */
  brandSharePct: number | null;
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
  /**
   * Multipack: the listing's pack against the supplier row's. When they differ, `offer`
   * is already per listing (cost × ratio, MOQ in listings) and `pieceCostGbp` is the row's own.
   */
  pack?: { listing: number; supplier: number; ratio: number; pieceCostGbp: number; mismatch: string | null } | null;
  offer: {
    /** Per Amazon listing (a supplier single scaled to the listing's pack). */
    unitCostGbp: number;
    /**
     * False for an ASIN check with no cost: unitCostGbp is 0, the fee and budget gates are
     * skipped, and the hurdle is the most it can cost landed (GateRun.maxLandedGbp).
     */
    costKnown?: boolean;
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
    /** Where dimsCm/weightG came from: the SP-API catalog, or filled in from Keepa. */
    dimsSource?: "catalog" | "keepa" | null;
    /** Keepa's package size, kept to compare tiers with the catalog's. */
    keepaDims?: Dims | null;
    keepaWeightG?: number | null;
    variationCount: number | null;
    /** Older stored form: declared regulations and "batteries". */
    hazmat: string[];
    /** Amazon's dangerous-goods attributes for the listing, when read. */
    amazonDg?: DgFacts | null;
    /** Seller Central's Dangerous Goods lookup for the ASIN (an imported report): ahead of the attributes. */
    dgLookup?: Pick<DgLookup, "status" | "text" | "programme"> | null;
    /** The brand is on your IP-risk list. */
    ipRisk?: IpRiskMatch | null;
  };
  /** Top Buy Box sellers' profiles, looked up for rows that pass every gate. */
  sellers?: SellerView[];
  /** Gates you've waived for this product, with your reason: a fail becomes a warn. */
  waivers?: Map<GateId, string | null>;
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
  /** No cost given: the most a unit can cost landed and clear the floors at the scoring price. */
  maxLandedGbp?: number | null;
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
  // Nobody selling now: the last Buy Box of the past year is the best price evidence there is.
  if (isDormant(m)) return m!.lastBuyBox12m != null ? { price: m!.lastBuyBox12m, source: lastSeenLabel(m!.lastBuyBox12m, m!.lastBuyBoxAt) } : { price: null, source: null };
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

/** "size tier disagreement: SP-API catalog says Small parcel, Keepa says Standard parcel", or null. */
/**
 * "Listing is a 3-pack: landed £14.85 for 3 × £4.00 (plus VAT, prep and inbound)", or null
 * when the packs match. £4.00 is the supplier's ex-VAT price per item; prep and inbound
 * are per listing unit, so they're counted once.
 */
export function packNote(ctx: ScreenContext, p: ProfileConfig): string | null {
  const k = ctx.pack;
  if (!k || k.ratio === 1 || ctx.offer.costKnown === false) return null;
  const l = landedCost(ctx.offer.unitCostGbp, { goodsVatRatePct: ctx.offer.goodsVatRatePct }, p.fees);
  const extras = [l.goodsVat > 0 && "VAT", l.duty > 0 && "duty", l.prep > 0 && "prep", l.inbound > 0 && "inbound"].filter(Boolean) as string[];
  const plus = extras.length ? ` (plus ${extras.length > 1 ? `${extras.slice(0, -1).join(", ")} and ${extras.at(-1)}` : extras[0]})` : "";
  const what = `Listing is a ${k.listing === 1 ? "single" : `${k.listing}-pack`}` + (k.supplier > 1 ? `, the supplier's item a ${k.supplier}-pack` : "");
  const n = Number.isInteger(k.ratio) ? String(k.ratio) : String(+k.ratio.toFixed(2));
  return `${what}: landed ${money(l.total)} for ${n} × ${money(k.pieceCostGbp)}${plus}.`;
}

export function tierDisagreement(ctx: ScreenContext): string | null {
  const p = ctx.product;
  if (p.dimsSource !== "catalog" || !p.dimsCm || p.weightG == null || !p.keepaDims || p.keepaWeightG == null) return null;
  const a = sizeTier(p.dimsCm, p.weightG, ctx.card), b = sizeTier(p.keepaDims, p.keepaWeightG, ctx.card);
  return a.id === b.id ? null : `size tier disagreement: SP-API catalog says ${a.name}, Keepa says ${b.name}`;
}

type Evaluator = (ctx: ScreenContext, p: ProfileConfig, run: GateRun) => Omit<GateOutcome, "gate" | "label">;

const skipped = (detail: string) => ({ status: "skipped" as const, detail });

/**
 * Units the first order has to be: the line's MOQ; with none, enough to reach the supplier's
 * minimum order value (a supplier with a £150 MOV and £5 items needs 30); else one.
 */
export function effectiveMoq(ctx: ScreenContext): { units: number; fromMov: boolean } {
  if (ctx.offer.moq != null) return { units: Math.max(1, ctx.offer.moq), fromMov: false };
  const mov = ctx.offer.supplierMovGbp;
  if (mov != null && mov > 0 && ctx.offer.unitCostGbp > 0 && ctx.offer.costKnown !== false) {
    return { units: Math.max(1, Math.ceil(mov / ctx.offer.unitCostGbp)), fromMov: true };
  }
  return { units: 1, fromMov: false };
}

/** The first order for this row under the profile's line cap (see ./order). */
export function firstOrder(ctx: ScreenContext, p: ProfileConfig, share: number | null): OrderPlan | null {
  if (ctx.offer.costKnown === false) return null;
  const landed = landedCost(ctx.offer.unitCostGbp, { goodsVatRatePct: ctx.offer.goodsVatRatePct }, p.fees).total;
  const m = effectiveMoq(ctx);
  return orderPlan({ lineCapGbp: (p.budget * p.gates.budgetFit.maxLineSharePct) / 100, landedGbp: landed, moq: ctx.offer.moq ?? (m.fromMov ? m.units : null), sharePerMonth: share });
}

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
    // Amazon's own dangerous-goods data first; keywords only for rules it didn't trigger.
    const amazon = amazonRuleMatches(ctx.rules, ctx.product.amazonDg, ctx.product.amazonDg ? ctx.product.hazmat.filter((h) => h === "batteries") : ctx.product.hazmat);
    let matches = [...amazon, ...matchRules(ctx.rules, ctx.text, ctx.amazonCategory).filter((m) => !amazon.some((a) => a.key === m.key))];
    // Amazon's DG lookup settles dangerous goods ahead of catalog attributes and keywords:
    // "not DG" clears the DG rules' matches; a DG status takes the place of theirs.
    const lookup = ctx.product.dgLookup;
    if (lookup && lookup.status !== "unknown") {
      const dgMatches = matches.filter((m) => DG_RULE_KEYS.includes(m.key));
      matches = matches.filter((m) => !DG_RULE_KEYS.includes(m.key));
      if (lookup.status !== "not_dg") {
        const key = dgMatches[0]?.key ?? "chemical";
        const name = ctx.rules.find((r) => r.key === key)?.name ?? DEFAULT_RULES.find((r) => r.key === key)?.name ?? key;
        matches.unshift({ key, name, hit: dgLookupText(lookup), source: "dgLookup", forceFail: lookup.status === "dg_not_fulfillable" });
      }
    }
    const ip = ctx.product.ipRisk;
    if (ip) matches.push({ key: "ipRisk", name: "IP-risk brand", hit: ipRiskText(ip), source: "ipRisk", level: ip.level });
    // Liquids: only above a volume when the profile says so (small bottles aren't worth a flag).
    if (g.liquidAboveMl != null) {
      const ml = volumeMl(ctx.text);
      const i = matches.findIndex((m) => m.key === "liquid");
      if (i >= 0) {
        if (ml == null || ml <= g.liquidAboveMl) matches.splice(i, 1);
        else matches[i] = { ...matches[i], hit: `${ml} ml, over ${g.liquidAboveMl} ml`, source: undefined };
      }
    }
    run.ruleMatches = matches;
    const active = matches.filter((m) => m.forceFail || (g.rules[m.key] ?? "warn") !== "off");
    // What the lookup said leads the line, whatever else matched.
    const lead = lookup && (lookup.status === "not_dg" || lookup.status === "unknown") ? `${dgLookupText(lookup)}` : null;
    if (!active.length) return { status: "pass", detail: lead ?? "No compliance rule matched", tags: lead ? ["AMAZON_DG_LOOKUP"] : undefined };
    // The IP-risk rule's fail mode drops high-risk brands; medium and low only warn. Amazon
    // saying it can't fulfil the DG fails whatever the rule's mode.
    const failsHere = (m: RuleMatch) => m.forceFail || (g.rules[m.key] === "fail" && (m.key !== "ipRisk" || m.level === "high"));
    const worst = active.some(failsHere) ? "fail" : "warn";
    const status: GateStatus = g.mode === "fail" && worst === "fail" ? "fail" : "warn";
    return {
      status,
      detail: [lead, ...active.map((m) => (m.source === "ipRisk" || m.source === "dgLookup" ? (m.source === "dgLookup" ? `${m.hit} → ${m.name}` : m.hit) : `${m.name} (${matchReason(m)})`))].filter(Boolean).join("; "),
      tags: [
        ...active.map((m) => (m.key === "ipRisk" ? "IP_RISK" : m.key.toUpperCase())),
        ...(active.some((m) => m.source === "amazon") ? ["AMAZON_DG"] : []),
        ...(lookup ? ["AMAZON_DG_LOOKUP"] : []),
      ],
    };
  },

  budgetFit(ctx, p) {
    const g = p.gates.budgetFit;
    if (ctx.offer.costKnown === false) return skipped("No cost given");
    const landed = landedCost(ctx.offer.unitCostGbp, { goodsVatRatePct: ctx.offer.goodsVatRatePct }, p.fees).total;
    const { units: moq, fromMov } = effectiveMoq(ctx);
    const order = moq * landed;
    const cap = (p.budget * g.maxLineSharePct) / 100;
    // No line MOQ: the supplier's minimum order value sets the smallest order instead.
    const what = fromMov ? `No line MOQ: the supplier's ${money(ctx.offer.supplierMovGbp!)} minimum order is ${moq}` : `MOQ ${moq}`;
    if (order > cap) {
      const fit = Math.floor(cap / landed);
      const fits = fit > 0 ? `${fit.toLocaleString("en-GB")} unit${fit === 1 ? "" : "s"} fit` : "not one unit fits";
      return { status: failAs(g.mode), detail: `${what} × ${money(landed)} = ${money(order)}, over the ${money(cap)} line cap; ${fits}`, tags: fromMov ? ["MOV"] : undefined };
    }
    if (ctx.offer.supplierMovGbp != null && ctx.offer.supplierMovGbp > p.budget) {
      return { status: failAs(g.mode), detail: `Supplier minimum order ${money(ctx.offer.supplierMovGbp)} is over the ${money(p.budget)} budget` };
    }
    return { status: "pass", detail: `First order ${money(order)} of ${money(p.budget)}${fromMov ? ` (${moq} units to reach the supplier's ${money(ctx.offer.supplierMovGbp!)} minimum order)` : ""}` };
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
    }
    const multi = ctx.match.asinCount > 1 ? `EAN maps to ${ctx.match.asinCount} ASINs; each is scored` : null;
    const pack = ctx.pack?.mismatch ? `pack mismatch, check: ${ctx.pack.mismatch}` : null;
    if (multi || pack) {
      return {
        status: "warn",
        detail: [multi, pack].filter(Boolean).join("; "),
        tags: [...(multi ? ["MULTI_ASIN"] : []), ...(pack ? ["PACK_MISMATCH"] : [])],
      };
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
    // Before Keepa: SP-API's current offers already show Amazon selling, whatever the history says.
    if (!m?.hasHistory) return m?.amazonNow ? { status: failAs(g.mode), detail: "Amazon is selling now (current offers)", tags: ["AMAZON"] } : skipped("Needs Keepa history");
    if (m.amazonLastSeenDays != null && m.amazonLastSeenDays <= g.days) {
      const when = m.amazonLastSeenDays === 0 ? "is selling now" : `sold ${m.amazonLastSeenDays} days ago`;
      return { status: failAs(g.mode), detail: `Amazon ${when}`, tags: ["AMAZON"] };
    }
    return { status: "pass", detail: m.amazonLastSeenDays == null ? "Amazon never on the listing" : `Amazon last sold ${m.amazonLastSeenDays} days ago` };
  },

  competition(ctx, p) {
    const g = p.gates.competition;
    const m = ctx.market;
    if (isDormant(m)) return skipped(`dormant: no sellers now${m!.lastOfferDaysAgo != null ? `, none for ${m!.lastOfferDaysAgo} days` : ""}`);
    const sellers = m?.fbaOffers ?? m?.offersNow ?? null;
    if (sellers == null) return skipped("No offer count");
    const reasons: string[] = [];
    if (sellers < g.minSellers) reasons.push(`${sellers} sellers, under ${g.minSellers}`);
    if (sellers > g.maxSellers) reasons.push(`${sellers} sellers, over ${g.maxSellers}`);
    // Top-seller share needs Buy Box seller history: stage 2, only for rows that pass everything else.
    if (m?.buyBoxFetched !== false && m?.topSellerBbSharePct != null && m.topSellerBbSharePct > g.maxBbSharePct) reasons.push(`one seller held the Buy Box ${pct(m.topSellerBbSharePct)} of the year`);
    const threshold = p.sellerLookup.distributorBrandSharePct;
    const distributors = (ctx.sellers ?? []).filter((s) => s.brandSharePct != null && s.brandSharePct >= threshold);
    const flag = distributors.map((s) =>
      `likely brand distributor: ${s.name ?? s.sellerId} (${pct(s.brandSharePct!)} of ${s.storefrontSize?.toLocaleString("en-GB") ?? "?"} storefront listings are ${ctx.product.brand ?? "this brand"}, ${pct(s.sharePct)} of the Buy Box)`);
    const tags = distributors.length ? ["BRAND_DISTRIBUTOR"] : undefined;
    if (reasons.length) return { status: failAs(g.mode), detail: [...reasons, ...flag].join("; "), tags };
    if (flag.length) return { status: "warn", detail: flag.join("; "), tags };
    return { status: "pass", detail: `${sellers} sellers${m?.topSellerBbSharePct != null ? `, top Buy Box share ${pct(m.topSellerBbSharePct)}` : ""}` };
  },

  demand(ctx, p) {
    const g = p.gates.demand;
    const m = ctx.market;
    // All must hold: enough sales in total, enough of them for you once shared with the other
    // sellers (your share), and a good average rank. Sales come from the Keepa history (the
    // same figure as the Sales / mo column), so without history there's nothing to count:
    // skip rather than pass on the current rank alone.
    if (!m?.hasHistory) return skipped(m?.rankNow != null ? `Needs Keepa history to count sales (current rank ${m.rankNow.toLocaleString("en-GB")})` : "Needs Keepa history");
    const share = yourShare(m);
    const plan = firstOrder(ctx, p, share.value);
    const shareCheck = (reasons: string[]) => {
      if (share.value != null && share.value < g.minSharePerMonth) {
        reasons.push(`your share ${share.value}/mo, under ${g.minSharePerMonth} (${share.sales} sales ÷ ${share.competitors} other seller${share.competitors === 1 ? "" : "s"}${share.amazon ? ", Amazon counted as 3" : ""} + you)`);
      }
      // The first order has to sell through in time: "40 units at 5/mo = 8 months, over 3".
      if (plan?.months != null && plan.months > g.maxMonthsToSell) {
        reasons.push(`${plan.qty} units${plan.moqOverCap ? " (MOQ)" : ""} at ${share.value}/mo = ${monthsLabel(plan.months)}, over ${g.maxMonthsToSell}`);
      }
    };
    const orderText = plan?.months != null ? `; order ${plan.qty}${plan.moqOverCap ? " (MOQ)" : ""} sells in ${monthsLabel(plan.months)}` : "";
    const shareText = share.value != null ? `, your share ${share.value}/mo` : "";
    if (isDormant(m)) {
      // No rank now: judge the past year instead, as a monthly rate.
      const drops = m.rankDrops12m ?? 0;
      if (drops === 0) {
        const why = m.rankDrops12m == null && m.avgRank12m == null ? "Keepa has no sales rank for it in 12 months" : "no rank drops in 12 months";
        return { status: failAs(g.mode), detail: `dormant: no sales history (${why})`, tags: ["DORMANT"] };
      }
      const perMonth = Math.round((drops / 12) * 10) / 10;
      const reasons: string[] = [];
      if (perMonth < g.minRankDrops30d) reasons.push(`${drops} rank drops in 12 months (${perMonth}/mo), under ${g.minRankDrops30d}/mo`);
      shareCheck(reasons);
      if (m.avgRank12m != null && m.avgRank12m > g.maxAvgRank90d) reasons.push(`12-month average rank ${m.avgRank12m.toLocaleString("en-GB")}, over ${g.maxAvgRank90d.toLocaleString("en-GB")}`);
      if (reasons.length) return { status: failAs(g.mode), detail: `dormant: ${reasons.join("; ")}`, tags: ["DORMANT"] };
      return { status: "pass", detail: `dormant: ${drops} rank drops in 12 months (${perMonth}/mo)${m.avgRank12m != null ? `, 12-month average rank ${m.avgRank12m.toLocaleString("en-GB")}` : ""}${orderText}`, tags: ["DORMANT"] };
    }
    const sales = salesPerMonth(m).value ?? 0;
    const rank = m.avgRank90d ?? m.rankNow ?? null;
    const rankLabel = m.avgRank90d != null ? "90-day average rank" : "current rank";
    const reasons: string[] = [];
    if (sales < g.minRankDrops30d) reasons.push(`${sales} sales in 30 days, under ${g.minRankDrops30d}`);
    shareCheck(reasons);
    if (rank == null) reasons.push("no rank in the last 90 days");
    else if (rank > g.maxAvgRank90d) reasons.push(`${rankLabel} ${rank.toLocaleString("en-GB")}, over ${g.maxAvgRank90d.toLocaleString("en-GB")}`);
    if (reasons.length) return { status: failAs(g.mode), detail: reasons.join("; ") };
    return { status: "pass", detail: `${sales} sales/mo${shareText}, ${m.avgRank90d != null ? "avg" : "current"} rank ${rank!.toLocaleString("en-GB")}${orderText}` };
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
    if (ctx.offer.costKnown === false) {
      if (run.scoringPrice == null) return skipped("No cost given, and no sell price yet");
      return skipped(run.maxLandedGbp != null
        ? `No cost given: clears the floors at ${money(run.maxLandedGbp)} landed or less (sells at ${money(run.scoringPrice)})`
        : `No cost given: at ${money(run.scoringPrice)} not even a free unit clears the floors`);
    }
    if (run.scoringPrice == null) return skipped("No sell price: see hurdle price");
    const e = run.economics!;
    if (e.profit == null) return { status: failAs(g.mode), detail: `No FBA fee: ${e.fees.tier?.name ?? "unknown size"}` };
    const misses: string[] = [];
    if (e.profit < g.minProfit) misses.push(`profit ${money(e.profit)} < ${money(g.minProfit)}`);
    if (e.roi! < g.minRoiPct) misses.push(`ROI ${pct(e.roi!)} < ${pct(g.minRoiPct)}`);
    if (e.margin! < g.minMarginPct) misses.push(`margin ${pct(e.margin!)} < ${pct(g.minMarginPct)}`);
    const tail = run.hurdlePrice != null ? `; passes at ${money(run.hurdlePrice)}` : "";
    const size = e.fees.dimsEstimated ? " (size assumed)" : ctx.product.dimsSource === "keepa" ? " (size from Keepa)" : "";
    const clash = tierDisagreement(ctx);
    const tags = [...(e.fees.source === "amazon" ? ["AMAZON_FEE"] : []), ...(clash ? ["TIER_MISMATCH"] : [])];
    const note = clash ? `; ${clash}` : "";
    if (misses.length) return { status: failAs(g.mode), detail: `At ${money(run.scoringPrice)}: ${misses.join(", ")}${tail}${note}`, tags: tags.length ? tags : undefined };
    return {
      status: "pass",
      detail: `${money(e.profit)} profit, ${pct(e.roi!)} ROI, ${pct(e.margin!)} margin at ${money(run.scoringPrice)}${size}${note}`,
      tags: tags.length ? tags : undefined,
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
  if (ctx.offer.costKnown === false) {
    if (!only || only.includes("fees")) {
      const floors = { minProfit: g.minProfit, minRoiPct: g.minRoiPct, minMarginPct: g.minMarginPct };
      if (price != null) {
        // Fees don't depend on the cost; profit, ROI and margin do, so they stay unknown.
        const e = economics(price, 0, item, ctx.card, p.fees, { date: ctx.now, amazon: ctx.amazonFees });
        run.economics = { ...e, profit: null, roi: null, margin: null };
        run.maxLandedGbp = maxLandedCost(price, item, ctx.card, p.fees, floors, { date: ctx.now, amazon: ctx.amazonFees });
      }
    }
  } else if (!only || only.includes("fees")) {
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
    let r = EVALUATORS[id](ctx, p, run);
    // Waived for this product: the fail stays visible as a warn, and later gates still run.
    if (r.status === "fail" && ctx.waivers?.has(id)) {
      const why = ctx.waivers.get(id);
      r = { ...r, status: "warn", detail: `${r.detail} (waived by you${why ? `: ${why}` : ""})`, tags: [...(r.tags ?? []), "WAIVED"] };
    }
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
