/**
 * Fee engine: size tier, FBA fee, referral, storage, VAT and DSF, landed cost,
 * profit / ROI / margin, and the hurdle price (the engine run backwards).
 *
 * Pure functions over a RateCard and FeeAssumptions — no I/O.
 */
import type { OversizeTier, RateCard, StandardTier, WeightBand } from "./rateCard";

export interface FeeAssumptions {
  /** VAT rate on Amazon's fees and, when registered, on the sale. */
  vatRatePct: number;
  /** Registered sellers reclaim VAT on fees and goods but pay output VAT on the sale. */
  vatRegistered: boolean;
  /** Digital services fee, applied on top of Amazon's fees. */
  dsfPct: number;
  inboundPerUnit: number;
  prepPerUnit: number;
  /** Import duty as % of goods cost. */
  dutyPct: number;
  storageMonths: number;
  /** 'auto' picks the peak rate when the run date falls in the card's peak months. */
  season: "auto" | "standard" | "peak";
  returnsPct: number;
  /** Tier and weight to assume when a product has no dimensions. */
  missingDims: { tierId: string; weightG: number };
}

export const DEFAULT_FEE_ASSUMPTIONS: FeeAssumptions = {
  vatRatePct: 20,
  vatRegistered: false,
  dsfPct: 2,
  inboundPerUnit: 0.3,
  prepPerUnit: 0.15,
  dutyPct: 0,
  storageMonths: 2,
  season: "auto",
  returnsPct: 2,
  missingDims: { tierId: "smallPcl", weightG: 400 },
};

export interface Dims {
  l: number;
  w: number;
  h: number;
}

export interface FeeItem {
  /** Rate-card referral category name. Unknown names use the card's default. */
  referralCategory?: string | null;
  dimsCm?: Dims | null;
  weightG?: number | null;
  /** VAT rate on the goods themselves (0 for zero-rated). Defaults to assumptions.vatRatePct. */
  goodsVatRatePct?: number;
}

/** Amazon's own figures from getMyFeesEstimate, ex-VAT and ex-DSF. Replaces the rate card. */
export interface AmazonFeeOverride {
  referral: number;
  fba: number;
}

export interface TierResult {
  id: string | null;
  name: string;
  oversize: boolean;
  /** Weight the fee is billed on: max(actual, dimensional) for parcels, actual for envelopes. */
  shippingWeightG: number;
  dimWeightG: number;
  /** Standard (non-low-price) fee, ex-VAT. null when outside every tier. */
  fee: number | null;
  /** Low-price fee for this weight, or null when the tier/weight has none. */
  lowPriceFee: number | null;
  peakSurcharge: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function sortDims(d: Dims): [number, number, number] {
  return [d.l, d.w, d.h].sort((a, b) => b - a) as [number, number, number];
}

function fits(d: [number, number, number], max: [number, number, number]) {
  return d[0] <= max[0] && d[1] <= max[1] && d[2] <= max[2];
}

function bandFee(bands: WeightBand[] | undefined, g: number): number | null {
  if (!bands) return null;
  const b = bands.find(([maxG]) => g <= maxG);
  return b ? b[1] : null;
}

export function dimensionalWeightG(dims: Dims, card: RateCard): number {
  return ((dims.l * dims.w * dims.h) / card.dimDivisor) * 1000;
}

/** Size tier from packed dimensions and weight. */
export function sizeTier(dims: Dims, weightG: number, card: RateCard): TierResult {
  const d = sortDims(dims);
  const dimG = dimensionalWeightG(dims, card);

  for (const t of card.tiers) {
    const shipG = t.useDimWeight ? Math.max(weightG, dimG) : weightG;
    if (fits(d, t.maxDimsCm) && shipG <= t.maxWeightG) {
      return standardResult(t, shipG, dimG);
    }
  }
  for (const o of card.oversize) {
    if (
      fits(d, o.maxDimsCm) &&
      weightG <= o.maxUnitWeightG &&
      (o.minUnitWeightG == null || weightG >= o.minUnitWeightG) &&
      dimG <= o.maxDimWeightG
    ) {
      const shipG = Math.max(weightG, dimG);
      return {
        id: o.id,
        name: o.name,
        oversize: true,
        shippingWeightG: shipG,
        dimWeightG: dimG,
        fee: oversizeFee(o, shipG),
        lowPriceFee: null,
        peakSurcharge: 0,
      };
    }
  }
  return {
    id: null,
    name: "Outside rate-card tiers",
    oversize: true,
    shippingWeightG: Math.max(weightG, dimG),
    dimWeightG: dimG,
    fee: null,
    lowPriceFee: null,
    peakSurcharge: 0,
  };
}

function standardResult(t: StandardTier, shipG: number, dimG: number): TierResult {
  return {
    id: t.id,
    name: t.name,
    oversize: false,
    shippingWeightG: shipG,
    dimWeightG: dimG,
    fee: bandFee(t.bands, shipG),
    lowPriceFee: bandFee(t.lowPriceBands, shipG),
    peakSurcharge: t.peakSurcharge ?? 0,
  };
}

function oversizeFee(o: OversizeTier, shipG: number): number {
  return o.baseFee + (Math.max(0, shipG - o.baseWeightG) / 1000) * o.perKg;
}

/** The tier a product with no dimensions is billed at, per the fee assumptions. */
export function assumedTier(card: RateCard, a: FeeAssumptions): TierResult {
  const t = card.tiers.find((x) => x.id === a.missingDims.tierId) ?? card.tiers[card.tiers.length - 1];
  const g = Math.min(a.missingDims.weightG, t.maxWeightG);
  return standardResult(t, g, 0);
}

export function referralCategoryFor(amazonCategory: string | null | undefined, card: RateCard): string {
  if (!amazonCategory) return card.referral.defaultCategory;
  const direct = card.referral.categories.find((c) => c.name === amazonCategory);
  if (direct) return direct.name;
  return card.referral.categoryMap[amazonCategory.trim().toLowerCase()] ?? card.referral.defaultCategory;
}

/** Referral rate (%) for a category at a price. The band's rate applies to the whole price. */
export function referralPct(category: string | null | undefined, price: number, card: RateCard): number {
  const cat =
    card.referral.categories.find((c) => c.name === category) ??
    card.referral.categories.find((c) => c.name === card.referral.defaultCategory);
  if (!cat) return 15;
  for (const b of cat.bands) if (b.upTo == null || price <= b.upTo) return b.pct;
  return cat.bands[cat.bands.length - 1].pct;
}

export function lowPriceThreshold(category: string | null | undefined, card: RateCard): number {
  return category && card.lowPrice.reducedCategories.includes(category)
    ? card.lowPrice.reducedThreshold
    : card.lowPrice.threshold;
}

export function isPeak(card: RateCard, a: FeeAssumptions, date: Date): boolean {
  if (a.season === "peak") return true;
  if (a.season === "standard") return false;
  return card.storage.peakMonths.includes(date.getUTCMonth() + 1);
}

/** Monthly storage per unit × months, ex-VAT. null without dimensions. */
export function storagePerUnit(dims: Dims | null | undefined, card: RateCard, a: FeeAssumptions, date: Date): number | null {
  if (!dims) return null;
  const cuFt = (dims.l * dims.w * dims.h) / 28316.846592;
  const rate = isPeak(card, a, date) ? card.storage.peakPerCuFt : card.storage.standardPerCuFt;
  return cuFt * rate * a.storageMonths;
}

export interface FeeBreakdown {
  price: number;
  referralCategory: string;
  referralPct: number;
  /** Ex-VAT, ex-DSF amounts. */
  referralBase: number;
  fbaBase: number | null;
  storageBase: number;
  /** What the seller actually pays per fee, after DSF and (if not registered) VAT. */
  referral: number;
  fba: number | null;
  storage: number;
  returns: number;
  tier: TierResult | null;
  fbaSource: "amazon" | "low-price" | "peak" | "standard" | "assumed-tier" | "none";
  lowPrice: boolean;
  lowPriceThreshold: number;
  peak: boolean;
  dimsEstimated: boolean;
  /** Multiplier applied to Amazon's fees: (1 + DSF) × (1 + VAT unless registered). */
  feeMultiplier: number;
  /** Sum of every fee the seller pays per unit. null if the FBA fee is unknown. */
  totalFees: number | null;
  source: "amazon" | "rate_card";
}

export interface FeeOptions {
  date?: Date;
  amazon?: AmazonFeeOverride | null;
}

export function computeFees(
  price: number,
  item: FeeItem,
  card: RateCard,
  a: FeeAssumptions,
  opts: FeeOptions = {},
): FeeBreakdown {
  const date = opts.date ?? new Date();
  const category = item.referralCategory && card.referral.categories.some((c) => c.name === item.referralCategory)
    ? item.referralCategory
    : card.referral.defaultCategory;
  const pct = referralPct(category, price, card);
  const threshold = lowPriceThreshold(category, card);
  const lowPrice = price <= threshold;
  const peak = isPeak(card, a, date);

  const hasDims = !!item.dimsCm && item.weightG != null;
  const tier = hasDims ? sizeTier(item.dimsCm!, item.weightG!, card) : assumedTier(card, a);

  let referralBase = Math.max((price * pct) / 100, card.referral.minimumFee);
  let fbaBase: number | null = null;
  let fbaSource: FeeBreakdown["fbaSource"] = "none";

  if (opts.amazon) {
    referralBase = opts.amazon.referral;
    fbaBase = opts.amazon.fba;
    fbaSource = "amazon";
  } else if (tier.fee != null) {
    if (lowPrice && tier.lowPriceFee != null) {
      fbaBase = tier.lowPriceFee;
      fbaSource = "low-price";
    } else if (peak && tier.peakSurcharge) {
      fbaBase = tier.fee + tier.peakSurcharge;
      fbaSource = "peak";
    } else {
      fbaBase = tier.fee;
      fbaSource = "standard";
    }
    if (!hasDims) fbaSource = "assumed-tier";
  }

  const storageBase = storagePerUnit(item.dimsCm, card, a, date) ?? storagePerUnit(assumedDims(tier), card, a, date) ?? 0;
  const feeMultiplier = (1 + a.dsfPct / 100) * (a.vatRegistered ? 1 : 1 + a.vatRatePct / 100);
  const referral = referralBase * feeMultiplier;
  const fba = fbaBase == null ? null : fbaBase * feeMultiplier;
  const storage = storageBase * feeMultiplier;
  const returns = (price * a.returnsPct) / 100;

  return {
    price,
    referralCategory: category,
    referralPct: pct,
    referralBase,
    fbaBase,
    storageBase,
    referral,
    fba,
    storage,
    returns,
    tier,
    fbaSource,
    lowPrice,
    lowPriceThreshold: threshold,
    peak,
    dimsEstimated: !hasDims,
    feeMultiplier,
    totalFees: fba == null ? null : referral + fba + storage + returns,
    source: opts.amazon ? "amazon" : "rate_card",
  };
}

/** A notional box for storage when a product has no dimensions: the assumed tier's max. */
function assumedDims(tier: TierResult | null): Dims | null {
  if (!tier || !tier.id) return null;
  // Half the tier's max volume is a fair middle for "unknown size in this tier".
  const byId: Record<string, Dims> = {
    lightEnv: { l: 20, w: 15, h: 1 },
    stdEnv: { l: 25, w: 18, h: 2 },
    largeEnv: { l: 25, w: 18, h: 3 },
    xlEnv: { l: 25, w: 18, h: 5 },
    smallPcl: { l: 25, w: 18, h: 8 },
    stdPcl: { l: 35, w: 25, h: 18 },
  };
  return byId[tier.id] ?? null;
}

export interface LandedCost {
  goods: number;
  goodsVat: number;
  duty: number;
  inbound: number;
  prep: number;
  total: number;
}

/**
 * Landed cost per unit from an ex-VAT GBP unit cost. VAT on goods is a cost only when
 * the seller isn't VAT registered (a registered seller reclaims it).
 */
export function landedCost(unitCostGbpExVat: number, item: FeeItem, a: FeeAssumptions): LandedCost {
  const goodsVatRate = item.goodsVatRatePct ?? a.vatRatePct;
  const duty = (unitCostGbpExVat * a.dutyPct) / 100;
  const goodsVat = a.vatRegistered ? 0 : ((unitCostGbpExVat + duty) * goodsVatRate) / 100;
  const total = unitCostGbpExVat + duty + goodsVat + a.inboundPerUnit + a.prepPerUnit;
  return { goods: unitCostGbpExVat, goodsVat, duty, inbound: a.inboundPerUnit, prep: a.prepPerUnit, total };
}

export interface Economics {
  price: number;
  /** Sale price less output VAT when registered; the full price otherwise. */
  netRevenue: number;
  outputVat: number;
  fees: FeeBreakdown;
  landed: LandedCost;
  profit: number | null;
  /** Profit ÷ landed cost, %. */
  roi: number | null;
  /** Profit ÷ price, %. */
  margin: number | null;
}

export function economics(
  price: number,
  unitCostGbpExVat: number,
  item: FeeItem,
  card: RateCard,
  a: FeeAssumptions,
  opts: FeeOptions = {},
): Economics {
  const fees = computeFees(price, item, card, a, opts);
  const landed = landedCost(unitCostGbpExVat, item, a);
  const goodsVatRate = item.goodsVatRatePct ?? a.vatRatePct;
  const outputVat = a.vatRegistered ? (price * goodsVatRate) / (100 + goodsVatRate) : 0;
  const netRevenue = price - outputVat;
  const profit = fees.totalFees == null ? null : netRevenue - fees.totalFees - landed.total;
  return {
    price,
    netRevenue,
    outputVat,
    fees,
    landed,
    profit: profit == null ? null : round2(profit),
    roi: profit == null || landed.total <= 0 ? null : round2((profit / landed.total) * 100),
    margin: profit == null || price <= 0 ? null : round2((profit / price) * 100),
  };
}

export interface Floors {
  minProfit: number;
  minRoiPct: number;
  minMarginPct: number;
}

export function meetsFloors(e: Economics, f: Floors): boolean {
  return (
    e.profit != null && e.roi != null && e.margin != null &&
    e.profit >= f.minProfit && e.roi >= f.minRoiPct && e.margin >= f.minMarginPct
  );
}

/**
 * The most a unit can cost landed (goods, VAT and duty as they apply, inbound, prep) and
 * still clear every floor at `price`; null if not even a free unit would. Profit only
 * falls as cost rises, so a bisection on the ex-VAT unit cost finds it.
 */
export function maxLandedCost(price: number, item: FeeItem, card: RateCard, a: FeeAssumptions, floors: Floors, opts: FeeOptions = {}): number | null {
  const passes = (c: number) => meetsFloors(economics(price, c, item, card, a, opts), floors);
  if (!passes(0)) return null;
  let lo = 0, hi = price;
  while (hi - lo > 0.001) {
    const mid = (lo + hi) / 2;
    if (passes(mid)) lo = mid;
    else hi = mid;
  }
  return Math.floor(landedCost(lo, item, a).total * 100) / 100;
}

/**
 * The ex-VAT unit cost behind a landed cost: the inverse of landedCost. Null when the landed
 * cost doesn't even cover inbound and prep.
 */
export function unitCostFromLanded(landedGbp: number, item: FeeItem, a: FeeAssumptions): number | null {
  const goodsVatRate = item.goodsVatRatePct ?? a.vatRatePct;
  const goods = landedGbp - a.inboundPerUnit - a.prepPerUnit;
  if (!(goods > 0)) return null;
  const perUnit = (1 + a.dutyPct / 100) * (a.vatRegistered ? 1 : 1 + goodsVatRate / 100);
  return Math.round((goods / perUnit) * 10000) / 10000;
}

/**
 * The lowest sale price that clears every floor. Fees jump at referral and low-price
 * thresholds, so profit isn't monotonic in price: scan coarse, then refine to the penny.
 * Returns null if nothing up to `maxPrice` clears.
 */
export function hurdlePrice(
  unitCostGbpExVat: number,
  item: FeeItem,
  card: RateCard,
  a: FeeAssumptions,
  floors: Floors,
  opts: FeeOptions & { maxPrice?: number } = {},
): number | null {
  const passes = (p: number) => meetsFloors(economics(p, unitCostGbpExVat, item, card, a, opts), floors);
  const maxPrice = opts.maxPrice ?? Math.max(500, unitCostGbpExVat * 20);
  const step = 0.25;
  let prev = 0.01;
  for (let p = step; p <= maxPrice; p = round2(p + step)) {
    if (passes(p)) {
      for (let q = round2(prev); q <= p; q = round2(q + 0.01)) if (passes(q)) return q;
      return p;
    }
    prev = p;
  }
  return null;
}
