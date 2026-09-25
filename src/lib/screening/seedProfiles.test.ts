import { describe, expect, it } from "vitest";
import { defaultProfiles } from "./config";

describe("seeded profiles", () => {
  it("First order is the default, with its settings", () => {
    const all = defaultProfiles();
    expect(all.filter((p) => p.is_default).map((p) => p.name)).toEqual(["First order"]);
    const g = all.find((p) => p.name === "First order")!.config.gates;
    expect(g.priceBand.max).toBe(35);
    expect(g.compliance).toMatchObject({ mode: "fail", liquidAboveMl: 500, rules: { fragrance: "fail", aerosol: "fail", supplement: "fail", food: "fail", under3sToy: "fail", liquid: "warn" } });
    expect(g.budgetFit.maxLineSharePct).toBe(25);
    expect(g.amazonPresence.days).toBe(180);
    expect(g.competition).toMatchObject({ minSellers: 2, maxSellers: 8, maxBbSharePct: 60 });
    expect(g.demand).toMatchObject({ minRankDrops30d: 10, maxAvgRank90d: 100_000, minSharePerMonth: 8 });
    expect(g.fees).toMatchObject({ minProfit: 2.5, minRoiPct: 25, minMarginPct: 12 });
  });
});
