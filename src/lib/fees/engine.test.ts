import { describe, expect, it } from "vitest";
import {
  DEFAULT_FEE_ASSUMPTIONS as A,
  computeFees,
  dimensionalWeightG,
  economics,
  hurdlePrice,
  landedCost,
  meetsFloors,
  referralCategoryFor,
  referralPct,
  sizeTier,
  storagePerUnit,
  type FeeAssumptions,
} from "./engine";
import { UK_RATE_CARD_2026_07 as CARD } from "./rateCard";

const JUNE = new Date("2026-06-15T12:00:00Z");
const NOV = new Date("2026-11-15T12:00:00Z");
const MULT = 1.02 * 1.2; // DSF then VAT, unregistered seller

describe("size tiers and weight bands", () => {
  it("puts a thin, light item in the light envelope by actual weight", () => {
    const t = sizeTier({ l: 20, w: 15, h: 1 }, 50, CARD);
    expect(t.id).toBe("lightEnv");
    expect(t.fee).toBe(1.89); // 40–60 g band
    expect(t.lowPriceFee).toBe(1.52);
  });

  it("sorts dimensions before fitting, so orientation doesn't matter", () => {
    expect(sizeTier({ l: 1, w: 20, h: 15 }, 50, CARD).id).toBe("lightEnv");
  });

  it("ignores dimensional weight for envelopes", () => {
    // 30×20×2 = 240 g dimensional; billed on 400 g actual → standard envelope 210–460 g
    const t = sizeTier({ l: 30, w: 20, h: 2 }, 400, CARD);
    expect(t.id).toBe("stdEnv");
    expect(t.shippingWeightG).toBe(400);
    expect(t.fee).toBe(2.16);
  });

  it("moves an envelope-sized item over 100 g out of the light envelope", () => {
    expect(sizeTier({ l: 20, w: 15, h: 1 }, 101, CARD).id).toBe("stdEnv");
  });

  it("bills parcels on dimensional weight L×W×H/5000 when it exceeds actual", () => {
    // 30×20×10 = 6000 cm³ → 1.2 kg dimensional vs 300 g actual → small parcel 900–1400 g band
    expect(dimensionalWeightG({ l: 30, w: 20, h: 10 }, CARD)).toBe(1200);
    const t = sizeTier({ l: 30, w: 20, h: 10 }, 300, CARD);
    expect(t.id).toBe("smallPcl");
    expect(t.shippingWeightG).toBe(1200);
    expect(t.fee).toBe(3.05);
  });

  it("bills parcels on actual weight when heavier than dimensional", () => {
    const t = sizeTier({ l: 20, w: 15, h: 10 }, 1500, CARD); // 600 g dimensional
    expect(t.shippingWeightG).toBe(1500);
    expect(t.fee).toBe(3.25); // 1400–1900 g
  });

  it("uses the standard parcel when too big for the small parcel", () => {
    const t = sizeTier({ l: 40, w: 30, h: 20 }, 2000, CARD); // 4.8 kg dimensional
    expect(t.id).toBe("stdPcl");
    expect(t.shippingWeightG).toBe(4800);
    expect(t.fee).toBe(3.56); // 3900–5900 g
  });

  it("prices small oversize as base plus per-kg above 760 g", () => {
    const t = sizeTier({ l: 50, w: 40, h: 30 }, 1000, CARD); // 12 kg dimensional
    expect(t.id).toBe("smallOS");
    expect(t.fee).toBeCloseTo(3.49 + ((12000 - 760) / 1000) * 0.22, 6);
  });

  it("returns no fee outside every tier", () => {
    const t = sizeTier({ l: 150, w: 10, h: 10 }, 500, CARD);
    expect(t.id).toBeNull();
    expect(t.fee).toBeNull();
  });
});

describe("referral fees", () => {
  it("applies the band rate to the whole price", () => {
    expect(referralPct("Home Products", 20, CARD)).toBe(8);
    expect(referralPct("Home Products", 20.01, CARD)).toBe(15);
    expect(referralPct("Beauty, Health and Personal Care", 10, CARD)).toBe(8);
    expect(referralPct("Beauty, Health and Personal Care", 10.01, CARD)).toBe(15);
    expect(referralPct("Clothing and Accessories", 15, CARD)).toBe(5);
    expect(referralPct("Clothing and Accessories", 18, CARD)).toBe(10);
    expect(referralPct("Clothing and Accessories", 25, CARD)).toBe(15);
    expect(referralPct("Tools and Home Improvement", 50, CARD)).toBe(13);
    expect(referralPct("Jewellery", 300, CARD)).toBe(5);
  });

  it("falls back to Everything else for an unknown category", () => {
    expect(referralPct("Not a category", 30, CARD)).toBe(15);
  });

  it("charges the £0.25 minimum referral fee", () => {
    const f = computeFees(1, { dimsCm: { l: 10, w: 10, h: 1 }, weightG: 20 }, CARD, A, { date: JUNE });
    expect(f.referralBase).toBe(0.25);
  });

  it("maps Amazon category names to referral categories", () => {
    expect(referralCategoryFor("Health & Personal Care", CARD)).toBe("Beauty, Health and Personal Care");
    expect(referralCategoryFor("DIY & Tools", CARD)).toBe("Tools and Home Improvement");
    expect(referralCategoryFor("Grocery", CARD)).toBe("Grocery and Gourmet");
    expect(referralCategoryFor("Something new", CARD)).toBe("Everything else");
    expect(referralCategoryFor(null, CARD)).toBe("Everything else");
  });
});

describe("low-price FBA", () => {
  const smallParcel = { dimsCm: { l: 15, w: 12, h: 8 }, weightG: 200 }; // 288 g dimensional, too deep for an envelope → small parcel 400 g band

  it("uses the low-price fee at or under £20", () => {
    const f = computeFees(20, smallParcel, CARD, A, { date: JUNE });
    expect(f.lowPrice).toBe(true);
    expect(f.fbaSource).toBe("low-price");
    expect(f.fbaBase).toBe(2.7);
  });

  it("uses the standard fee over £20", () => {
    const f = computeFees(20.01, smallParcel, CARD, A, { date: JUNE });
    expect(f.lowPrice).toBe(false);
    expect(f.fbaBase).toBe(3.0);
  });

  it("uses a £10 threshold for Beauty, Office and Grocery", () => {
    for (const cat of ["Beauty, Health and Personal Care", "Office Products", "Grocery and Gourmet"]) {
      const at15 = computeFees(15, { ...smallParcel, referralCategory: cat }, CARD, A, { date: JUNE });
      expect(at15.lowPriceThreshold).toBe(10);
      expect(at15.fbaBase).toBe(3.0);
      const at10 = computeFees(10, { ...smallParcel, referralCategory: cat }, CARD, A, { date: JUNE });
      expect(at10.fbaBase).toBe(2.7);
    }
  });

  it("falls back to the standard fee when the weight is past the low-price bands", () => {
    const heavy = { dimsCm: { l: 15, w: 12, h: 8 }, weightG: 800 };
    const f = computeFees(15, heavy, CARD, A, { date: JUNE });
    expect(f.lowPrice).toBe(true);
    expect(f.fbaSource).toBe("standard");
    expect(f.fbaBase).toBe(3.04);
  });
});

describe("VAT, DSF, storage and peak", () => {
  const item = { dimsCm: { l: 20, w: 15, h: 1 }, weightG: 50 };

  it("adds 2% DSF and 20% VAT to Amazon's fees for an unregistered seller", () => {
    const f = computeFees(25, item, CARD, A, { date: JUNE });
    expect(f.feeMultiplier).toBeCloseTo(MULT, 10);
    expect(f.referral).toBeCloseTo(3.75 * MULT, 10);
    expect(f.fba).toBeCloseTo(1.89 * MULT, 10);
  });

  it("adds only DSF for a VAT-registered seller", () => {
    const f = computeFees(25, item, CARD, { ...A, vatRegistered: true }, { date: JUNE });
    expect(f.feeMultiplier).toBeCloseTo(1.02, 10);
  });

  it("charges storage by cubic feet at £0.62, and £0.82 in Oct–Dec", () => {
    const cuFt = 1000 / 28316.846592;
    expect(storagePerUnit({ l: 10, w: 10, h: 10 }, CARD, A, JUNE)).toBeCloseTo(cuFt * 0.62 * 2, 10);
    expect(storagePerUnit({ l: 10, w: 10, h: 10 }, CARD, A, NOV)).toBeCloseTo(cuFt * 0.82 * 2, 10);
    expect(storagePerUnit({ l: 10, w: 10, h: 10 }, CARD, { ...A, season: "peak" }, JUNE)).toBeCloseTo(cuFt * 0.82 * 2, 10);
  });

  it("adds the peak surcharge on small parcels in Q4", () => {
    const parcel = { dimsCm: { l: 15, w: 12, h: 8 }, weightG: 200 };
    expect(computeFees(25, parcel, CARD, A, { date: NOV }).fbaBase).toBeCloseTo(3.11, 10);
    expect(computeFees(25, parcel, CARD, A, { date: JUNE }).fbaBase).toBe(3.0);
  });
});

describe("missing dimensions and Amazon's own fees", () => {
  it("bills at the assumed tier and flags it", () => {
    const f = computeFees(25, {}, CARD, A, { date: JUNE });
    expect(f.dimsEstimated).toBe(true);
    expect(f.fbaSource).toBe("assumed-tier");
    expect(f.tier?.id).toBe("smallPcl");
    expect(f.fbaBase).toBe(3.0); // 400 g band
  });

  it("replaces referral and FBA with getMyFeesEstimate figures", () => {
    const f = computeFees(25, {}, CARD, A, { date: JUNE, amazon: { referral: 3.5, fba: 2.5 } });
    expect(f.source).toBe("amazon");
    expect(f.fbaSource).toBe("amazon");
    expect(f.referral).toBeCloseTo(3.5 * MULT, 10);
    expect(f.fba).toBeCloseTo(2.5 * MULT, 10);
  });
});

describe("landed cost and economics", () => {
  it("adds goods VAT to landed cost only when unregistered", () => {
    expect(landedCost(5, {}, A).total).toBeCloseTo(5 * 1.2 + 0.3 + 0.15, 10);
    expect(landedCost(5, {}, { ...A, vatRegistered: true }).total).toBeCloseTo(5 + 0.3 + 0.15, 10);
    expect(landedCost(5, { goodsVatRatePct: 0 }, A).total).toBeCloseTo(5 + 0.3 + 0.15, 10);
  });

  it("applies duty before VAT", () => {
    const l = landedCost(10, {}, { ...A, dutyPct: 5 });
    expect(l.duty).toBeCloseTo(0.5, 10);
    expect(l.goodsVat).toBeCloseTo(10.5 * 0.2, 10);
  });

  it("computes profit, ROI and margin for a worked example", () => {
    // £25, light envelope 50 g, 20×15×1 cm, cost £5 ex-VAT, unregistered, June.
    const e = economics(25, 5, { dimsCm: { l: 20, w: 15, h: 1 }, weightG: 50 }, CARD, A, { date: JUNE });
    const referral = 3.75 * MULT;
    const fba = 1.89 * MULT;
    const storage = (300 / 28316.846592) * 0.62 * 2 * MULT;
    const returns = 0.5;
    const landed = 6.45;
    const profit = 25 - referral - fba - storage - returns - landed;
    expect(e.fees.totalFees).toBeCloseTo(referral + fba + storage + returns, 8);
    expect(e.landed.total).toBeCloseTo(landed, 10);
    expect(e.profit).toBe(Math.round(profit * 100) / 100); // 11.13
    expect(e.roi).toBe(Math.round((profit / landed) * 10000) / 100);
    expect(e.margin).toBe(Math.round((profit / 25) * 10000) / 100);
  });

  it("deducts output VAT from revenue when registered", () => {
    const reg: FeeAssumptions = { ...A, vatRegistered: true };
    const e = economics(24, 5, { dimsCm: { l: 20, w: 15, h: 1 }, weightG: 50 }, CARD, reg, { date: JUNE });
    expect(e.outputVat).toBeCloseTo(4, 10);
    expect(e.netRevenue).toBeCloseTo(20, 10);
  });

  it("returns null profit when the FBA fee is unknown", () => {
    const e = economics(25, 5, { dimsCm: { l: 150, w: 10, h: 10 }, weightG: 500 }, CARD, A, { date: JUNE });
    expect(e.profit).toBeNull();
    expect(e.roi).toBeNull();
  });
});

describe("hurdle price", () => {
  const item = { dimsCm: { l: 15, w: 12, h: 8 }, weightG: 200 };
  const floors = { minProfit: 2, minRoiPct: 20, minMarginPct: 15 };

  it("finds the lowest price that clears every floor, to the penny", () => {
    const h = hurdlePrice(6, item, CARD, A, floors, { date: JUNE });
    expect(h).not.toBeNull();
    const at = economics(h!, 6, item, CARD, A, { date: JUNE });
    const below = economics(Math.round((h! - 0.01) * 100) / 100, 6, item, CARD, A, { date: JUNE });
    expect(meetsFloors(at, floors)).toBe(true);
    expect(meetsFloors(below, floors)).toBe(false);
  });

  it("returns null when nothing up to the cap clears", () => {
    expect(hurdlePrice(6, { dimsCm: { l: 150, w: 10, h: 10 }, weightG: 500 }, CARD, A, floors, { date: JUNE, maxPrice: 100 })).toBeNull();
  });
});
