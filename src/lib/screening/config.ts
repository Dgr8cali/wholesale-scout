/**
 * Profile configuration: every gate mode and parameter, score weights and scales,
 * fee assumptions and the scoring-price rule. Stored as JSON in `profiles.config`.
 */
import { DEFAULT_RANK_BY_CATEGORY } from "./categories";
import { DEFAULT_FEE_ASSUMPTIONS, type FeeAssumptions } from "../fees/engine";

export type GateMode = "off" | "warn" | "fail";

export interface GateConfigs {
  priceBand: { mode: GateMode; min: number; max: number };
  /** `rules` gives each compliance rule its own mode; the gate's mode switches the whole gate. */
  compliance: { mode: GateMode; rules: Record<string, GateMode>; /** Liquid rule: flag only above this volume (ml); null flags any liquid. */ liquidAboveMl?: number | null };
  budgetFit: { mode: GateMode; maxLineSharePct: number };
  matchQuality: { mode: GateMode };
  mirage: { mode: GateMode; minHistoryDays: number; maxReviewJumpPct: number };
  amazonPresence: { mode: GateMode; days: number };
  competition: { mode: GateMode; minSellers: number; maxSellers: number; maxBbSharePct: number };
  demand: { mode: GateMode; minRankDrops30d: number; maxAvgRank90d: number; /** Rank ceiling per top-level category (Keepa's root category); others use maxAvgRank90d. */ maxRankByCategory: Record<string, number>; /** Your share: sales ÷ (sellers + you). */ minSharePerMonth: number; /** The first order must sell within this many months at your share. */ maxMonthsToSell: number };
  priceRegime: { mode: GateMode; spikePct: number };
  priceDrift: { mode: GateMode; maxDeclinePctYr: number };
  /** Blocked always takes the gate's mode; approval-required has its own (warn by default). */
  gating: { mode: GateMode; approvalRequired: GateMode };
  fees: { mode: GateMode; minProfit: number; minRoiPct: number; minMarginPct: number };
}

export type GateId = keyof GateConfigs;

/** A piecewise-linear curve mapping a value to 0–100. Points are [value, score]. */
export interface Scale {
  points: [number, number][];
  /** Weight of this parameter inside its group. */
  weight: number;
}

export type GroupId = "demand" | "competition" | "priceHealth" | "margin" | "risk" | "fit";

export interface ScoreConfig {
  weights: Record<GroupId, number>;
  scales: Record<string, Scale>;
  bands: { green: number; amber: number };
}

/** Keepa seller profiles for the top Buy Box sellers of rows that pass every gate (1 token each). */
export interface SellerLookupConfig {
  enabled: boolean;
  topN: number;
  /** A seller whose storefront is at least this % the product's brand is a likely distributor. */
  distributorBrandSharePct: number;
}

export interface ProfileConfig {
  scoringPrice: "current" | "median" | "lower";
  sellerLookup: SellerLookupConfig;
  budget: number;
  /** Reuse a Keepa snapshot up to this many days old (any run's) instead of fetching again. */
  keepaMaxAgeDays: number;
  fees: FeeAssumptions;
  gates: GateConfigs;
  score: ScoreConfig;
  /**
   * Corrections learnt from your own sales (the Tracker): your-share estimates are multiplied by
   * shareFactor. 1 until you apply a suggestion.
   */
  calibration: { shareFactor: number; basedOn: number | null; appliedAt: string | null };
}

export const GATE_ORDER: GateId[] = [
  "priceBand", "compliance", "budgetFit", "matchQuality", "mirage", "amazonPresence",
  "competition", "demand", "priceRegime", "priceDrift", "gating", "fees",
];

export const GATE_LABELS: Record<GateId, string> = {
  priceBand: "Price band",
  compliance: "Compliance category",
  budgetFit: "Budget fit",
  matchQuality: "Match quality",
  mirage: "Borrowed rank (mirage)",
  amazonPresence: "Amazon presence",
  competition: "Competition shape",
  demand: "Demand",
  priceRegime: "Price regime",
  priceDrift: "Price drift",
  gating: "Gating and blocks",
  fees: "Fee engine",
};

export const GROUP_LABELS: Record<GroupId, string> = {
  demand: "Demand",
  competition: "Competition",
  priceHealth: "Price health",
  margin: "Margin",
  risk: "Risk",
  fit: "Fit",
};

/** Which group each scale belongs to, and how to describe it in Settings. */
export const SCALE_DEFS: Record<string, { group: GroupId; label: string; unit: string }> = {
  rankDrops: { group: "demand", label: "Rank drops / 30 days", unit: "drops" },
  avgRank: { group: "demand", label: "90-day average rank", unit: "rank" },
  rankTrend: { group: "demand", label: "12-month rank trend (negative = improving)", unit: "%" },
  sellers: { group: "competition", label: "FBA seller count", unit: "sellers" },
  amazonAbsence: { group: "competition", label: "Days since Amazon last sold", unit: "days" },
  topSellerShare: { group: "competition", label: "Top seller's Buy Box share", unit: "%" },
  offerTrend: { group: "competition", label: "Offer count change vs 90 days ago", unit: "%" },
  priceVsMedian: { group: "priceHealth", label: "Current vs 12-month median", unit: "%" },
  priceSlope: { group: "priceHealth", label: "12-month Buy Box slope", unit: "%/yr" },
  volatility: { group: "priceHealth", label: "Buy Box volatility", unit: "%" },
  profit: { group: "margin", label: "Net profit per unit", unit: "£" },
  profitPerMonth: { group: "margin", label: "Your profit a month (your share × profit per unit)", unit: "£/mo" },
  roi: { group: "margin", label: "ROI", unit: "%" },
  margin: { group: "margin", label: "Net margin", unit: "%" },
  complianceFlags: { group: "risk", label: "Compliance flags", unit: "flags" },
  mirage: { group: "risk", label: "Mirage flag (1 = flagged)", unit: "flag" },
  gating: { group: "risk", label: "Gating (0 open, 1 unknown, 2 approval needed)", unit: "status" },
  brandLock: { group: "risk", label: "Brand-lock pattern (1 = one seller holds ≥ 90%)", unit: "flag" },
  variations: { group: "risk", label: "Variation count", unit: "variations" },
  warnings: { group: "risk", label: "Other warn-mode gates tripped", unit: "gates" },
  budgetShare: { group: "fit", label: "Order cost as share of budget", unit: "%" },
  moq: { group: "fit", label: "MOQ", unit: "units" },
  deliveryDays: { group: "fit", label: "Delivery time", unit: "days" },
  supplierRating: { group: "fit", label: "Supplier ledger rating", unit: "0–5" },
};

const s = (points: [number, number][], weight = 1): Scale => ({ points, weight });

export const DEFAULT_SCALES: Record<string, Scale> = {
  rankDrops: s([[10, 0], [200, 100]]),
  avgRank: s([[1000, 100], [20000, 70], [50000, 40], [150000, 0]]),
  rankTrend: s([[-30, 100], [0, 70], [30, 20], [60, 0]]),
  sellers: s([[1, 40], [3, 90], [4, 100], [6, 100], [12, 30], [20, 0]]),
  amazonAbsence: s([[0, 0], [365, 70], [730, 100]]),
  topSellerShare: s([[30, 100], [50, 80], [70, 40], [100, 0]]),
  offerTrend: s([[-30, 100], [0, 70], [30, 30], [70, 0]]),
  priceVsMedian: s([[-25, 30], [-5, 100], [0, 100], [15, 40], [40, 0]]),
  priceSlope: s([[-30, 0], [-10, 50], [0, 85], [10, 100]]),
  volatility: s([[0, 100], [10, 80], [30, 25], [50, 0]]),
  profit: s([[0, 0], [2, 30], [5, 80], [8, 100]]),
  profitPerMonth: s([[0, 0], [25, 40], [100, 80], [250, 100]]),
  roi: s([[10, 0], [60, 100]]),
  margin: s([[10, 0], [15, 40], [35, 100]]),
  complianceFlags: s([[0, 100], [1, 55], [2, 25], [3, 0]]),
  mirage: s([[0, 100], [1, 15]]),
  gating: s([[0, 100], [1, 70], [2, 35]]),
  brandLock: s([[0, 100], [1, 20]]),
  variations: s([[1, 100], [10, 75], [50, 30]]),
  warnings: s([[0, 100], [1, 65], [2, 40], [4, 0]]),
  budgetShare: s([[0, 100], [30, 90], [60, 50], [100, 0]]),
  moq: s([[1, 100], [24, 85], [100, 45], [500, 0]]),
  deliveryDays: s([[1, 100], [3, 90], [7, 60], [21, 0]]),
  supplierRating: s([[0, 30], [3, 70], [5, 100]]),
};

export const COMPLIANCE_RULE_KEYS = [
  "fragrance", "liquid", "aerosol", "cosmetic", "supplement", "food", "electrical", "battery", "under3sToy", "chemical", "meltable", "ipRisk",
] as const;

const allRules = (mode: GateMode) => Object.fromEntries(COMPLIANCE_RULE_KEYS.map((k) => [k, mode])) as Record<string, GateMode>;

export const DEFAULT_GATES: GateConfigs = {
  priceBand: { mode: "fail", min: 12, max: 40 },
  compliance: { mode: "warn", rules: allRules("warn") },
  budgetFit: { mode: "fail", maxLineSharePct: 100 },
  matchQuality: { mode: "fail" },
  mirage: { mode: "warn", minHistoryDays: 90, maxReviewJumpPct: 50 },
  amazonPresence: { mode: "fail", days: 365 },
  competition: { mode: "warn", minSellers: 3, maxSellers: 12, maxBbSharePct: 70 },
  demand: { mode: "fail", minRankDrops30d: 30, maxAvgRank90d: 50000, maxRankByCategory: { ...DEFAULT_RANK_BY_CATEGORY }, minSharePerMonth: 5, maxMonthsToSell: 3 },
  priceRegime: { mode: "warn", spikePct: 15 },
  priceDrift: { mode: "warn", maxDeclinePctYr: 20 },
  gating: { mode: "fail", approvalRequired: "warn" },
  fees: { mode: "fail", minProfit: 2, minRoiPct: 20, minMarginPct: 15 },
};

export const DEFAULT_PROFILE: ProfileConfig = {
  scoringPrice: "lower",
  sellerLookup: { enabled: true, topN: 3, distributorBrandSharePct: 50 },
  budget: 1000,
  keepaMaxAgeDays: 7,
  fees: DEFAULT_FEE_ASSUMPTIONS,
  gates: DEFAULT_GATES,
  score: {
    weights: { demand: 25, competition: 20, priceHealth: 15, margin: 25, risk: 10, fit: 5 },
    scales: DEFAULT_SCALES,
    bands: { green: 75, amber: 55 },
  },
  calibration: { shareFactor: 1, basedOn: null, appliedAt: null },
};

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** The three profiles the app ships with. */
export function defaultProfiles(): { name: string; is_default: boolean; config: ProfileConfig }[] {
  const strict = clone(DEFAULT_PROFILE);
  strict.gates.compliance = { mode: "fail", rules: allRules("fail") };
  strict.gates.amazonPresence = { mode: "fail", days: 365 };
  strict.scoringPrice = "lower";
  strict.gates.fees = { ...strict.gates.fees, minRoiPct: 25, minMarginPct: 18 };

  const test = clone(DEFAULT_PROFILE);
  test.gates.compliance = { mode: "warn", rules: allRules("warn") };
  test.gates.fees = { ...test.gates.fees, minRoiPct: 20, minMarginPct: 15 };
  test.gates.budgetFit = { mode: "fail", maxLineSharePct: 30 };

  const dry = clone(DEFAULT_PROFILE);
  dry.gates.compliance = {
    mode: "fail",
    rules: { ...allRules("warn"), fragrance: "fail", liquid: "fail", aerosol: "fail", cosmetic: "fail", supplement: "fail", chemical: "fail" },
  };

  // The default: the settings of the "First order" profile in use. Lines of at most 25% of the
  // budget, sell price £12–35, 2–8 sellers with no one over 60% of the Buy Box, Amazon absent
  // 180 days, 10+ rank drops and 8+ a month for you; fragrance, aerosol, supplement, food and
  // under-3s toy fail compliance, liquids only above 500 ml; floors £2.50, 25% ROI, 12% margin.
  const first = clone(DEFAULT_PROFILE);
  first.gates.priceBand = { ...first.gates.priceBand, max: 35 };
  first.gates.compliance = {
    mode: "fail",
    rules: { ...allRules("warn"), fragrance: "fail", aerosol: "fail", supplement: "fail", food: "fail", under3sToy: "fail" },
    liquidAboveMl: 500,
  };
  first.gates.budgetFit = { ...first.gates.budgetFit, maxLineSharePct: 25 };
  first.gates.amazonPresence = { ...first.gates.amazonPresence, days: 180 };
  first.gates.competition = { ...first.gates.competition, minSellers: 2, maxSellers: 8, maxBbSharePct: 60 };
  first.gates.demand = { ...first.gates.demand, minRankDrops30d: 10, maxAvgRank90d: 100_000, minSharePerMonth: 8 };
  first.gates.fees = { ...first.gates.fees, minProfit: 2.5, minRoiPct: 25, minMarginPct: 12 };

  return [
    { name: "First order", is_default: true, config: first },
    { name: "Strict", is_default: false, config: strict },
    { name: "Test order", is_default: false, config: test },
    { name: "Dry goods only", is_default: false, config: dry },
  ];
}

/** Fill any keys missing from a stored config with defaults, so old profiles keep working. */
export function withDefaults(cfg: Partial<ProfileConfig> | null | undefined): ProfileConfig {
  const c = cfg ?? {};
  const gates = { ...DEFAULT_GATES } as GateConfigs;
  for (const id of GATE_ORDER) {
    (gates as unknown as Record<string, unknown>)[id] = { ...DEFAULT_GATES[id], ...(c.gates?.[id] ?? {}) };
  }
  gates.compliance.rules = { ...DEFAULT_GATES.compliance.rules, ...(c.gates?.compliance?.rules ?? {}) };
  return {
    scoringPrice: c.scoringPrice ?? DEFAULT_PROFILE.scoringPrice,
    sellerLookup: { ...DEFAULT_PROFILE.sellerLookup, ...(c.sellerLookup ?? {}) },
    budget: c.budget ?? DEFAULT_PROFILE.budget,
    keepaMaxAgeDays: c.keepaMaxAgeDays ?? DEFAULT_PROFILE.keepaMaxAgeDays,
    fees: { ...DEFAULT_FEE_ASSUMPTIONS, ...(c.fees ?? {}), missingDims: { ...DEFAULT_FEE_ASSUMPTIONS.missingDims, ...(c.fees?.missingDims ?? {}) } },
    gates,
    score: {
      weights: { ...DEFAULT_PROFILE.score.weights, ...(c.score?.weights ?? {}) },
      scales: { ...DEFAULT_SCALES, ...(c.score?.scales ?? {}) },
      bands: { ...DEFAULT_PROFILE.score.bands, ...(c.score?.bands ?? {}) },
    },
    calibration: { ...DEFAULT_PROFILE.calibration, ...(c.calibration ?? {}) },
  };
}

/** Paths in a config whose value should be a number but isn't (e.g. an emptied field). */
export function invalidNumbers(cfg: ProfileConfig): string[] {
  const bad: string[] = [];
  const walk = (def: unknown, val: unknown, path: string) => {
    if (typeof def === "number") {
      if (typeof val !== "number" || !Number.isFinite(val)) bad.push(path);
    } else if (Array.isArray(val)) {
      val.forEach((v, i) => walk(Array.isArray(def) && def.length ? def[0] : def, v, `${path}[${i}]`));
    } else if (def && typeof def === "object" && val && typeof val === "object") {
      for (const k of Object.keys(val as object)) {
        const d = (def as Record<string, unknown>)[k] ?? (path.endsWith("scales") ? DEFAULT_SCALES.rankDrops : path.endsWith("maxRankByCategory") ? 0 : undefined);
        if (d !== undefined) walk(d, (val as Record<string, unknown>)[k], path ? `${path}.${k}` : k);
      }
    }
  };
  walk(DEFAULT_PROFILE, cfg, "");
  return bad;
}
