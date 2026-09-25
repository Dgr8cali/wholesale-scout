import { describe, expect, it } from "vitest";
import { listingPack, supplierPack, titlePackCount } from "./pack";

describe("titlePackCount", () => {
  it.each([
    ["Cupra Wax Cream for Dry Skin Pink 75ml (Pack of 2)", 2],
    ["Nivea Soft 200ml, 3 x 200ml", 3],
    ["Italian Gourmet Prep Skin Protection Cream 6 x 75 ml SOS Care", 6],
    ["Redken Shades Eq 60 ml X 3", 3],
    ["12 x Venus Milk Hydrating Make-Up Remover 200 ml", 12],
    ["Colgate Total 3-pack", 3],
    ["Dove Shower Gel 4 Pack", 4],
    ["Radox Bath Soak Set of 2", 2],
    ["Sanex Twin Pack Deodorant", 2],
    ["Palmolive Soap Twin", 2],
    ["E45 Cream 50ml Triple Pack", 3],
    ["Sanex Deodorant (Duo)", 2],
  ])("%s → %i", (t, n) => expect(titlePackCount(t)).toBe(n));

  it.each([
    "Avene Thermal Spring Water Spray 150 ml",
    "2 in 1 Shampoo and Conditioner 400ml",
    "Cotton Pads 100 Pack",
    "Mirror 30 x 40 cm",
    "Pack of 1",
    "La Roche-Posay Lipikar Balm AP+M Triple-Action Moisturiser",
    "Gillette Twin Blade Razors",
    null,
  ])("no pack: %s", (t) => expect(titlePackCount(t)).toBeNull());
});

describe("listingPack", () => {
  it("title and attributes agree", () => {
    expect(listingPack("Venus Milk (Pack of 12)", { itemPackageQuantity: 12, numberOfItems: null })).toEqual({ count: 12, source: "title", mismatch: null });
  });
  it("either attribute agreeing is enough; implausible values are ignored", () => {
    expect(listingPack("Redken 60 ml X 3", { itemPackageQuantity: 1, numberOfItems: 3 }).mismatch).toBeNull();
    expect(listingPack("Cream 6 x 75 ml", { itemPackageQuantity: 512, numberOfItems: 6 }).mismatch).toBeNull();
  });
  it("flags a title the attributes contradict", () => {
    expect(listingPack("Shower Gel Pack of 3", { itemPackageQuantity: 1, numberOfItems: 1 })).toEqual({ count: 3, source: "title", mismatch: "title says 3, Amazon's attributes say 1" });
  });
  it("never scales on attributes alone; flags when both say a multipack the title doesn't", () => {
    expect(listingPack("Hyalu B5 Serum 40 ml", { itemPackageQuantity: 5, numberOfItems: 5 })).toEqual({ count: 1, source: "default", mismatch: "title doesn't say, Amazon's attributes say 5" });
    expect(listingPack("Nuxe Gel Cream 40ml", { itemPackageQuantity: 2, numberOfItems: 1 })).toEqual({ count: 1, source: "default", mismatch: null });
    expect(listingPack("Gift Set", { itemPackageQuantity: 1, numberOfItems: 3 })).toEqual({ count: 1, source: "default", mismatch: null });
  });
  it("single by default", () => {
    expect(listingPack("Soap 100g", null)).toEqual({ count: 1, source: "default", mismatch: null });
    expect(supplierPack("Soap 100g")).toBe(1);
    expect(supplierPack("Soap 100g pack of 3")).toBe(3);
  });
});
