import { describe, expect, it } from "vitest";
import { accessoryFor, classifyIncumbents, finderTerms, isBagOrBox, judgeTitle, offNicheReason, phraseAt } from "./offNiche";
import { keepaRootsFor } from "./poeCategories";

describe("off-niche titles", () => {
  it("the term as a phrase: all its words, in order, side by side (plurals allowed)", () => {
    expect(phraseAt("Carp Fishing Rods 12ft", "fishing rod")).toBe(1);
    expect(phraseAt("Rod holder for fishing", "fishing rod")).toBe(-1);
    expect(phraseAt("Fishing tackle bag and rod", "fishing rod")).toBe(-1);
  });

  it("excluded words, the pet exemption, the term's own words, and accessories", () => {
    expect(offNicheReason("Magnetic Fishing Rod Bath Toy for Kids", "fishing rod")).toBe('"toy" in the title');
    expect(offNicheReason("Heat Shrink Tubing for Fishing Rod Handles", "fishing rod")).toBe("an accessory for fishing rod");
    expect(offNicheReason("Heat Shrink Tubing Fishing Rod Wrap", "fishing rod")).toBe('"tubing" in the title');
    expect(offNicheReason("Fishing Bag Birthday Card", "fishing bag")).toBe('"card" in the title');
    expect(offNicheReason("Rod Bag for Fishing Rod and Reel", "fishing rod")).toBe("an accessory for fishing rod");
    expect(offNicheReason("Dog Bed Large Washable", "dog bed")).toBeNull();
    expect(offNicheReason("Cat Scratching Post with Dog Bed", "scratching post", { pet: true })).toBeNull();
    expect(offNicheReason("Cat Scratching Post", "scratching post")).toBe('"cat" in the title');
    expect(offNicheReason("Fishing Rod Kids", "fishing rod", { words: ["bath"] })).toBeNull();
  });

  it("any of the niche's terms: the first that passes is the match", () => {
    const terms = ["fishing bag", "fishing backpack", "fishing tackle bag"];
    expect(judgeTitle("Waterproof Fishing Backpack 35L", terms)).toEqual({ term: "fishing backpack", why: null });
    expect(judgeTitle("Large Fishing Tackle Bag with 4 Boxes", terms)).toEqual({ term: "fishing tackle bag", why: null });
    expect(judgeTitle("Dry Bag 20L for Kayaking and Fishing", terms)).toEqual({ term: null, why: "title has none of the search terms" });
    expect(judgeTitle("Kids Fishing Backpack Toy", terms).why).toBe('"toy" in the title');
  });

  it("an accessory for any of the niche's terms: for, fits, compatible with (two filler words at most)", () => {
    const terms = ["fishing bag", "fishing rod", "tackle box"];
    expect(judgeTitle("Fishing Bag with Rod Holder for Fishing Rod", terms)).toEqual({ term: null, why: "an accessory for fishing rod" });
    expect(accessoryFor("Foam Inserts, Fits Most Tackle Boxes", terms)).toBe("tackle box");
    expect(accessoryFor("Shoulder Strap Compatible with All Fishing Bags", terms)).toBe("fishing bag");
    expect(accessoryFor("Rod Sleeve Suitable for Your Fishing Rod", terms)).toBe("fishing rod");
    expect(accessoryFor("Waterproof Fishing Bag for Men, 30L", terms)).toBeNull();
    expect(accessoryFor("Backpack for Men and Women Fishing Bag", terms)).toBeNull();
    expect(offNicheReason("Grips that fit carp fishing rods", ["fishing rod"])).toBeNull();
    expect(offNicheReason("Grips that fit fishing rods", ["fishing rod"])).toBe("an accessory for fishing rod");
  });

  it("bag or box niches leave out Locking Carabiners and Bait Storage", () => {
    expect(isBagOrBox(["fishing bag", "fishing backpack"])).toBe(true);
    expect(isBagOrBox(["fishing tackle boxes"])).toBe(true);
    expect(isBagOrBox(["fishing rod"])).toBe(false);
    const p = (asin: string, category: string) => ({ asin, title: "Fishing Tackle Box Large", brand: null, reviews: 10, price: null, rank: 1, monthlySold: 10, category });
    const items = [p("A", "Locking Carabiners"), p("B", "Bait Storage"), p("C", "Tackle Boxes")];
    const r = classifyIncumbents(items, ["fishing tackle box", "tackle box"]);
    expect(r.top.map((x) => x.asin)).toEqual(["C"]);
    expect(r.excluded.map((x) => x.why)).toEqual(["Keepa category Locking Carabiners (not a bag or box)", "Keepa category Bait Storage (not a bag or box)"]);
    expect(classifyIncumbents(items.map((x) => ({ ...x, title: "Fishing Rod" })), ["fishing rod"]).top).toHaveLength(3);
  });

  it("finder terms: one containing another is covered by it, at most 3", () => {
    expect(finderTerms(["fishing tackle box", "tackle box", "fishing box"])).toEqual(["tackle box", "fishing box"]);
    expect(finderTerms(["fishing rod", "fishing accessories", "fishing"])).toEqual(["fishing"]);
    expect(finderTerms(["fishing rod", "Fishing Rods", "a", "b", "c"])).toEqual(["fishing rod", "a", "b"]);
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
