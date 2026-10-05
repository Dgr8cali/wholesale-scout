import { describe, expect, it } from "vitest";
import { maxMoqOf, pricePerOurUnit, productWords, scoreSupplier, targetExworks, titleCount, type LeadInput, type SupplierTargets } from "./supplierScore";

const lead = (o: Partial<LeadInput> = {}): LeadInput => ({
  title: "Individually Wrapped Pre-moistened Lens Cleaning Wipes", priceMin: 0.5, priceMax: 0.5, currency: "GBP", priceUnit: "box",
  moq: 1000, moqUnit: "box", supplierName: "Hangzhou Micker Sanitary Products Co., Ltd.", supplierYears: 9, rating: 4.9, reviewCount: 22,
  badges: ["Verified", "Trade Assurance"], ...o,
});
const T: SupplierTargets = { exworks: 0.5, maxMoq: 1000, unit: "box", words: productWords("Lens cleaning wipes", "lens wipes") };

describe("Supplier Scout score", () => {
  it("product words: name and niche keyword, singular, no stop words", () => {
    expect(productWords("Lens cleaning wipes", "lens wipe")).toEqual(["lens", "cleaning", "wipes"]);
    expect(productWords("A box of 100 pill boxes")).toEqual(["pill", "boxes"]);
  });

  it("a listing that hits every target scores 100", () => {
    expect(scoreSupplier(lead(), T)).toMatchObject({ score: 100, flags: [], perUnit: 0.5, moqOurs: 1000 });
  });

  it("price (35): full at the target, half at 1.5×, nothing at 2× and over; HIGH_PRICE above the target", () => {
    const p = (x: number) => scoreSupplier(lead({ priceMax: x }), T);
    expect(p(0.5).breakdown.price.points).toBe(35);
    expect(p(0.4).breakdown.price.points).toBe(35);
    expect(p(0.75).breakdown.price.points).toBe(17.5);
    expect(p(1).breakdown.price.points).toBe(0);
    expect(p(3).breakdown.price.points).toBe(0);
    expect(p(0.5).flags).not.toContain("HIGH_PRICE");
    expect(p(0.51).flags).toContain("HIGH_PRICE");
    // The top of a range is the price at the MOQ.
    expect(scoreSupplier(lead({ priceMin: 0.3, priceMax: 0.75 }), T).breakdown.price.points).toBe(17.5);
  });

  it("per piece × the title's count: 200pcs at £0.01 a piece is £2.00 a box", () => {
    const l = lead({ title: "Lens cleaning wipes 200pcs individually wrapped", priceMax: 0.01, priceMin: 0.01, priceUnit: "piece", moq: 100000, moqUnit: "piece" });
    expect(pricePerOurUnit(l, "box")).toMatchObject({ perUnit: 2, factor: 200 });
    const s = scoreSupplier(l, { ...T, exworks: 2 });
    expect(s).toMatchObject({ perUnit: 2, moqOurs: 500 });
    expect(s.breakdown.price.points).toBe(35);
    expect(s.flags).not.toContain("UNIT_UNCLEAR");
    // Ours a piece, theirs a box of 50.
    expect(pricePerOurUnit(lead({ title: "Lens wipes 50/box", priceMax: 2.5 }), "piece")).toMatchObject({ perUnit: 0.05 });
  });

  it("an unclear unit or a foreign currency: half the price points and UNIT_UNCLEAR", () => {
    const several = scoreSupplier(lead({ title: "Lens wipes 100 200 400pcs", priceUnit: "piece", moqUnit: "piece" }), T);
    expect(several.breakdown.price.points).toBe(17.5);
    expect(several.flags).toContain("UNIT_UNCLEAR");
    expect(titleCount("Lens wipes 100 200 400pcs")).toBeNull();
    expect(titleCount("Pack of 50 lens wipes")).toBe(50);
    expect(scoreSupplier(lead({ currency: "USD" }), T)).toMatchObject({ perUnit: null, flags: ["UNIT_UNCLEAR"] });
    expect(scoreSupplier(lead({ priceUnit: null, moqUnit: null }), T).breakdown.price.note).toMatch(/unit isn't shown/);
  });

  it("no target yet: half the price points, no flag", () => {
    expect(scoreSupplier(lead(), { ...T, exworks: null })).toMatchObject({ flags: [] });
    expect(scoreSupplier(lead(), { ...T, exworks: null }).breakdown.price.points).toBe(17.5);
  });

  it("MOQ (20): full up to the max, half at 3×, nothing at 5× and over; MOQ_TOO_HIGH above the max", () => {
    const m = (x: number) => scoreSupplier(lead({ moq: x }), T);
    expect(m(1000).breakdown.moq.points).toBe(20);
    expect(m(3000).breakdown.moq.points).toBe(10);
    expect(m(5000).breakdown.moq.points).toBe(0);
    expect(m(20000).breakdown.moq.points).toBe(0);
    expect(m(1000).flags).not.toContain("MOQ_TOO_HIGH");
    expect(m(1001).flags).toContain("MOQ_TOO_HIGH");
    expect(scoreSupplier(lead({ moq: null }), T).breakdown.moq.points).toBe(10);
  });

  it("trust (25): each signal at its edge, bonuses capped at 25", () => {
    const tr = (o: Partial<LeadInput>) => scoreSupplier(lead({ badges: [], supplierYears: null, rating: null, reviewCount: null, ...o }), T).breakdown.trust.points;
    expect(tr({})).toBe(0);
    expect([tr({ supplierYears: 5 }), tr({ supplierYears: 4 }), tr({ supplierYears: 3 }), tr({ supplierYears: 2 })]).toEqual([6, 3, 3, 0]);
    expect([tr({ rating: 4.7 }), tr({ rating: 4.6 }), tr({ rating: 4.5 }), tr({ rating: 4.4 })]).toEqual([5, 2.5, 2.5, 0]);
    expect([tr({ reviewCount: 10 }), tr({ reviewCount: 9 }), tr({ reviewCount: 3 }), tr({ reviewCount: 2 })]).toEqual([4, 2, 2, 0]);
    expect([tr({ badges: ["Verified"] }), tr({ badges: ["Trade Assurance"] }), tr({ badges: ["Verified Pro"] }), tr({ badges: ["Alibaba Guaranteed"] })]).toEqual([5, 5, 7, 2]);
    expect(tr({ supplierYears: 9, rating: 5, reviewCount: 50, badges: ["Verified", "Verified Pro", "Trade Assurance", "Alibaba Guaranteed"] })).toBe(25);
  });

  it("relevance (20): the share of product words; a reject word is OFF_PRODUCT; microfibre only when the title isn't the product", () => {
    expect(scoreSupplier(lead({ title: "Lens wipes, 100 sachets" }), T).breakdown.relevance.points).toBe(13.3);
    const off = scoreSupplier(lead({ title: "Microfiber lens cleaning cloth" }), T);
    expect(off.flags).toContain("OFF_PRODUCT");
    expect(off.breakdown.relevance.points).toBe(0);
    expect(off.score).toBeGreaterThan(0);
    expect(scoreSupplier(lead({ title: "Lens cleaning wipes with microfiber cloth" }), T).breakdown.relevance.note).toMatch(/"cloth"/);
    expect(scoreSupplier(lead({ title: "Lens cleaning wipes, microfibre soft" }), T).flags).not.toContain("OFF_PRODUCT");
    expect(scoreSupplier(lead({ title: "Microfibre lens wipes" }), T).flags).toContain("OFF_PRODUCT");
    expect(scoreSupplier(lead({ title: "Glass cleaner" }), T).flags).toContain("OFF_PRODUCT");
    // The candidate's own word isn't a reject: a cloth candidate.
    expect(scoreSupplier(lead({ title: "Microfiber lens cloth" }), { ...T, words: productWords("Lens cloth") }).flags).not.toContain("OFF_PRODUCT");
    expect(scoreSupplier(lead({ title: "Lens wipes jumbo roll" }), T).breakdown.relevance.note).toMatch(/"roll"|"jumbo"/);
  });

  it("NOT_FACTORY: a trading company, or no Co., Ltd and no factory word", () => {
    expect(scoreSupplier(lead({ supplierName: "Yiwu Trading Co., Ltd." }), T).flags).toContain("NOT_FACTORY");
    expect(scoreSupplier(lead({ supplierName: "Yiwu Trading Co., Ltd.", title: "Factory lens cleaning wipes" }), T).flags).not.toContain("NOT_FACTORY");
    expect(scoreSupplier(lead({ supplierName: "Best Wipes Store" }), T).flags).toContain("NOT_FACTORY");
    expect(scoreSupplier(lead({ supplierName: "Ningbo Manufacturing" }), T).flags).not.toContain("NOT_FACTORY");
    expect(scoreSupplier(lead(), T).flags).not.toContain("NOT_FACTORY");
  });

  it("targets: landed ÷ 1.4 unless Gate 6 has its own; MOQ 1,000 by default", () => {
    expect(targetExworks({ landed: "1.40" })).toEqual({ value: 1, derived: true });
    expect(targetExworks({ landed: "1.40", targetExworks: "0.8" })).toEqual({ value: 0.8, derived: false });
    expect(targetExworks({})).toEqual({ value: null, derived: true });
    expect([maxMoqOf({}), maxMoqOf({ maxMoq: "500" })]).toEqual([1000, 500]);
  });
});
