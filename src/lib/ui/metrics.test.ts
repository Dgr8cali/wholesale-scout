import { describe, expect, it } from "vitest";
import { buyBox, estSales, sellers } from "./metrics";

describe("results figures", () => {
  it("shows nothing for sales while Keepa is a stub", () => {
    expect(estSales({ hasHistory: false, offersNow: 5 })).toEqual({ value: null, note: "Needs Keepa history" });
    expect(estSales(null).value).toBeNull();
  });

  it("takes the highest of three sources and lists all three", () => {
    const a = estSales({ hasHistory: true, rankDrops30d: 53, keepaRankDrops30: 55, monthlySold: 200 });
    expect(a.value).toBe(200);
    expect(a.note).toBe([
      "Highest of:",
      "  rank drops in 30 days (from the history): 53",
      "  Keepa's 30-day rank-drop count: 55",
      '▶ Amazon "bought in past month" (via Keepa): 200+',
    ].join("\n"));
    const b = estSales({ hasHistory: true, rankDrops30d: 140, keepaRankDrops30: 138, monthlySold: null });
    expect(b.value).toBe(140);
    expect(b.note).toContain('  Amazon "bought in past month" (via Keepa): —');
  });

  it("uses FBA sellers from Keepa, else labels SP-API's all-offer count", () => {
    expect(sellers({ hasHistory: true, fbaOffers: 4, offersNow: 7 })).toEqual({ value: 4, note: "FBA sellers (Keepa)" });
    expect(sellers({ hasHistory: false, offersNow: 7 }).note).toMatch(/All new offers \(SP-API\)/);
    expect(buyBox({ hasHistory: false, currentBuyBox: 24.99 })).toEqual({ value: 24.99, note: "Current Buy Box (SP-API)" });
  });
});
