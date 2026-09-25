import { describe, expect, it } from "vitest";
import { finderSelection, finderTokens, huntName, shapeFromProfile, validShape } from "./hunt";
import { defaultProfiles } from "./screening/config";

const first = defaultProfiles().find((p) => p.name === "First order")!.config;

describe("hunt shape", () => {
  it("comes from the profile, with the category's own rank ceiling", () => {
    expect(shapeFromProfile(first)).toEqual({ priceMin: 12, priceMax: 35, sellersMin: 2, sellersMax: 8, maxRank: 100_000, noAmazon: true, category: null, results: 100 });
    expect(shapeFromProfile(first, { id: 117332031, name: "Beauty" }).maxRank).toBe(60_000);
    expect(shapeFromProfile(first, { id: 1, name: "Toys & Games" }).maxRank).toBe(100_000);
  });
  it("is Keepa's Product Finder query: pence, new-offer counts, 90-day rank, no Amazon, best rank first", () => {
    expect(finderSelection(shapeFromProfile(first, { id: 117332031, name: "Beauty" }))).toEqual({
      rootCategory: [117332031],
      current_BUY_BOX_SHIPPING_gte: 1200, current_BUY_BOX_SHIPPING_lte: 3500,
      current_COUNT_NEW_gte: 2, current_COUNT_NEW_lte: 8,
      avg90_SALES_gte: 1, avg90_SALES_lte: 60_000,
      availabilityAmazon: [-1], productType: [0], sort: [["avg90_SALES", "asc"]], perPage: 100, page: 0,
    });
    expect(finderTokens(100)).toBe(11);
    expect(finderTokens(250)).toBe(13);
    expect(huntName(shapeFromProfile(first))).toBe("Hunt · All categories · £12–35 · 2–8 sellers · rank ≤ 100,000 · no Amazon");
  });
  it("checks what the page sends", () => {
    const ok = shapeFromProfile(first);
    expect(validShape({ ...ok, priceMax: 5 })).toBe("The price band needs a min under the max");
    expect(validShape({ ...ok, maxRank: 0 })).toBe("The rank ceiling must be at least 1");
    expect(validShape({ ...ok, results: 9999 })).toMatchObject({ results: 100 });
  });
});
