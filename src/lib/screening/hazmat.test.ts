import { describe, expect, it } from "vitest";
import { parseDg } from "../spapi/parse";
import { UK_RATE_CARD_2026_07 } from "../fees/rateCard";
import { withDefaults } from "./config";
import { runGates, type ScreenContext } from "./gates";
import { amazonRuleMatches, DEFAULT_RULES } from "./rules";

// Attribute shapes as the SP-API catalog returns them for real UK listings.
const aerosol = { hazmat: [{ aspect: "proper_shipping_name", value: "AEROSOLS" }, { aspect: "united_nations_regulatory_id", value: "UN1950" }, { aspect: "transportation_regulatory_class", value: "2.1" }] };
const perfume = { hazmat: [{ aspect: "proper_shipping_name", value: "PERFUMERY PRODUCTS" }, { aspect: "united_nations_regulatory_id", value: "UN1266" }, { aspect: "regulatory_packing_group", value: "II" }] };
const notRegulated = { hazmat: [{ aspect: "transportation_regulatory_class", value: "0" }], ghs: [{ classification: [{ class: "amzn_specific_no_label_with_warning" }] }], supplier_declared_dg_hz_regulation: [{ value: "not_applicable" }] };

describe("parseDg", () => {
  it("reads the hazmat entry, GHS classes and heat sensitivity", () => {
    expect(parseDg(aerosol, [])).toEqual({ hazmat: { un: "UN1950", name: "AEROSOLS", class: "2.1" }, ghs: [], declared: [], heatSensitive: false });
    expect(parseDg({ ghs: [{ classification: [{ class: "flammable" }, { class: "amzn_specific_no_label_with_warning" }] }], is_heat_sensitive: [{ value: true }] }, [])).toEqual({ hazmat: null, ghs: ["flammable"], declared: [], heatSensitive: true });
  });
  it("treats class 0 and Amazon's no-label placeholder as nothing", () => {
    expect(parseDg(notRegulated, [])).toEqual({ hazmat: null, ghs: [], declared: [], heatSensitive: false });
  });
});

describe("amazonRuleMatches", () => {
  const keys = (a: Record<string, unknown>) => amazonRuleMatches(DEFAULT_RULES, parseDg(a, [])).map((m) => [m.key, m.hit]);
  it("maps Amazon's data onto the rules", () => {
    expect(keys(aerosol)).toEqual([["aerosol", "Amazon marks this as hazmat: UN1950, Aerosols, class 2.1"]]);
    expect(keys(perfume)).toEqual([["fragrance", "Amazon marks this as hazmat: UN1266, Perfumery products"]]);
    expect(keys({ hazmat: [{ aspect: "transportation_regulatory_class", value: "9" }] })).toEqual([["chemical", "Amazon marks this as hazmat: class 9"]]);
    expect(keys({ hazmat: [{ aspect: "united_nations_regulatory_id", value: "UN3481" }] })[0][0]).toBe("battery");
    expect(keys({ ghs: [{ classification: [{ class: "flammable" }] }] })).toEqual([["fragrance", "Amazon marks this as flammable under GHS"]]);
    expect(keys({ is_heat_sensitive: [{ value: true }] })).toEqual([["meltable", "Amazon marks this as heat-sensitive"]]);
    expect(keys(notRegulated)).toEqual([]);
    expect(keys({ hazmat: [{ aspect: "proper_shipping_name", value: "auto-grounding" }] })).toEqual([]);
  });
  it("falls back to the older stored flags", () => {
    expect(amazonRuleMatches(DEFAULT_RULES, null, ["transportation", "batteries"]).map((m) => m.key)).toEqual(["chemical", "battery"]);
  });
});

describe("compliance gate with Amazon's data", () => {
  const ctx = (text: string, attrs: Record<string, unknown> | null): ScreenContext => ({
    now: new Date("2026-09-25T12:00:00Z"), card: UK_RATE_CARD_2026_07, rules: DEFAULT_RULES, text, amazonCategory: "Beauty",
    offer: { unitCostGbp: 5, moq: 12, goodsVatRatePct: 20, supplierMovGbp: null },
    match: { asin: "B000TEST01", asinCount: 1, looked: true },
    product: { referralCategory: "Beauty", dimsCm: { l: 15, w: 12, h: 8 }, weightG: 200, variationCount: null, hazmat: [], amazonDg: attrs ? parseDg(attrs, []) : null },
    market: null, restriction: null, amazonFees: null,
  });
  const profile = (mode: "fail" | "warn") => withDefaults({ gates: { compliance: { mode: "fail", rules: { aerosol: mode, cosmetic: "off", liquid: "off" } } } } as unknown as Parameters<typeof withDefaults>[0]);
  const comp = (c: ScreenContext, mode: "fail" | "warn") => runGates(c, profile(mode)).outcomes.find((o) => o.gate === "compliance")!;

  it("says Amazon marks it, ahead of the keyword, and the rule's mode applies", () => {
    const c = ctx("Avene Thermal Spring Water Spray 150 ml aerosol", aerosol);
    expect(comp(c, "fail")).toMatchObject({ status: "fail", detail: "Aerosol (Amazon marks this as hazmat: UN1950, Aerosols, class 2.1)" });
    expect(comp(c, "warn")).toMatchObject({ status: "warn" });
    expect(comp(c, "warn").tags).toContain("AMAZON_DG");
  });
  it("keyword match when Amazon says nothing", () => {
    expect(comp(ctx("Dry shampoo aerosol 200ml", notRegulated), "fail")).toMatchObject({ status: "fail", detail: "Aerosol (keyword match: aerosol)" });
  });
});
