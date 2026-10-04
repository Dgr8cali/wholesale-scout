import { describe, expect, it } from "vitest";
import { UK_RATE_CARD_2026_07 as CARD } from "../fees/rateCard";
import { feeCategoryFor, matchPoeCategory, POE_CATEGORIES } from "./poeCategories";

describe("Opportunity Explorer categories and their fee categories", () => {
  it("25 categories, each mapping to a category on the rate card", () => {
    expect(POE_CATEGORIES).toHaveLength(25);
    const names = new Set(CARD.referral.categories.map((c) => c.name));
    expect(POE_CATEGORIES.filter((c) => !names.has(c.fee))).toEqual([]);
  });
  it("a typed or guessed name matches whatever its case, & or 'and', and punctuation", () => {
    expect(matchPoeCategory("DIY & Tools")).toBe("DIY & Tools");
    expect(matchPoeCategory("diy and tools")).toBe("DIY & Tools");
    expect(matchPoeCategory("diy tools")).toBe("DIY & Tools"); // from the file name diy-tools.csv
    expect(matchPoeCategory("Business / Industrial & Scientific")).toBe("Business/Industrial & Scientific");
    expect(matchPoeCategory("Arts & Crafts")).toBeNull();
    expect(matchPoeCategory("")).toBeNull();
  });
  it("the fee category: the list's, else the rate card's own name map, else Everything else", () => {
    expect(feeCategoryFor("DIY & Tools", CARD)).toBe("Tools and Home Improvement");
    expect(feeCategoryFor("Kitchen & Home Appliances", CARD)).toBe("Compact Appliances");
    expect(feeCategoryFor("Health & Personal Care", CARD)).toBe("Beauty, Health and Personal Care");
    expect(feeCategoryFor("Electronics & Photo", CARD)).toBe("Consumer Electronics"); // not listed: the rate card's map
    expect(feeCategoryFor("Arts & Crafts", CARD)).toBe("Everything else");
  });
});
