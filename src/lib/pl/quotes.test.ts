import { describe, expect, it } from "vitest";
import { certificationsFor, landedCost, landedInputs, priceMultiple, rfqText } from "./quotes";

const q = { unit_price: 1.8, moq: 500, currency: "USD" as const, calc: { fx: 1.27, freight: 180, dutyPct: 6.5 } };

describe("landed cost", () => {
  it("the bottle brush example: $1.80 × 500, freight £180, duty 6.5%, FX 1.27, import VAT 20%", () => {
    // Goods $900 ÷ 1.27 = £708.66; duty 6.5% of £888.66 = £57.76; VAT 20% of £946.42 = £189.28; total £1,135.71.
    const l = landedCost(q)!;
    expect(l).toMatchObject({ units: 500, goods: 708.66, freight: 180, duty: 57.76, vat: 189.28, total: 1135.71, perUnit: 2.27, perUnitExVat: 1.89 });
  });
  it("defaults: units = MOQ, FX from the currency, VAT on, the rest 0", () => {
    expect(landedInputs({ moq: 300, currency: "CNY", calc: null })).toEqual({ units: 300, fx: 9.2, freight: 0, dutyPct: 0, vat: true, inspection: 0, other: 0 });
    expect(landedCost({ ...q, calc: { ...q.calc, vat: false, inspection: 120 } })!.total).toBeCloseTo(708.66 + 180 + 57.76 + 120, 1);
    expect(landedCost({ ...q, unit_price: null })).toBeNull();
  });
});

describe("price multiple", () => {
  it("Gatekeeper's bands", () => {
    expect(priceMultiple(12.99, 2.27)).toMatchObject({ status: "pass" });
    expect(priceMultiple(7.5, 2.27)!.status).toBe("warn");
    expect(priceMultiple(6, 2.27)!.status).toBe("fail");
    expect(priceMultiple(null, 2)).toBeNull();
  });
});

describe("RFQ", () => {
  it("names the product, the differentiator, the tiers and the category's certifications", () => {
    const t = rfqText({ name: "bottle brush", nicheKeyword: "bottle brush", category: "Baby Products", differentiator: "the only bottle brush with a drying stand" });
    expect(t).toMatch(/bottle brush, made to this specification: the only bottle brush with a drying stand/);
    expect(t).toMatch(/300, 500 and 1,000 units/);
    expect(t).toMatch(/EN 14350/);
    expect(certificationsFor("Kitchen and Home")[0]).toMatch(/Food-contact/);
  });
});
