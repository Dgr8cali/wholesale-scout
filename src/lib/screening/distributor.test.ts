import { describe, expect, it } from "vitest";
import { brandShare, distributorNote } from "./distributor";

describe("storefront brand share", () => {
  it("is the brand's listings over the storefront, as a count and a percentage", () => {
    expect(brandShare([{ brand: "Kitsure", count: 7 }, { brand: "Other", count: 2 }], "Kitsure", 9)).toEqual({ count: 7, size: 9, pct: 77.8 });
  });

  it("never passes 100%: a storefront can't hold fewer listings than one brand has on it", () => {
    // Keepa's storefront count for LILIWAIWAI-EU was 9 (from 2024), its Kitsure count 113 (current).
    expect(brandShare([{ brand: "kitsure", count: 113 }], "Kitsure", 9)).toEqual({ count: 113, size: 113, pct: 100 });
  });

  it("is unknown without a brand, a brand breakdown or any size", () => {
    expect(brandShare([], "Kitsure", 9)).toBeNull();
    expect(brandShare([{ brand: "Kitsure", count: 7 }], null, 9)).toBeNull();
    expect(brandShare([{ brand: "Other", count: 0 }], "Kitsure", null)).toBeNull();
    expect(brandShare([{ brand: "Other", count: 4 }], "Kitsure", 9)).toEqual({ count: 0, size: 9, pct: 0 });
  });

  it("reads as a count of the storefront, then the percentage", () => {
    const s = { sellerId: "A1", name: "LILIWAIWAI-EU", sharePct: 100, storefrontSize: 9, brandCount: 7, brandSharePct: 77.8 };
    expect(distributorNote(s, "Kitsure")).toBe("likely brand distributor: LILIWAIWAI-EU (7 of 9 storefront listings (78%) are Kitsure, 100% of the Buy Box)");
    // Results screened before the count was kept: as before when possible; capped, without the stale size, when not.
    expect(distributorNote({ ...s, storefrontSize: 400, brandCount: undefined, brandSharePct: 78 }, "Bioderma")).toBe("likely brand distributor: LILIWAIWAI-EU (78% of 400 storefront listings are Bioderma, 100% of the Buy Box)");
    expect(distributorNote({ ...s, brandCount: undefined, brandSharePct: 1256 }, "Kitsure")).toBe("likely brand distributor: LILIWAIWAI-EU (100% of storefront listings are Kitsure, 100% of the Buy Box)");
  });
});
