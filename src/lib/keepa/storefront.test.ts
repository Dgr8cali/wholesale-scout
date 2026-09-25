import { describe, expect, it } from "vitest";
import { parseSeller, parseStorefront } from "./client";
import { parseItemOffers } from "../spapi/client";

// Shaped like Keepa's answer for a real UK seller (storefront=1).
const RAW = {
  sellerId: "A30PLPOC3L6XYK",
  sellerName: "LAUREN JAY PARIS",
  businessName: "LAUREN JAY PARIS LTD",
  currentRating: 76,
  currentRatingCount: 50,
  buyBoxNewOwnershipRate: 87,
  totalStorefrontAsins: [7773498, 383],
  totalStorefrontAsinsCSV: [7773498, 383, 7967600, 267, 8270554, 577],
  asinList: ["B0D9YS9X7Y", "B0D2TWKN7J", "B0D2TWKN7J", "bad", "B0D9QV5QRK"],
  sellerBrandStatistics: [{ brand: "emper", productCount: 218 }, { brand: "milestone perfumes", productCount: 238 }, { brand: "none", productCount: 0 }],
};

describe("storefront", () => {
  it("reads the ASIN list, the latest storefront size and the brand mix", () => {
    const sf = parseStorefront("A30PLPOC3L6XYK", RAW, 10);
    expect(sf.asins).toEqual(["B0D9YS9X7Y", "B0D2TWKN7J", "B0D9QV5QRK"]);
    expect(sf).toMatchObject({ businessName: "LAUREN JAY PARIS LTD", buyBoxOwnershipPct: 87, tokensUsed: 10 });
    expect(sf.profile).toMatchObject({ name: "LAUREN JAY PARIS", ratingPct: 76, ratingCount: 50, storefrontSize: 577 });
    expect(sf.profile.brands).toEqual([{ brand: "milestone perfumes", count: 238 }, { brand: "emper", count: 218 }]);
  });

  it("takes the storefront size from the history's latest count, not the stale total", () => {
    expect(parseSeller("X", { totalStorefrontAsins: [1, 383], totalStorefrontAsinsCSV: [1, 383, 2, 577] }).storefrontSize).toBe(577);
    expect(parseSeller("X", { totalStorefrontAsins: [1, 383] }).storefrontSize).toBe(383);
  });
});

describe("Buy Box holder from current offers", () => {
  it("names the seller whose offer wins", () => {
    const [o] = parseItemOffers([{ status: { statusCode: 200 }, body: { payload: {
      ASIN: "B0D9YS9X7Y",
      Summary: { TotalOfferCount: 2 },
      Offers: [{ SellerId: "AOTHER00001", IsBuyBoxWinner: false }, { SellerId: "A30PLPOC3L6XYK", IsBuyBoxWinner: true }],
    } } }]);
    expect(o.buyBoxSellerId).toBe("A30PLPOC3L6XYK");
    const [none] = parseItemOffers([{ status: { statusCode: 200 }, body: { payload: { ASIN: "B0D9YS9X7Y", Offers: [{ SellerId: "AOTHER00001" }] } } }]);
    expect(none.buyBoxSellerId).toBeNull();
  });
});
