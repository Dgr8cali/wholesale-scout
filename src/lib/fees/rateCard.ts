/**
 * Amazon UK FBA rate card, as data.
 *
 * Ported from Gatekeeper, whose tables were read from Amazon's UK rate card effective
 * 1 July 2026 (260630-FBA-Rate-Card-EN1.pdf) and sell.amazon.co.uk/pricing on 24 Sep 2026.
 * This is the default; the live card is a row in `rate_cards` and is edited in Settings.
 *
 * All fee amounts are GBP, excluding VAT and the digital services fee.
 */

/** [max shipping weight in grams, fee] — the first band the weight fits is used. */
export type WeightBand = [maxG: number, fee: number];

export interface StandardTier {
  id: string;
  name: string;
  /** Max sorted dimensions in cm, longest first. */
  maxDimsCm: [number, number, number];
  /** Max shipping weight in grams for this tier. */
  maxWeightG: number;
  /** Parcel tiers bill on max(actual, dimensional); envelope tiers on actual weight. */
  useDimWeight: boolean;
  bands: WeightBand[];
  /** Low-price FBA bands. Weights past the last band fall back to `bands`. */
  lowPriceBands?: WeightBand[];
  /** Added to the standard fee in the peak season (Oct–Dec). */
  peakSurcharge?: number;
}

export interface OversizeTier {
  id: string;
  name: string;
  maxDimsCm: [number, number, number];
  minUnitWeightG?: number;
  maxUnitWeightG: number;
  maxDimWeightG: number;
  baseFee: number;
  /** Weight covered by the base fee, in grams. */
  baseWeightG: number;
  /** Charged per kg above `baseWeightG`. */
  perKg: number;
}

/** A referral price band: rate applies to the whole price when price ≤ upTo (null = no cap). */
export interface ReferralBand {
  upTo: number | null;
  pct: number;
}

export interface ReferralCategory {
  name: string;
  bands: ReferralBand[];
}

export interface RateCard {
  name: string;
  effectiveFrom: string; // ISO date
  currency: "GBP";
  /** Dimensional weight (kg) = L × W × H (cm) ÷ divisor. */
  dimDivisor: number;
  lowPrice: {
    /** Low-price FBA applies at or below this price. */
    threshold: number;
    /** Lower threshold for the categories listed in `reducedCategories`. */
    reducedThreshold: number;
    reducedCategories: string[];
  };
  tiers: StandardTier[];
  oversize: OversizeTier[];
  storage: {
    /** £ per cubic foot per month. */
    standardPerCuFt: number;
    peakPerCuFt: number;
    /** Calendar months (1–12) billed at the peak rate. */
    peakMonths: number[];
  };
  referral: {
    defaultCategory: string;
    minimumFee: number;
    categories: ReferralCategory[];
    /** Amazon / Keepa category name (lower-cased) → referral category name. */
    categoryMap: Record<string, string>;
  };
}

const flat = (pct: number): ReferralBand[] => [{ upTo: null, pct }];
const banded = (...pairs: [number | null, number][]): ReferralBand[] =>
  pairs.map(([upTo, pct]) => ({ upTo, pct }));

export const UK_RATE_CARD_2026_07: RateCard = {
  name: "Amazon UK FBA — 1 July 2026",
  effectiveFrom: "2026-07-01",
  currency: "GBP",
  dimDivisor: 5000,
  lowPrice: {
    threshold: 20,
    reducedThreshold: 10,
    reducedCategories: ["Beauty, Health and Personal Care", "Office Products", "Grocery and Gourmet"],
  },
  tiers: [
    {
      id: "lightEnv", name: "Light envelope", maxDimsCm: [33, 23, 2.5], maxWeightG: 100, useDimWeight: false,
      bands: [[20, 1.83], [40, 1.87], [60, 1.89], [80, 2.07], [100, 2.08]],
      lowPriceBands: [[20, 1.46], [40, 1.5], [60, 1.52], [80, 1.67], [100, 1.7]],
    },
    {
      id: "stdEnv", name: "Standard envelope", maxDimsCm: [33, 23, 2.5], maxWeightG: 460, useDimWeight: false,
      bands: [[210, 2.1], [460, 2.16]],
      lowPriceBands: [[210, 1.73], [460, 1.87]],
    },
    {
      id: "largeEnv", name: "Large envelope", maxDimsCm: [33, 23, 4], maxWeightG: 960, useDimWeight: false,
      bands: [[960, 2.72]],
      lowPriceBands: [[960, 2.42]],
    },
    {
      id: "xlEnv", name: "Extra-large envelope", maxDimsCm: [33, 23, 6], maxWeightG: 960, useDimWeight: false,
      bands: [[960, 2.94]],
      lowPriceBands: [[960, 2.65]],
    },
    {
      id: "smallPcl", name: "Small parcel", maxDimsCm: [35, 25, 12], maxWeightG: 3900, useDimWeight: true,
      bands: [[150, 2.91], [400, 3.0], [900, 3.04], [1400, 3.05], [1900, 3.25], [3900, 3.27]],
      lowPriceBands: [[150, 2.67], [400, 2.7]],
      peakSurcharge: 0.11,
    },
    {
      id: "stdPcl", name: "Standard parcel", maxDimsCm: [45, 34, 26], maxWeightG: 11900, useDimWeight: true,
      bands: [[150, 2.94], [400, 3.01], [900, 3.06], [1400, 3.26], [1900, 3.48], [2900, 3.49], [3900, 3.54], [5900, 3.56], [8900, 3.57], [11900, 3.58]],
    },
  ],
  oversize: [
    { id: "smallOS", name: "Small oversize", maxDimsCm: [61, 46, 46], maxUnitWeightG: 1760, maxDimWeightG: 25820, baseFee: 3.49, baseWeightG: 760, perKg: 0.22 },
    { id: "stdOSL", name: "Standard oversize light", maxDimsCm: [101, 60, 60], maxUnitWeightG: 15000, maxDimWeightG: 72720, baseFee: 4.35, baseWeightG: 760, perKg: 0.15 },
    { id: "stdOSH", name: "Standard oversize heavy", maxDimsCm: [101, 60, 60], minUnitWeightG: 15001, maxUnitWeightG: 23000, maxDimWeightG: 72720, baseFee: 6.58, baseWeightG: 15760, perKg: 0.08 },
  ],
  storage: { standardPerCuFt: 0.62, peakPerCuFt: 0.82, peakMonths: [10, 11, 12] },
  referral: {
    defaultCategory: "Everything else",
    minimumFee: 0.25,
    categories: [
      { name: "Everything else", bands: flat(15) },
      { name: "Home Products", bands: banded([20, 8], [null, 15]) },
      { name: "Kitchen", bands: flat(15) },
      { name: "Home Linen and Rugs", bands: flat(15) },
      { name: "Lawn and Garden", bands: flat(15) },
      { name: "Sports and Outdoors", bands: flat(15) },
      { name: "Pet Supplies", bands: flat(15) },
      { name: "Pet Clothing and Food", bands: banded([10, 5], [null, 15]) },
      { name: "Office Products", bands: flat(15) },
      { name: "Toys and Games", bands: flat(15) },
      { name: "Tools and Home Improvement", bands: flat(13) },
      { name: "Home Adhesives and Cable Ties", bands: flat(13) },
      { name: "Door, Window and Shower Accessories", bands: flat(13) },
      { name: "Baby Products", bands: banded([10, 8], [null, 15]) },
      { name: "Baby Pushchairs and Safety Equipment", bands: banded([10, 8], [null, 15]) },
      { name: "Beauty, Health and Personal Care", bands: banded([10, 8], [null, 15]) },
      { name: "Vitamins, Minerals & Supplements", bands: banded([10, 5], [null, 15]) },
      { name: "Grocery and Gourmet", bands: banded([10, 5], [null, 15]) },
      { name: "Clothing and Accessories", bands: banded([15, 5], [20, 10], [null, 15]) },
      { name: "Footwear", bands: flat(15) },
      { name: "Rucksacks and Handbags", bands: flat(15) },
      { name: "Luggage", bands: flat(15) },
      { name: "Luggage Accessories", bands: flat(15) },
      { name: "Eyewear", bands: flat(15) },
      { name: "Jewellery", bands: banded([225, 20], [null, 5]) },
      { name: "Watches", bands: banded([225, 15], [null, 5]) },
      { name: "Furniture", bands: banded([175, 15], [null, 10]) },
      { name: "Furniture Accessories", bands: flat(13) },
      { name: "Mattresses", bands: flat(15) },
      { name: "Compact Appliances", bands: flat(15) },
      { name: "Full-Size Appliances", bands: flat(7) },
      { name: "Electronic Accessories", bands: banded([100, 15], [null, 8]) },
      { name: "Consumer Electronics", bands: flat(7) },
      { name: "Computers", bands: flat(7) },
      { name: "Printer and Scanner Accessories", bands: banded([100, 15], [null, 8]) },
      { name: "Commercial Electrical and Energy Supplies", bands: flat(12) },
      { name: "Business, Industrial, and Scientific Supplies", bands: flat(15) },
      { name: "Automotive and Powersports", bands: banded([45, 15], [null, 9]) },
      { name: "Cycling Accessories", bands: flat(15) },
      { name: "Musical Instruments and AV Production", bands: flat(12) },
      { name: "Packing Materials", bands: flat(15) },
      { name: "Handmade", bands: flat(12) },
    ],
    // Amazon.co.uk browse-root names as SP-API and Keepa report them. Edit in Settings.
    categoryMap: {
      "beauty": "Beauty, Health and Personal Care",
      "health & personal care": "Beauty, Health and Personal Care",
      "health and personal care": "Beauty, Health and Personal Care",
      "luxury beauty": "Beauty, Health and Personal Care",
      "grocery": "Grocery and Gourmet",
      "grocery & gourmet food": "Grocery and Gourmet",
      "home & kitchen": "Home Products",
      "home and kitchen": "Home Products",
      "kitchen & home": "Home Products",
      "garden & outdoors": "Lawn and Garden",
      "garden": "Lawn and Garden",
      "sports & outdoors": "Sports and Outdoors",
      "pet supplies": "Pet Supplies",
      "stationery & office supplies": "Office Products",
      "office products": "Office Products",
      "toys & games": "Toys and Games",
      "diy & tools": "Tools and Home Improvement",
      "tools & home improvement": "Tools and Home Improvement",
      "baby": "Baby Products",
      "baby products": "Baby Products",
      "fashion": "Clothing and Accessories",
      "clothing": "Clothing and Accessories",
      "shoes & bags": "Footwear",
      "luggage": "Luggage",
      "jewellery": "Jewellery",
      "watches": "Watches",
      "electronics & photo": "Consumer Electronics",
      "electronics": "Consumer Electronics",
      "computers & accessories": "Computers",
      "large appliances": "Full-Size Appliances",
      "automotive": "Automotive and Powersports",
      "musical instruments & dj": "Musical Instruments and AV Production",
      "business, industry & science": "Business, Industrial, and Scientific Supplies",
      "lighting": "Home Products",
      "handmade": "Handmade",
    },
  },
};
