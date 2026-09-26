import { describe, expect, it } from "vitest";
import { UK_RATE_CARD_2026_07 } from "../fees/rateCard";
import { parseCatalogItem } from "../spapi/parse";
import { withDefaults } from "./config";
import { runGates, type ScreenContext } from "./gates";
import { DEFAULT_RULES, matchRules } from "./rules";

const ctx = (text: string, amazonCategory: string | null = "Beauty", amazonSignals: string[] = []): ScreenContext => ({
  now: new Date("2026-09-26T12:00:00Z"), card: UK_RATE_CARD_2026_07, rules: DEFAULT_RULES, text, amazonCategory,
  offer: { unitCostGbp: 5, moq: 12, goodsVatRatePct: 20, supplierMovGbp: null },
  match: { asin: "B000TEST01", asinCount: 1, looked: true },
  product: { referralCategory: "Beauty", dimsCm: { l: 15, w: 12, h: 8 }, weightG: 200, variationCount: null, hazmat: [], amazonDg: null, amazonSignals },
  market: null, restriction: null, amazonFees: null,
});
const profile = withDefaults({});
const comp = (c: ScreenContext) => runGates(c, profile).outcomes.find((o) => o.gate === "compliance")!;

describe("Medical device rule", () => {
  it("fires on medical words, replaces the Cosmetic keyword match, and says what it needs", () => {
    const o = comp(ctx("Savlon Antiseptic Cream 60g", "Health & Personal Care"));
    expect(o.status).toBe("warn");
    expect(o.detail).toBe("Medical device (keyword match: Antiseptic): needs UKCA/CE marking, Amazon category approval, and 105+ days' shelf life at FBA");
    expect(o.tags).toContain("MEDICALDEVICE");
    expect(o.tags).not.toContain("COSMETIC");
  });
  it("fires on Amazon's own signals (browse path, OTC), whatever the title", () => {
    expect(comp(ctx("Soothing cream 50g", "Health and Beauty", ["Over-the-Counter Medication", "Health & Personal Care"])).detail)
      .toBe("Medical device (category Over-the-Counter Medication): needs UKCA/CE marking, Amazon category approval, and 105+ days' shelf life at FBA");
    expect(comp(ctx("210 piece kit", "Health and Beauty", ["First Aid Kits", "First Aid"])).tags).toContain("MEDICALDEVICE");
  });
  it("keeps a category-sourced Cosmetic match; only the keyword one gives way", () => {
    const o = comp(ctx("Medicated lotion 200ml", "Beauty"));
    expect(o.detail).toContain("Cosmetic (category Beauty)");
    expect(o.detail).toContain("Medical device (keyword match: Medicated)");
  });
  it("a treatment isn't medical by that word alone; specific medical words are", () => {
    for (const t of ["Kundal Protein Treatment 500ml", "Goldwell Dualsenses Color 60sec Treatment 200ml", "Millers Oils Diesel Fuel Additive Treatment"])
      expect(comp(ctx(t)).tags ?? []).not.toContain("MEDICALDEVICE");
    for (const t of ["Emtrix Fungal Nail Treatment Cream", "Grahams Eczema Relief Cream", "SVR Cicavit+ Scar Cream", "HEMAPRO Cream to Treat Hemorrhoids", "Aktuva Cream for Actinic Keratosis"])
      expect(comp(ctx(t)).tags).toContain("MEDICALDEVICE");
  });
  it("hair and scalp products stay cosmetic (Medical device's exclusion words)", () => {
    const o = comp(ctx("Nioxin Scalp Therapy for eczema-prone scalp, Hair Conditioner 300ml", "Beauty", ["Hair Care", "Beauty", "conditioner"]));
    expect(o.tags).not.toContain("MEDICALDEVICE");
    expect(o.tags).toContain("COSMETIC");
  });
});

describe("exclusion words and pattern categories", () => {
  const rules = [{ key: "x", name: "X", keywords: ["cream"], amazon_categories: ["/garden/"], note: "", checklist: [], sort: 1, exclusions: ["ice cream", "/sun\\s?cream/"] }];
  it("skips a rule when the text has an exclusion word; categories match by pattern across signals", () => {
    expect(matchRules(rules, "Face cream").map((m) => m.hit)).toEqual(["cream"]);
    expect(matchRules(rules, "Vanilla ice cream maker")).toEqual([]);
    expect(matchRules(rules, "SPF 50 suncream")).toEqual([]);
    expect(matchRules(rules, "Hose", [null, "Garden & Outdoors", "hose"]).map((m) => m.hit)).toEqual(["category Garden & Outdoors"]);
  });
});

describe("catalog signals", () => {
  it("reads the browse path, item-type keyword and product type", () => {
    const item = {
      asin: "B000KKI1JM",
      summaries: [{ marketplaceId: "A1F83G8C2ARO7P", itemName: "Savlon Antiseptic Cream" }],
      classifications: [{ marketplaceId: "A1F83G8C2ARO7P", classifications: [{ displayName: "Antiseptics & Disinfectants", parent: { displayName: "First Aid", parent: { displayName: "Health & Personal Care", parent: { displayName: "Categories" } } } }] }],
      productTypes: [{ marketplaceId: "A1F83G8C2ARO7P", productType: "HEALTH_PERSONAL_CARE" }],
      attributes: { item_type_keyword: [{ value: "antiseptic-creams" }] },
    };
    expect(parseCatalogItem(item, "A1F83G8C2ARO7P").signals).toEqual(["Antiseptics & Disinfectants", "First Aid", "Health & Personal Care", "antiseptic creams", "health personal care"]);
  });
});
