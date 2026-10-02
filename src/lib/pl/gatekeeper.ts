/**
 * Gatekeeper, ported: the eight gates and their pass / warn / fail checks, the 10-line
 * scorecard and the verdict, for a private-label candidate. Every threshold, cut-off, band and
 * verdict rule is Gatekeeper's own (docs/gatekeeper-reference.html); gatekeeper.test.ts runs the
 * reference's functions side by side with these on random inputs.
 *
 * Fees come from the app's rate card (the same Amazon UK July 2026 card Gatekeeper carried), with
 * Gatekeeper's composition in econ() except for two deliberate alignments with the fee engine:
 *  - storage carries VAT and the digital services fee like every other Amazon fee (Gatekeeper
 *    added it ex-VAT);
 *  - peak rates (storage, and the small-parcel surcharge) apply in the card's peak months, Oct–Dec,
 *    by date as the engine does (Gatekeeper had a manual Q4 switch).
 * Like Gatekeeper, and unlike the engine, there's no FBA fee until the dimensions and weight are in.
 *
 * Pure: browser and server.
 */
import { inPeakMonths, sizeTier as cardSizeTier, referralPct as cardReferralPct } from "../fees/engine";
import type { RateCard } from "../fees/rateCard";

export type Fields = Record<string, string | undefined>;
export type FieldType = "num" | "sel" | "yn" | "text";
export interface FieldDef { k: string; label: string; type: FieldType; unit?: string; step?: string; hint?: string; opts?: [string, string][] }
export interface GateDef { id: GateId; n: string; title: string; tool: string; blurb: string; fields: FieldDef[] }
export type GateId = "g0" | "g1" | "g2" | "g3" | "g4" | "g5" | "g6" | "g7";
export type Status = "pass" | "warn" | "fail" | "empty";

export const GATES: GateDef[] = [
  { id: "g0", n: "0", title: "Your filter", tool: "Written before you search",
    blurb: "The constraints you commit to before opening any tool. A product that fails here is dropped whatever the revenue looks like.",
    fields: [
      { k: "sell", label: "Sell price", type: "num", unit: "£", step: "0.01", hint: "£18–35 band" },
      { k: "landed", label: "Landed cost per unit", type: "num", unit: "£", step: "0.01", hint: "Product + freight + duty + import VAT + inspection, per unit" },
      { k: "weight", label: "Packed weight", type: "num", unit: "g", hint: "As it ships to Amazon" },
      { k: "dimL", label: "Packed length", type: "num", unit: "cm", step: "0.1" },
      { k: "dimW", label: "Packed width", type: "num", unit: "cm", step: "0.1" },
      { k: "dimH", label: "Packed height", type: "num", unit: "cm", step: "0.1", hint: "The FBA tier is set from these three" },
      { k: "seasonal", label: "Seasonal?", type: "yn" },
      { k: "excluded", label: "In an avoid category?", type: "yn", hint: "Electrical, cosmetic, supplement, food, under-3s, medical, glass, liquid, IP" },
      { k: "simple", label: "Simple and hard to break?", type: "yn" },
      { k: "differentiable", label: "Differentiable without re-tooling?", type: "yn" },
    ] },
  { id: "g1", n: "1", title: "Find the market", tool: "Keepa · page-one ASINs",
    blurb: "The top listings for the niche. You are judging whether £1,000 can buy a place on page one.",
    fields: [
      { k: "reviewsBand", label: "Reviews on page one", type: "sel", opts: [["", "—"], ["0", "Most over 1,000"], ["1", "Most 500–1,000"], ["2", "Most 200–500"], ["3", "Several under 200 selling well"]] },
      { k: "avgRating", label: "Average rating, page one", type: "num", step: "0.1", hint: "3.8–4.3 leaves room" },
      { k: "top10Sales", label: "Top-10 monthly sales, each", type: "num", unit: "units", hint: "Median of the listings" },
      { k: "top3Share", label: "Top 3 revenue share", type: "num", unit: "%", hint: "Under 50%" },
      { k: "amazonBrand", label: "Amazon-brand in top 10?", type: "yn" },
      { k: "priceTight", label: "Price spread holds £18–35?", type: "yn" },
    ] },
  { id: "g2", n: "2", title: "Validate history", tool: "Keepa · reference listing",
    blurb: "Today's rank is a snapshot. Keepa shows whether today is normal: one year of the reference listing.",
    fields: [
      { k: "rankTrend", label: "Sales rank, 12 months", type: "sel", opts: [["", "—"], ["0", "Spike or decline"], ["1", "Seasonal"], ["2", "Flat"], ["3", "Growing"]] },
      { k: "rankDrops", label: "Rank drops / month, top listing", type: "num", hint: "Keepa footer" },
      { k: "bought", label: "Bought in past month", type: "num", hint: "Amazon's figure" },
      { k: "offerTrend", label: "New offer count", type: "sel", opts: [["", "—"], ["steady", "Steady, low"], ["climbing", "Climbing"]] },
      { k: "bbTrend", label: "Buy Box price, 12 months", type: "sel", opts: [["", "—"], ["holds", "Holds the band"], ["sliding", "Sliding down"]] },
      { k: "amazonSeller", label: "Amazon ever a seller?", type: "yn" },
    ] },
  { id: "g3", n: "3", title: "Amazon's own data", tool: "Product Opportunity Explorer",
    blurb: "Seller Central → Growth → Product Opportunity Explorer. Amazon's number settles any disagreement between the other two.",
    fields: [
      { k: "sv360", label: "Search volume, 360 days", type: "num", hint: "0 if the niche isn't listed" },
      { k: "svGrowth", label: "Search volume growth", type: "sel", opts: [["", "—"], ["declining", "Declining"], ["flat", "Flat"], ["growing", "Growing"]] },
      { k: "products", label: "Products in niche", type: "num" },
      { k: "clickShare", label: "Click share, top 3", type: "num", unit: "%" },
      { k: "conv", label: "Search conversion rate", type: "num", unit: "%" },
      { k: "unitsPer", label: "Avg units sold per product", type: "num", unit: "/mo" },
    ] },
  { id: "g4", n: "4", title: "Mine the reviews", tool: "By hand · 50 per listing",
    blurb: "One-, two- and three-star reviews on the top 5. You are looking for one complaint that repeats, that a factory can fix cheaply, that you can say in six words.",
    fields: [
      { k: "fixable", label: "A complaint a factory can fix?", type: "yn" },
      { k: "complaintPct", label: "Share of negative reviews with it", type: "num", unit: "%", hint: "10%+ across most listings" },
      { k: "fixCostPct", label: "Cost of the fix", type: "num", unit: "% of unit", hint: "Under 15%" },
      { k: "sixWords", label: "Sayable in six words?", type: "yn", hint: "\"the only X with Y\"" },
      { k: "sixWordsText", label: "The six words", type: "text", hint: "The differentiator, e.g. \"the only pill box with braille lids\": the RFQ asks suppliers for it" },
    ] },
  { id: "g5", n: "5", title: "Keywords", tool: "Opportunity Explorer search terms",
    blurb: "The niche's search terms from Opportunity Explorer. Demand you can't reach is not demand. Bids aren't in Opportunity Explorer: type them from Seller Central's campaign manager.",
    fields: [
      { k: "headVol", label: "Head term volume, UK", type: "num", unit: "/mo" },
      { k: "longtail", label: "Terms with 300–2,000 volume", type: "num", unit: "count" },
      { k: "headBid", label: "Suggested bid, head term", type: "num", unit: "£", step: "0.01" },
      { k: "ltBid", label: "Suggested bid, long-tail", type: "num", unit: "£", step: "0.01" },
      { k: "sponsored", label: "Sponsored slots on page one", type: "num" },
    ] },
  { id: "g6", n: "6", title: "Unit economics", tool: "Rate card · your quotes",
    blurb: "Sell price, landed cost, size and weight carry over from Gate 0. The FBA fee is read from the July 2026 rate card by size tier and weight band; referral comes from the category; storage from the volume. Launch and steady-state must both clear.",
    fields: [
      { k: "fbaOverride", label: "FBA fee override (ex-VAT)", type: "num", unit: "£", step: "0.01", hint: "Leave blank to use the rate card. Enter Amazon's own figure if you have it" },
      { k: "adsLaunch", label: "Ads per unit, launch", type: "num", unit: "£", step: "0.01", hint: "Default: CPC ÷ conversion (Settings → Ads, Gate 3)" },
      { k: "adsSteady", label: "Ads per unit, steady state", type: "num", unit: "£", step: "0.01", hint: "Default: launch × 0.4" },
    ] },
  { id: "g7", n: "7", title: "Launch budget", tool: "The whole cost, not the stock",
    blurb: "Stock is about 60% of a launch. A 10% buffer is added automatically.",
    fields: [
      { k: "units", label: "First order units", type: "num" },
      { k: "samples", label: "Samples, shipped", type: "num", unit: "£" },
      { k: "inspection", label: "Pre-shipment inspection", type: "num", unit: "£" },
      { k: "photography", label: "Photography", type: "num", unit: "£" },
      { k: "trademark", label: "UK trademark", type: "num", unit: "£", hint: "£170; can follow launch" },
      { k: "launchAds", label: "Launch advertising, 60 days", type: "num", unit: "£" },
    ] },
];

export const FIELD_KEYS = new Set(GATES.flatMap((g) => g.fields.map((f) => f.k)));

export const SETTINGS_DEF = [
  { k: "budget", label: "Budget available", unit: "£", d: 1000 },
  { k: "vat", label: "VAT rate", unit: "%", d: 20 },
  { k: "dst", label: "Digital services fee on fees", unit: "%", d: 2 },
  { k: "inbound", label: "Inbound shipping to FBA", unit: "£/unit", d: 0.30 },
  { k: "prep", label: "Prep, bag and label", unit: "£/unit", d: 0.15 },
  { k: "storageMonths", label: "Avg months in storage", unit: "mo", d: 2 },
  { k: "returnsPct", label: "Returns allowance", unit: "% of sale", d: 2 },
  { k: "minMultiple", label: "Min price multiple", unit: "×", d: 3.5 },
  { k: "minLaunchMargin", label: "Min launch margin", unit: "%", d: 20 },
  { k: "minSteadyMargin", label: "Min steady margin", unit: "%", d: 30 },
  { k: "minProfit", label: "Min profit / unit", unit: "£", d: 6 },
] as const;

export type SettingKey = (typeof SETTINGS_DEF)[number]["k"];
export type Settings = Record<SettingKey, number>;
export const DEFAULT_SETTINGS = Object.fromEntries(SETTINGS_DEF.map((s) => [s.k, s.d])) as Settings;

export const num = (v: unknown): number | null => (v === "" || v == null || isNaN(+(v as number)) ? null : +(v as number));
export const money = (v: number | null | undefined) => (v == null ? "—" : `£${(+v).toFixed(2)}`);
export const pct = (v: number | null | undefined) => (v == null ? "—" : `${(+v).toFixed(1)}%`);
const fmt = (v: number | null | undefined) => (v == null ? "—" : (+v).toLocaleString("en-GB"));

/* ===================== rate card ===================== */

export interface PlTier {
  /** Rate-card tier id; null when outside every tier. */
  id: string | null;
  name: string;
  shipG: number;
  dimG: number;
  /** Max grams of the weight band the fee came from (standard tiers). */
  bandMaxG: number | null;
  useDim: boolean;
  fee: number | null;
  lowFee: number | null;
  peakAdd: number;
  oversize: boolean;
}

/** Gatekeeper's sizeTier(): null until L, W, H and weight are all in. */
export function sizeTier(f: Fields, card: RateCard): PlTier | null {
  const L = num(f.dimL), W = num(f.dimW), H = num(f.dimH), g = num(f.weight);
  if (L == null || W == null || H == null || g == null) return null;
  const t = cardSizeTier({ l: L, w: W, h: H }, g, card);
  const std = card.tiers.find((x) => x.id === t.id);
  return {
    id: t.id,
    name: t.id ? t.name : "Outside standard tiers",
    shipG: t.shippingWeightG,
    dimG: t.dimWeightG,
    bandMaxG: std ? std.bands.find((b) => t.shippingWeightG <= b[0])?.[0] ?? null : null,
    useDim: std ? std.useDimWeight : !!t.id,
    fee: t.fee,
    lowFee: t.lowPriceFee,
    peakAdd: t.peakSurcharge,
    oversize: t.oversize,
  };
}

export function referralPct(cat: string, sell: number, card: RateCard): number {
  return cardReferralPct(cat, sell, card);
}

/** Referral categories with their rates, for the picker ("Home Products — 8%/15%"). */
export const referralOptions = (card: RateCard) =>
  card.referral.categories.map((c) => ({ name: c.name, rates: [...new Set(c.bands.map((b) => `${b.pct}%`))].join("/") }));

/** Storage per unit for the months in store, ex-VAT (econ adds VAT and DSF). */
export function storagePerUnit(f: Fields, S: Settings, card: RateCard, peak: boolean): number | null {
  const L = num(f.dimL), W = num(f.dimW), H = num(f.dimH);
  if (L == null || W == null || H == null) return null;
  const cuft = (L * W * H) / 28316.8;
  const rate = peak ? card.storage.peakPerCuFt : card.storage.standardPerCuFt;
  return cuft * rate * (S.storageMonths || 0);
}

export interface Econ {
  sell: number; landed: number | null; pct: number; referralBase: number; referral: number;
  tier: PlTier | null; lowPrice: boolean; lowThreshold: number;
  fbaBase: number | null; fbaSource: "" | "override" | "low-price" | "peak" | "standard"; fbaV: number | null;
  /** The card's peak months (Oct–Dec): peak storage rate and small-parcel surcharge. */
  peak: boolean;
  /** Storage ex-VAT, and with VAT and DSF (what's charged; the figure the profit uses). */
  storageBase: number | null; storage: number | null; inbound: number; prep: number; returns: number; over: number;
  pL: number | null; pS: number | null; amazonTake: number | null; mL: number | null; mS: number | null; multiple: number | null;
}

export function econ(f: Fields, S: Settings, cat: string, card: RateCard, date: Date = new Date()): Econ | null {
  const sell = num(f.sell), landed = num(f.landed), aL = num(f.adsLaunch), aS = num(f.adsSteady), ov = num(f.fbaOverride);
  const vat = 1 + S.vat / 100, dst = 1 + (S.dst || 0) / 100;
  if (sell == null) return null;
  const p = referralPct(cat || "Everything else", sell, card);
  const referralBase = Math.max((sell * p) / 100, card.referral.minimumFee);
  const referral = referralBase * vat * dst;
  const tier = sizeTier(f, card);
  const peak = inPeakMonths(card, date);
  const lowThreshold = card.lowPrice.reducedCategories.includes(cat) ? card.lowPrice.reducedThreshold : card.lowPrice.threshold;
  const lowPrice = sell <= lowThreshold;
  let fbaBase: number | null = null, fbaSource: Econ["fbaSource"] = "";
  if (ov != null) { fbaBase = ov; fbaSource = "override"; }
  else if (tier && tier.fee != null) {
    if (lowPrice && tier.lowFee != null) { fbaBase = tier.lowFee; fbaSource = "low-price"; }
    else { fbaBase = tier.fee + (peak ? tier.peakAdd : 0); fbaSource = peak && tier.peakAdd ? "peak" : "standard"; }
  }
  const fbaV = fbaBase == null ? null : fbaBase * vat * dst;
  const storageBase = storagePerUnit(f, S, card, peak);
  const storage = storageBase == null ? null : storageBase * vat * dst;
  const inbound = S.inbound || 0, prep = S.prep || 0, returns = (sell * (S.returnsPct || 0)) / 100;
  const over = (storage || 0) + inbound + prep + returns;
  const base = fbaV == null || landed == null ? null : sell - referral - fbaV - landed - over;
  const pL = base == null || aL == null ? null : base - aL;
  const pS = base == null || aS == null ? null : base - aS;
  return {
    sell, landed, pct: p, referralBase, referral, tier, lowPrice, lowThreshold, fbaBase, fbaSource, fbaV, peak, storageBase, storage, inbound, prep, returns, over, pL, pS,
    amazonTake: fbaV == null ? null : referral + fbaV,
    mL: pL == null ? null : (pL / sell) * 100, mS: pS == null ? null : (pS / sell) * 100,
    multiple: landed && landed > 0 ? sell / landed : null,
  };
}

export interface Budget { stock: number | null; sub: number; buffer: number; total: number; budget: number; ratio: number }

export function budget(f: Fields, S: Settings): Budget | null {
  const units = num(f.units), landed = num(f.landed);
  const items = ["samples", "inspection", "photography", "trademark", "launchAds"].map((k) => num(f[k]));
  if (units == null && items.every((x) => x == null)) return null;
  const stock = units != null && landed != null ? units * landed : null;
  const sub = (stock || 0) + items.reduce<number>((a, b) => a + (b || 0), 0);
  const total = sub * 1.1;
  return { stock, sub, buffer: sub * 0.1, total, budget: S.budget, ratio: total / S.budget };
}

/* ===================== gates ===================== */

export interface Check { label: string; status: Status; detail: string }

const st = (cond: boolean, warnCond?: boolean): Status => (cond ? "pass" : warnCond ? "warn" : "fail");
const E: Status = "empty";
const SMALL_TIERS = ["lightEnv", "stdEnv", "largeEnv", "xlEnv", "smallPcl"];

export function gateChecks(g: GateId, f: Fields, S: Settings, cat: string, card: RateCard, date: Date = new Date()): Check[] {
  const rows: Check[] = [];
  const R = (label: string, status: Status, detail: string | number) => rows.push({ label, status, detail: String(detail) });
  const e = econ(f, S, cat, card, date), b = budget(f, S);
  switch (g) {
    case "g0": {
      const s = num(f.sell), l = num(f.landed), w = num(f.weight), t = sizeTier(f, card);
      R("Sell price £18–35", s == null ? E : st(s >= 18 && s <= 35, s >= 15 && s <= 40), s == null ? "" : money(s));
      R("Landed cost ≤ 30% of sell", s == null || l == null ? E : st(l / s <= 0.30, l / s <= 0.35), s && l != null ? `${((l / s) * 100).toFixed(0)}%` : "");
      R("Packed weight under 500 g", w == null ? E : st(w <= 500, w <= 700), w == null ? "" : `${w} g`);
      R("Envelope or small parcel tier", t == null ? E : st(!!t.id && SMALL_TIERS.includes(t.id), t.id === "stdPcl"), t == null ? "" : t.name);
      R("Sells all year", !f.seasonal ? E : st(f.seasonal === "no"), "");
      R("Not in an avoid category", !f.excluded ? E : st(f.excluded === "no"), "");
      R("Simple, hard to break", !f.simple ? E : st(f.simple === "yes"), "");
      R("Differentiable without re-tooling", !f.differentiable ? E : st(f.differentiable === "yes"), "");
      break;
    }
    case "g1": {
      const rb = f.reviewsBand === "" || f.reviewsBand == null ? null : +f.reviewsBand, ar = num(f.avgRating), ts = num(f.top10Sales), t3 = num(f.top3Share);
      R("Page-one reviews mostly under 500", rb == null ? E : st(rb >= 2, rb >= 1), "");
      R("Average rating 3.8–4.3", ar == null ? E : st(ar >= 3.8 && ar <= 4.3, ar >= 3.6 && ar <= 4.5), ar == null ? "" : ar.toFixed(1));
      R("Top-10 each 300+ / month", ts == null ? E : st(ts >= 300, ts >= 150), ts == null ? "" : fmt(ts));
      R("Top 3 hold under 50%", t3 == null ? E : st(t3 <= 50, t3 <= 60), t3 == null ? "" : `${t3}%`);
      R("No Amazon-brand in top 10", !f.amazonBrand ? E : st(f.amazonBrand === "no"), "");
      R("Price spread holds the band", !f.priceTight ? E : st(f.priceTight === "yes", true), "");
      break;
    }
    case "g2": {
      const rt = f.rankTrend === "" || f.rankTrend == null ? null : +f.rankTrend, rd = num(f.rankDrops), bo = num(f.bought);
      R("Rank flat or improving over 12 months", rt == null ? E : st(rt >= 2, rt === 1), "");
      R("100+ rank drops / month", rd == null ? E : st(rd >= 100, rd >= 40), rd == null ? "" : fmt(rd));
      R("200+ bought in past month", bo == null ? E : st(bo >= 200, true), bo == null ? "" : fmt(bo));
      R("Offer count steady", !f.offerTrend ? E : st(f.offerTrend === "steady"), "");
      R("Buy Box price holds", !f.bbTrend ? E : st(f.bbTrend === "holds"), "");
      R("Amazon never on listing", !f.amazonSeller ? E : st(f.amazonSeller === "no"), "");
      break;
    }
    case "g3": {
      const sv = num(f.sv360), pr = num(f.products), cs = num(f.clickShare), cv = num(f.conv), up = num(f.unitsPer);
      R("Search volume ≥ 30,000 / year", sv == null ? E : st(sv >= 30000, sv >= 15000), sv == null ? "" : fmt(sv));
      R("Volume flat or growing", !f.svGrowth ? E : st(f.svGrowth !== "declining"), "");
      R("50–300 products in niche", pr == null ? E : st(pr >= 50 && pr <= 300, pr >= 30 && pr <= 500), pr == null ? "" : fmt(pr));
      R("Top-3 click share under 50%", cs == null ? E : st(cs <= 50, cs <= 60), cs == null ? "" : `${cs}%`);
      R("Conversion ≥ 10%", cv == null ? E : st(cv >= 10, cv >= 7), cv == null ? "" : `${cv}%`);
      R("100+ units / product / month", up == null ? E : st(up >= 100, true), up == null ? "" : fmt(up));
      break;
    }
    case "g4": {
      const cp = num(f.complaintPct), fc = num(f.fixCostPct);
      R("A factory-fixable complaint exists", !f.fixable ? E : st(f.fixable === "yes"), "");
      R("Appears in 10%+ of negative reviews", cp == null ? E : st(cp >= 10, cp >= 5), cp == null ? "" : `${cp}%`);
      R("Fix costs under 15% of unit", fc == null ? E : st(fc <= 15, fc <= 20), fc == null ? "" : `${fc}%`);
      R("Sayable in six words", !f.sixWords ? E : st(f.sixWords === "yes", true), "");
      break;
    }
    case "g5": {
      const hv = num(f.headVol), lt = num(f.longtail), hb = num(f.headBid), lb = num(f.ltBid), sp = num(f.sponsored);
      R("Head term ≥ 5,000 / month", hv == null ? E : st(hv >= 5000, hv >= 2500), hv == null ? "" : fmt(hv));
      R("10+ long-tail terms", lt == null ? E : st(lt >= 10, lt >= 5), lt == null ? "" : lt);
      R("Head-term bid ≤ £1.20", hb == null ? E : st(hb <= 1.20, hb <= 1.50), hb == null ? "" : money(hb));
      R("Long-tail bid ≤ £0.60", lb == null ? E : st(lb <= 0.60, true), lb == null ? "" : money(lb));
      R("Fewer than 6 sponsored slots", sp == null ? E : st(sp < 6, true), sp == null ? "" : sp);
      break;
    }
    case "g6": {
      if (!e) { R("Enter sell price in Gate 0", E, ""); break; }
      R("FBA tier identified from size and weight", e.fbaSource === "override" ? "pass" : e.tier == null ? E : e.tier.fee == null ? "fail" : "pass", e.fbaSource === "override" ? "override" : e.tier ? e.tier.name : "");
      R(`Sell ÷ landed ≥ ${S.minMultiple}×`, e.multiple == null ? E : st(e.multiple >= S.minMultiple, e.multiple >= 3), e.multiple == null ? "" : `${e.multiple.toFixed(2)}×`);
      R(`Launch margin ≥ ${S.minLaunchMargin}% (ads in)`, e.mL == null ? E : st(e.mL >= S.minLaunchMargin, e.mL >= S.minLaunchMargin - 5), e.mL == null ? "" : pct(e.mL));
      R(`Steady margin ≥ ${S.minSteadyMargin}%`, e.mS == null ? E : st(e.mS >= S.minSteadyMargin, e.mS >= S.minSteadyMargin - 5), e.mS == null ? "" : pct(e.mS));
      R(`Steady profit ≥ ${money(S.minProfit)} / unit`, e.pS == null ? E : st(e.pS >= S.minProfit, e.pS >= S.minProfit - 2), e.pS == null ? "" : money(e.pS));
      break;
    }
    case "g7": {
      if (!b) { R("Enter the launch lines", E, ""); break; }
      R(`Whole launch fits ${money(S.budget)} with buffer`, st(b.total <= S.budget, b.total <= S.budget * 1.15), money(b.total));
      R("Landed cost known (Gate 0)", num(f.landed) == null ? E : "pass", "");
      break;
    }
  }
  return rows;
}

/** The worst check: fail, then warn; pass only when every check passes. */
export function gateStatus(rows: Check[]): Status {
  if (rows.some((r) => r.status === "fail")) return "fail";
  if (rows.some((r) => r.status === "warn")) return "warn";
  if (rows.every((r) => r.status === "pass")) return "pass";
  return "empty";
}

/* ===================== scorecard and verdict ===================== */

export interface ScoreRow { n: number; label: string; pts: number | null; why: string[]; structural?: boolean }
export interface Scorecard { rows: ScoreRow[]; total: number; answered: number }

export function scorecard(f: Fields, S: Settings, cat: string, card: RateCard, date: Date = new Date()): Scorecard {
  const e: Partial<Econ> = econ(f, S, cat, card, date) || {}, b = budget(f, S);
  const rb = f.reviewsBand === "" || f.reviewsBand == null ? null : +f.reviewsBand;
  const rt = f.rankTrend === "" || f.rankTrend == null ? null : +f.rankTrend;
  const rd = num(f.rankDrops), sv = num(f.sv360), lt = num(f.longtail), t3 = num(f.top3Share), fc = num(f.fixCostPct);
  const band = (v: number | null, cuts: number[]) => (v == null ? null : v < cuts[0] ? 0 : v < cuts[1] ? 1 : v < cuts[2] ? 2 : 3);
  const rows: ScoreRow[] = [];
  rows.push({ n: 1, label: "Page-one review depth", pts: rb, why: ["Most over 1,000", "Most 500–1,000", "Most 200–500", "Several under 200 selling well"], structural: true });
  rows.push({ n: 2, label: "Demand (Keepa rank drops)", pts: band(rd, [40, 100, 200]), why: ["Under 40/mo", "40–100", "100–200", "200+"] });
  rows.push({ n: 3, label: "Demand stability (12-month Keepa)", pts: rt, why: ["Spike or decline", "Seasonal", "Flat", "Growing"], structural: true });
  rows.push({ n: 4, label: "Opportunity Explorer volume", pts: sv == null ? null : sv <= 0 ? 0 : sv < 15000 ? 1 : sv < 30000 ? 2 : 3, why: ["Not listed", "Under 15k", "15–30k", "30k+"] });
  let dp: number | null = null;
  if (f.fixable) dp = f.fixable === "no" ? 0 : fc != null && fc > 15 ? 1 : f.sixWords === "no" ? 2 : f.sixWords === "yes" ? 3 : null;
  rows.push({ n: 5, label: "Review-driven differentiation", pts: dp, why: ["No fixable complaint", "Weak or costly fix", "Clear fix, hard to state", "Clear fix, six words"] });
  rows.push({ n: 6, label: "Long-tail keywords (300–2,000)", pts: lt == null ? null : lt < 5 ? 0 : lt < 10 ? 1 : lt <= 15 ? 2 : 3, why: ["Under 5", "5–9", "10–15", "15+"] });
  rows.push({ n: 7, label: "Price multiple (sell ÷ landed)", pts: e.multiple == null ? null : e.multiple < 3 ? 0 : e.multiple < 3.5 ? 1 : e.multiple <= 4 ? 2 : 3, why: ["Under 3×", "3–3.5×", "3.5–4×", "Over 4×"], structural: true });
  rows.push({ n: 8, label: "Steady-state net margin", pts: e.mS == null ? null : e.mS < 25 ? 0 : e.mS < 30 ? 1 : e.mS <= 35 ? 2 : 3, why: ["Under 25%", "25–30%", "30–35%", "Over 35%"] });
  rows.push({ n: 9, label: "Launch fits capital", pts: b == null ? null : b.total > S.budget * 1.15 ? 0 : b.total > S.budget ? 1 : b.total > S.budget * 0.9 ? 2 : 3, why: ["No", "With cuts", "Just", "Comfortably"] });
  let rp: number | null = null;
  if (f.amazonBrand || f.amazonSeller || f.offerTrend || f.bbTrend || t3 != null) {
    const major = f.amazonBrand === "yes" || f.amazonSeller === "yes" || (t3 != null && t3 > 60);
    const minors = (f.offerTrend === "climbing" ? 1 : 0) + (f.bbTrend === "sliding" ? 1 : 0) + (t3 != null && t3 > 50 && t3 <= 60 ? 1 : 0);
    rp = major ? 0 : minors >= 2 ? 1 : minors === 1 ? 2 : 3;
  }
  rows.push({ n: 10, label: "Competitive risk", pts: rp, why: ["Amazon present or dominant seller", "Two concerns", "One concern", "None"], structural: true });
  const answered = rows.filter((r) => r.pts != null).length;
  const total = rows.reduce((a, r) => a + (r.pts || 0), 0);
  return { rows, total, answered };
}

export interface Verdict { cls: Status; title: string; text: string }

export function verdict(sc: Scorecard, gates: { status: Status }[]): Verdict {
  if (sc.answered < 10) return { cls: "empty", title: `${sc.answered} of 10 scored`, text: "Fill the gates to score every line. The verdict only means something when all ten are in." };
  const fails = gates.filter((g) => g.status === "fail").length;
  if (sc.total >= 24 && fails === 0) return { cls: "pass", title: "Order samples", text: `${sc.total}/30 with every gate clear. Get three quotes, order samples from two suppliers, and decide the differentiation before the container ships.` };
  if (sc.total >= 24) return { cls: "warn", title: "Strong score, but a gate failed", text: `${sc.total}/30 — yet ${fails} gate${fails > 1 ? "s" : ""} failed outright. Fix the failing gate or drop it; the score doesn't override a failed gate.` };
  if (sc.total >= 18) {
    const weakStructural = sc.rows.filter((r) => r.structural && r.pts != null && r.pts <= 1).map((r) => r.n);
    if (weakStructural.length) return { cls: "fail", title: "Drop it", text: `${sc.total}/30, and the weak lines are structural (${weakStructural.join(", ")}). Review depth, demand stability, price multiple and competitive risk can't be fixed by trying harder.` };
    return { cls: "warn", title: "Samples only if you can move the weak lines", text: `${sc.total}/30. The low scores are on lines you can influence (volume, keywords, budget). Improve them or drop it — don't order on hope.` };
  }
  return { cls: "fail", title: "Drop it", text: `${sc.total}/30. However much you like it.` };
}

/** A waiver on a candidate: one check (by its label), or the whole gate when check_label is null. */
export interface Waiver { id: string; gate_id: GateId; check_label: string | null; reason: string; created_at: string }

/** A check with the waiver that overrides it, if any (its own status stays as computed). */
export interface GateRow extends Check { waiver?: Waiver }

export interface GateResult {
  g: GateDef;
  rows: GateRow[];
  /** The status the verdict uses: waived checks count as passes. */
  status: Status;
  /** The status before waivers. */
  rawStatus: Status;
  /** Set when the whole gate is waived. */
  waiver?: Waiver;
}

export interface Evaluation {
  gates: GateResult[];
  sc: Scorecard;
  v: Verdict;
  passed: number;
  /** Every failed or warned check a waiver turned into a pass, so the verdict always shows them. */
  waived: { gate: GateDef; label: string; status: Status; waiver: Waiver }[];
  /** "2 checks waived: Sell price £18–35, Not in an avoid category"; null when none. */
  waivedLine: string | null;
  /** Waived checks, plus whole-gate waivers with nothing failing under them (the list's count). */
  waivedCount: number;
}

/**
 * Labels with their numbers taken out: a waiver on "Sell ÷ landed ≥ 3.5×" still applies after the
 * threshold in Settings becomes 4×.
 */
export const checkKey = (label: string) => label.replace(/£?\d[\d.,]*\s*(%|×|g|kg)?/g, "#").replace(/\s+/g, " ").trim().toLowerCase();

/** A gate's checks with waivers applied: a waived fail or warn counts as a pass; a waived gate passes. */
export function applyWaivers(g: GateDef, rows: Check[], waivers: Waiver[]): GateResult {
  const mine = waivers.filter((w) => w.gate_id === g.id);
  const whole = mine.find((w) => w.check_label == null);
  const byKey = new Map(mine.filter((w) => w.check_label != null).map((w) => [checkKey(w.check_label!), w]));
  const out: GateRow[] = rows.map((r) => {
    const w = r.status === "fail" || r.status === "warn" ? byKey.get(checkKey(r.label)) ?? whole : undefined;
    return w ? { ...r, waiver: w } : r;
  });
  const rawStatus = gateStatus(rows);
  const status = whole ? "pass" : gateStatus(out.map((r) => (r.waiver ? { ...r, status: "pass" as Status } : r)));
  return { g, rows: out, status, rawStatus, ...(whole ? { waiver: whole } : {}) };
}

export function evaluate(f: Fields, category: string | null | undefined, S: Settings, card: RateCard, date: Date = new Date(), waivers: Waiver[] = []): Evaluation {
  const cat = category || "Everything else";
  const gates = GATES.map((g) => applyWaivers(g, gateChecks(g.id, f, S, cat, card, date), waivers));
  const sc = scorecard(f, S, cat, card, date);
  const waived = gates.flatMap((x) => x.rows.filter((r) => r.waiver).map((r) => ({ gate: x.g, label: r.label, status: r.status, waiver: r.waiver! })));
  // A whole-gate waiver with nothing failing under it still shows.
  const idle = gates.filter((x) => x.waiver && !x.rows.some((r) => r.waiver)).map((x) => `Gate ${x.g.n} (whole gate)`);
  const labels = [...waived.map((w) => w.label), ...idle];
  const n = waived.length;
  const waivedLine = labels.length ? `${n} check${n === 1 ? "" : "s"} waived: ${labels.join(", ")}` : null;
  return { gates, sc, v: verdict(sc, gates), passed: gates.filter((x) => x.status === "pass").length, waived, waivedLine, waivedCount: labels.length };
}
