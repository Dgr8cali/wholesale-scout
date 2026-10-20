import { describe, expect, it } from "vitest";
import { GENERIC_CRITERIA, LENS_CRITERIA, LENS_SPEC, arrival, bestOf, certificationsFor, checkLabels, labelsOf, exwTotal, landedCost, landedInputs, priceMultiple, rfqText, sampleAverage, sampleStatusOf } from "./quotes";

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

describe("extras, the EXW total and the comparison", () => {
  // Sophia's lens wipes: $2.90 × 500 + plate $90 + cards $55 + shrink $15 = $1,610 EXW; sea DDP $720 = £566.93.
  const sophia = { unit_price: 2.9, moq: 500, currency: "USD" as const, extras: { plate: 90, cards: 55, shrink: 15 }, calc: { fx: 1.27, freight: 566.93, vat: false }, lead_time_days: 25, transit_days: 45 };
  it("the extras join the EXW total and the landed cost", () => {
    expect(exwTotal(sophia)).toBe(1610);
    const l = landedCost(sophia)!;
    expect(l.extras).toBeCloseTo(125.98, 2);
    expect(l.total).toBeCloseTo(1141.73 + 125.98 + 566.93, 1);
    expect(l.perUnit).toBe(3.67);
    // Duty is charged on the extras too.
    expect(landedCost({ ...sophia, calc: { ...sophia.calc, dutyPct: 10 } })!.duty).toBeCloseTo((1141.73 + 125.98 + 566.93) * 0.1, 0);
  });
  it("arrival: production + transit from the order day; unknown without both", () => {
    const a = arrival(sophia, new Date("2026-10-20T12:00:00Z"))!;
    expect(a.days).toBe(70);
    expect(a.date.toISOString().slice(0, 10)).toBe("2026-12-29");
    expect(arrival({ lead_time_days: 25, transit_days: null })).toBeNull();
  });
  it("best of a row: lowest or highest, ties all marked, nothing when one value or all equal", () => {
    expect([...bestOf([2.73, 3.67], "low")]).toEqual([0]);
    expect([...bestOf([5.1, 3.8, null], "high")]).toEqual([0]);
    expect([...bestOf([2, 2, 3], "low")]).toEqual([0, 1]);
    expect(bestOf([2, 2], "low").size).toBe(0);
    expect(bestOf([2, null], "low").size).toBe(0);
  });
  it("sample scores: the average over the scored criteria; the samples' state", () => {
    expect(sampleAverage({ moisture: 4, smell: 5, note: "ok" }, LENS_CRITERIA)).toBe(4.5);
    expect(sampleAverage({ moisture: 4 }, GENERIC_CRITERIA)).toBeNull();
    expect(sampleAverage({}, LENS_CRITERIA)).toBeNull();
    expect(sampleStatusOf({ status: "samples received" })).toBe("received");
    expect(sampleStatusOf({ status: "chosen", sample_status: "ordered" })).toBe("ordered");
    expect(sampleStatusOf({ status: "requested" })).toBe("not ordered");
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

describe("per-candidate labels", () => {
  it("a candidate's own labels, else the generic set; a malformed set falls back", () => {
    expect(labelsOf({ sample_criteria: LENS_CRITERIA, spec_fields: LENS_SPEC }).criteria[0].label).toBe("Moisture / stays wet");
    expect(labelsOf({}).criteria).toBe(GENERIC_CRITERIA);
    expect(labelsOf({ sample_criteria: LENS_CRITERIA.slice(0, 3) }).criteria).toBe(GENERIC_CRITERIA);
  });
  it("renaming keeps the key (so the scores stay); six and four, named, under 40 characters", () => {
    const cur = labelsOf({ sample_criteria: LENS_CRITERIA, spec_fields: LENS_SPEC });
    const next = checkLabels({ criteria: LENS_CRITERIA.map((l, i) => (i === 2 ? { label: "Scent" } : l)) }, cur);
    expect(next.criteria[2]).toEqual({ k: "smell", label: "Scent" });
    expect(next.spec).toBe(cur.spec);
    expect(() => checkLabels({ criteria: LENS_CRITERIA.slice(0, 5) }, cur)).toThrow(/exactly 6/);
    expect(() => checkLabels({ spec: ["a", "", "c", "d"].map((label) => ({ label })) }, cur)).toThrow(/Spec label 2: give it a name/);
    expect(() => checkLabels({ criteria: LENS_CRITERIA.map((l) => ({ ...l, k: "same" })) }, cur)).toThrow(/share a key/);
  });
});
