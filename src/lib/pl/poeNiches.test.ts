import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { demandShare, fragmentationShare, growthShare, nicheFlags, priceShare, scoreNiche, unitsShare, type NicheFigures } from "./nicheScore";
import { headerKey, num, parseNichesCsv } from "./poeNiches";

// A real Opportunity Explorer niche download: DIY & Tools, 500 niches.
const csv = readFileSync(join(__dirname, "../../../docs/samples/poe/diy-tools.csv"), "utf8");
const p = parseNichesCsv(csv);
const niche = (need: string) => p.niches.find((n) => n.customer_need === need)!;

describe("the Opportunity Explorer niche download", () => {
  it("finds the header on line 3 (after the title and a blank line, past the BOM) and reads all 500 rows", () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(p.headerLine).toBe(3);
    expect(p.rows).toBe(500);
    expect(p.unmapped).toEqual([]);
    expect(Object.values(p.mapped).every(Boolean)).toBe(true);
    expect(p.warnings).toEqual([]);
  });
  it("search terms combined, units in both pairs, a midpoint per product", () => {
    expect(niche("extension lead")).toMatchObject({
      search_terms: ["extension lead", "extension lead with usb slots", "plug extension socket"], sv_360: 7993436, sv_90: 1776696,
      units_360_min: 600000, units_360_max: 800000, units_per_product_min: 15000, units_per_product_max: 20000, units_per_product_mid: 17500,
      top_clicked_products: 23, avg_price: 9.9, min_price: 4.16, max_price: 17.93, return_rate: 0.0052, growth_90: 0.0321,
    });
  });
  it("growth is a fraction; the apostrophe before a negative is stripped", () => {
    // Eclipse glasses: 563.8175 as a fraction is +56,382%. Searches were near nil before the August
    // 2026 eclipse (13.05M of its 13.10M a year came in the last 90 days), so it's a spike.
    expect(niche("eclipse glasses").growth_180).toBe(563.8175);
    expect(niche("security camera outdoor").growth_180).toBe(-0.1239);
    expect(niche("security camera outdoor").growth_90).toBe(-0.0868);
    expect(num("'-0.1239")).toBe(-0.1239);
    expect(num("£1,234.50")).toBe(1234.5);
    expect(num("")).toBeNull();
  });
  it("the same niche under two names is merged, the other name kept as an alias", () => {
    expect(p.niches.find((n) => n.customer_need === "window cleaning equipment")).toBeUndefined();
    expect(niche("window cleaner").aliases).toEqual(["window cleaning equipment"]);
    expect(p.duplicates).toBe(4);
    expect(p.niches).toHaveLength(496);
    // Same search terms, different search volume: not the same niche.
    expect(niche("beldray window vac").aliases).toEqual([]);
  });
  it("flags on the real rows", () => {
    expect(nicheFlags(niche("eclipse glasses"))).toContain("SPIKE");
    expect(nicheFlags(niche("security camera outdoor"))).toEqual(expect.arrayContaining(["BIG_BRAND", "ELECTRICAL"]));
    expect(nicheFlags(niche("extension lead"))).toEqual(expect.arrayContaining(["ELECTRICAL", "LOW_PRICE"]));
    expect(scoreNiche(niche("eclipse glasses")).breakdown.growth.points).toBe(0);
  });
  it("the added word lists, on real rows", () => {
    expect(nicheFlags(niche("shelving unit"))).toContain("HEAVY_BULKY");
    expect(nicheFlags(niche("plastic shelving unit"))).toContain("HEAVY_BULKY");
    expect(nicheFlags(niche("teddy hammock"))).toContain("HEAVY_BULKY");
    // "ring doorbell wired" starts with the brand Ring.
    expect(nicheFlags(niche("tapo doorbell"))).toEqual(expect.arrayContaining(["BIG_BRAND", "ELECTRICAL"]));
  });
  it("columns are matched by name, whatever the order, case and punctuation", () => {
    expect(headerKey("No. of top clicked products")).toBe("nooftopclickedproducts");
    const moved = "Customer Need,average price (gbp),TOP SEARCH TERM: 1,Search Volume (past 360 days),Extra Thing\nfoo,12.5,foo bar,200000,x\n";
    const r = parseNichesCsv(moved);
    expect(r.headerLine).toBe(1);
    expect(r.niches[0]).toMatchObject({ customer_need: "foo", avg_price: 12.5, search_terms: ["foo bar"], sv_360: 200000 });
    expect(r.unmapped).toEqual(["Extra Thing"]);
    expect(r.niches[0].raw_row["Extra Thing"]).toBe("x");
    expect(r.warnings[0]).toMatch(/Not found in the file: .*growth_180/);
    expect(() => parseNichesCsv("a,b\n1,2")).toThrow(/Customer Need/);
  });
});

describe("the niche score, at every band edge", () => {
  it("demand: 0 at ≤100k, full at ≥2M, log in between", () => {
    expect([demandShare(null), demandShare(99_999), demandShare(100_000), demandShare(2_000_000), demandShare(5_000_000)]).toEqual([0, 0, 0, 1, 1]);
    expect(demandShare(Math.sqrt(100_000 * 2_000_000))).toBeCloseTo(0.5, 6);
  });
  it("growth: full +5% to +60%; 0.8 for 0–5%; 0.6 over 60%; 0 over 150% (spike); linear to 0 at −50%", () => {
    expect([growthShare(0.05), growthShare(0.6), growthShare(0.0499), growthShare(0), growthShare(0.6001), growthShare(1.5), growthShare(1.5001)]).toEqual([1, 1, 0.8, 0.8, 0.6, 0.6, 0]);
    expect(growthShare(-0.25)).toBeCloseTo(0.5, 6);
    expect([growthShare(-0.5), growthShare(-0.8), growthShare(null)]).toEqual([0, 0, 0]);
  });
  it("price: full £15–40; 0.6 £10–15 and £40–60; 0.3 £8–10 and £60–80; else 0", () => {
    expect([7.99, 8, 9.99, 10, 14.99, 15, 40, 40.01, 60, 60.01, 80, 80.01].map(priceShare)).toEqual([0, 0.3, 0.3, 0.6, 0.6, 1, 1, 0.6, 0.6, 0.3, 0.3, 0]);
  });
  it("fragmentation: 0 at ≤15 top-clicked products, full at ≥60", () => {
    expect([10, 15, 37.5, 60, 100].map(fragmentationShare)).toEqual([0, 0, 0.5, 1, 1]);
  });
  it("units a product a year: 0 at ≤300, full at ≥2,000", () => {
    expect([300, 1150, 2000, 5000].map(unitsShare)).toEqual([0, 0.5, 1, 1]);
  });
  it("the total and its breakdown", () => {
    const n: NicheFigures = { customer_need: "x", search_terms: [], sv_360: 2_000_000, growth_180: 0.2, growth_90: 0.1, avg_price: 20, top_clicked_products: 60, units_per_product_mid: 2000, return_rate: 0.01 };
    expect(scoreNiche(n)).toMatchObject({ score: 100, breakdown: { demand: { points: 20, max: 20, input: 2_000_000 }, fragmentation: { points: 25, max: 25, input: 60 } } });
    expect(scoreNiche({ ...n, top_clicked_products: 37.5, avg_price: 12 }).score).toBe(100 - 12.5 - 8);
  });
});

describe("flags", () => {
  const base: NicheFigures = { customer_need: "storage box", search_terms: ["storage box"], sv_360: 500_000, growth_180: 0.1, growth_90: 0, avg_price: 20, top_clicked_products: 40, units_per_product_mid: 1000, return_rate: 0.01 };
  it("from the figures", () => {
    expect(nicheFlags(base)).toEqual([]);
    expect(nicheFlags({ ...base, growth_180: 1.51 })).toContain("SPIKE");
    expect(nicheFlags({ ...base, growth_180: 1.5 })).not.toContain("SPIKE");
    expect(nicheFlags({ ...base, growth_180: 0.1, growth_90: -0.16 })).toContain("FADING");
    expect(nicheFlags({ ...base, growth_180: -0.1, growth_90: -0.3 })).not.toContain("FADING");
    expect(nicheFlags({ ...base, avg_price: 9.99 })).toContain("LOW_PRICE");
    expect(nicheFlags({ ...base, return_rate: 0.03 })).toContain("HIGH_RETURNS");
    expect(nicheFlags({ ...base, units_per_product_mid: 199 })).toContain("LOW_UNITS");
  });
  it("brands as whole phrases: the term is the brand, starts with it, or has a 5+ character brand after a space", () => {
    expect(nicheFlags({ ...base, search_terms: ["key ring"] })).not.toContain("BIG_BRAND");
    expect(nicheFlags({ ...base, customer_need: "key rings", search_terms: ["key ring", "keyring holder"] })).not.toContain("BIG_BRAND");
    expect(nicheFlags({ ...base, search_terms: ["tapo camera"] })).toContain("BIG_BRAND");
    expect(nicheFlags({ ...base, search_terms: ["ring doorbell"] })).toContain("BIG_BRAND");
    expect(nicheFlags({ ...base, search_terms: ["ring"] })).toContain("BIG_BRAND");
    expect(nicheFlags({ ...base, search_terms: ["cordless dewalt"] })).toContain("BIG_BRAND"); // 6 characters, after a space
    expect(nicheFlags({ ...base, search_terms: ["outdoor tapo"] })).not.toContain("BIG_BRAND"); // 4 characters, after a space
    expect(nicheFlags({ ...base, search_terms: ["nested tables"] })).not.toContain("BIG_BRAND"); // "nest" isn't a word here
  });
  it("the added electrical and heavy/bulky words; stand only as furniture", () => {
    for (const w of ["garment steamer", "dog clippers", "toaster", "kettle", "air fryer", "hairdryer", "hair straightener", "beard trimmer", "bathroom scales", "meat thermometer", "water fountain"]) {
      expect(nicheFlags({ ...base, search_terms: [w] })).toContain("ELECTRICAL");
    }
    for (const w of ["kitchen cupboard", "chest of drawers", "sun lounger", "garden swing", "tv stand", "plant stands", "bike stand"]) {
      expect(nicheFlags({ ...base, search_terms: [w] })).toContain("HEAVY_BULKY");
    }
    expect(nicheFlags({ ...base, search_terms: ["phone stand"] })).not.toContain("HEAVY_BULKY");
  });
  it("from the words: whole words, plurals, phrases; the brand list is editable", () => {
    expect(nicheFlags({ ...base, search_terms: ["led strip lights"] })).toContain("ELECTRICAL");
    expect(nicheFlags({ ...base, customer_need: "sledge" })).toEqual([]);
    expect(nicheFlags({ ...base, search_terms: ["carbon monoxide detector"] })).toContain("REGULATED");
    expect(nicheFlags({ ...base, search_terms: ["black and decker strimmer"] })).toContain("BIG_BRAND");
    expect(nicheFlags({ ...base, search_terms: ["wd-40 spray"] })).toContain("BIG_BRAND");
    expect(nicheFlags({ ...base, customer_need: "garden gates" })).toContain("HEAVY_BULKY");
    expect(nicheFlags({ ...base, search_terms: ["acme widget"] }, ["acme"])).toEqual(["BIG_BRAND"]);
  });
});
