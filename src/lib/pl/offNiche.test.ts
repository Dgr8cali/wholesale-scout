import { describe, expect, it } from "vitest";
import { classifyIncumbents, offNicheReason, phraseAt } from "./offNiche";
import { keepaRootsFor } from "./poeCategories";

describe("off-niche titles", () => {
  it("the term as a phrase: all its words, in order, side by side (plurals allowed)", () => {
    expect(phraseAt("Carp Fishing Rods 12ft", "fishing rod")).toBe(1);
    expect(phraseAt("Rod holder for fishing", "fishing rod")).toBe(-1);
    expect(phraseAt("Fishing tackle bag and rod", "fishing rod")).toBe(-1);
  });

  it("excluded words, the pet exemption, the term's own words, and accessories", () => {
    expect(offNicheReason("Magnetic Fishing Rod Bath Toy for Kids", "fishing rod")).toBe('"toy" in the title');
    expect(offNicheReason("Heat Shrink Tubing for Fishing Rod Handles", "fishing rod")).toBe('"tubing" in the title');
    expect(offNicheReason("Fishing Bag Birthday Card", "fishing bag")).toBe('"card" in the title');
    expect(offNicheReason("Rod Bag for Fishing Rod and Reel", "fishing rod")).toBe("an accessory for fishing rod");
    expect(offNicheReason("Dog Bed Large Washable", "dog bed")).toBeNull();
    expect(offNicheReason("Cat Scratching Post with Dog Bed", "scratching post", { pet: true })).toBeNull();
    expect(offNicheReason("Cat Scratching Post", "scratching post")).toBe('"cat" in the title');
    expect(offNicheReason("Fishing Rod Kids", "fishing rod", { words: ["bath"] })).toBeNull();
  });

  it("the top 10 by monthly sold, then sales rank", () => {
    const p = (asin: string, monthlySold: number | null, rank: number | null, reviews: number) => ({ asin, title: "Spinning Fishing Rod", brand: null, reviews, price: null, rank, monthlySold, category: null });
    const r = classifyIncumbents([p("A", null, 50, 9000), p("B", 200, 900, 10), p("C", 900, 3000, 10), p("D", null, 10, 10)], "fishing rod", {}, 3);
    expect(r.top.map((x) => x.asin)).toEqual(["C", "B", "D"]);
    expect(r.shape).toBe("open");
  });

  it("Keepa roots for a niche's categories", () => {
    expect(keepaRootsFor(["Sports & Outdoors", "pet supplies", "Nowhere"])).toEqual([318949011, 340840031]);
    expect(keepaRootsFor(["Stationery & Office Supplies", "Business/Industrial & Scientific"])).toEqual([192413031, 5866054031]);
  });
});
