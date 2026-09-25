import { describe, expect, it } from "vitest";
import { buyBox, estSales, sellers } from "./metrics";

describe("results figures", () => {
  it("shows nothing for sales while Keepa is a stub", () => {
    expect(estSales({ hasHistory: false, offersNow: 5 })).toEqual({ value: null, note: "Needs Keepa history (Keepa is a stub for now)" });
    expect(estSales(null).value).toBeNull();
  });

  it("takes the higher of rank drops and bought-in-past-month, and says which", () => {
    const a = estSales({ hasHistory: true, rankDrops30d: 140, monthlySold: 200 });
    expect(a.value).toBe(200);
    expect(a.note).toMatch(/^Amazon's "bought in past month" \(200\+\), higher than 140 rank drops/);
    const b = estSales({ hasHistory: true, rankDrops30d: 140, monthlySold: 100 });
    expect(b.value).toBe(140);
    expect(b.note).toMatch(/^140 rank drops in the last 30 days \(Keepa\), vs 100\+ bought/);
    expect(estSales({ hasHistory: true, rankDrops30d: 12, monthlySold: null }).note).toMatch(/no bought-in-past-month figure/);
  });

  it("uses FBA sellers from Keepa, else labels SP-API's all-offer count", () => {
    expect(sellers({ hasHistory: true, fbaOffers: 4, offersNow: 7 })).toEqual({ value: 4, note: "FBA sellers (Keepa)" });
    expect(sellers({ hasHistory: false, offersNow: 7 }).note).toMatch(/All new offers \(SP-API\)/);
    expect(buyBox({ hasHistory: false, currentBuyBox: 24.99 })).toEqual({ value: 24.99, note: "Current Buy Box (SP-API)" });
  });
});
