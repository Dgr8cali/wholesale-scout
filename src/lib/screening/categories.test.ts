import { describe, expect, it } from "vitest";
import { categoryEntry, DEFAULT_RANK_BY_CATEGORY, rankCeiling } from "./categories";

describe("rank ceiling by category", () => {
  it("matches category names loosely", () => {
    expect(categoryEntry(DEFAULT_RANK_BY_CATEGORY, "Health & Household")).toEqual({ name: "Health & Personal Care", max: 60_000 });
    expect(categoryEntry(DEFAULT_RANK_BY_CATEGORY, "Home and Kitchen")?.name).toBe("Home & Kitchen");
    expect(categoryEntry(DEFAULT_RANK_BY_CATEGORY, "Tools & Home Improvement")?.name).toBe("DIY & Tools");
    expect(categoryEntry(DEFAULT_RANK_BY_CATEGORY, "Grocery")?.max).toBe(50_000);
    expect(categoryEntry(DEFAULT_RANK_BY_CATEGORY, "Toys & Games")).toBeNull();
    expect(categoryEntry(DEFAULT_RANK_BY_CATEGORY, null)).toBeNull();
  });
  it("falls back to the profile-wide ceiling, and ignores an emptied entry", () => {
    expect(rankCeiling({ maxAvgRank90d: 100_000, maxRankByCategory: DEFAULT_RANK_BY_CATEGORY }, "Pet Supplies")).toEqual({ max: 100_000, category: null });
    expect(rankCeiling({ maxAvgRank90d: 100_000, maxRankByCategory: { Beauty: NaN } }, "Beauty")).toEqual({ max: 100_000, category: null });
    expect(rankCeiling({ maxAvgRank90d: 100_000 }, "Beauty")).toEqual({ max: 100_000, category: null });
  });
});
