import { describe, expect, it } from "vitest";
import { defaultFilters, directEstimate, directSelection, disqualify, filtersKey, finderSelection, fittingDetailLeaves, funnel, groupNiches, huntEstimate, nicheOfAsin, nicheOfTitle, qualify, shapeOf, spendCap, validFilters, type HuntAsin } from "./hunt";

const CATS = [{ id: 11052681, name: "Home & Kitchen" }, { id: 117332031, name: "Beauty" }, { id: 79903031, name: "DIY & Tools" }];
const F = defaultFilters(CATS);
/** Gatekeeper's pass band, for the near-miss tests (the defaults qualify on the warn band). */
const PASS = { ...F, priceMin: 18, priceMax: 35, ratingMin: 3.8, ratingMax: 4.3 };

const snap = (asin: string, title: string, over: Partial<HuntAsin> = {}): HuntAsin => ({
  asin, title, position: 0, is_reference: false, brand: "Acme", image: null, price: 24, rating: 4.1, review_count: 200, rank: 8000, avg_rank_90d: 8000,
  rank_drops_90d: 450, bought_past_month: null, offer_count: 2, buybox_price: null, amazon_ever_seller: false, amazon_brand: false,
  dimensions: { l: 30, w: 20, h: 5 }, weight: 300, first_seen: null, history: null, snapshot_at: "2026-10-01T00:00:00Z",
  root_category: "Home & Kitchen", amazon_last_seen_days: null, ...over,
});

describe("Niche Hunt", () => {
  it("defaults to Gate 0's categories and Gatekeeper's thresholds", () => {
    // Wide finder, strict qualifying.
    expect(F).toMatchObject({ finderPriceMin: 14, finderPriceMax: 45, finderRatingMin: 3.5, finderRatingMax: 4.7, maxRank90: 100000, noAmazon: true, minListedMonths: 6, excludeAmazonBrands: true });
    // Qualifying on the warn band by default; direct mode, 4 pages a root.
    expect(F).toMatchObject({ mode: "direct", pagesPerRoot: 4, priceMin: 15, priceMax: 40, maxReviews: 500, ratingMin: 3.6, ratingMax: 4.5, minRankDrops90: 300, maxWeightG: 500, smallParcel: true, minAsins: 3 });
    expect(validFilters({ ...F, pagesPerRoot: 11 })).toMatch(/1–10/);
    expect(validFilters({ ...F, mode: "leaf" })).toMatchObject({ mode: "leaf" });
    expect(F).toMatchObject({ leavesCap: 120, detailLeaves: 15, perLeaf: 12, minLeafMatches: 5 });
    expect(F.categories).toEqual([11052681, 79903031]); // Beauty is an avoid category
    expect(validFilters({ ...F, leavesCap: 300 })).toMatch(/1–200/);
    expect(validFilters({ ...F, leafIds: [3313566031] })).toMatchObject({ leafIds: [3313566031] });
    expect(validFilters({ ...F, categories: [] })).toMatch(/category/);
  });

  it("sizes one leaf with the wide finder filters: no weight, size or review filter", () => {
    const s = finderSelection(F, 3313566031, Date.UTC(2026, 9, 2));
    expect(s).toMatchObject({
      categories_include: [3313566031], current_BUY_BOX_SHIPPING_gte: 1400, current_BUY_BOX_SHIPPING_lte: 4500,
      current_RATING_gte: 35, current_RATING_lte: 47, avg90_SALES_gte: 1, avg90_SALES_lte: 100000, availabilityAmazon: [-1],
      productType: [0], singleVariation: true, perPage: 50, sort: [["avg90_SALES", "asc"]],
    });
    expect((s.brand as string[])[0]).toBe("✜Amazon Basics");
    for (const k of ["packageWeight_lte", "packageLength_lte", "current_COUNT_REVIEWS_lte", "buyBoxStatsAmazon90_lte"]) expect(s).not.toHaveProperty(k);
  });

  it("direct mode: every qualifying threshold Keepa can apply, per root, by rank drops; no weight filter", () => {
    const s = directSelection(F, 340840031, Date.UTC(2026, 9, 2));
    expect(s).toMatchObject({
      salesRankReference: [340840031], current_BUY_BOX_SHIPPING_gte: 1500, current_BUY_BOX_SHIPPING_lte: 4000, current_RATING_gte: 36, current_RATING_lte: 45,
      current_COUNT_REVIEWS_lte: 500, monthlySold_gte: 100, availabilityAmazon: [-1], productType: [0], singleVariation: true, sort: [["salesRankDrops90", "desc"]],
    });
    expect(s.trackingSince_lte).toBe(Math.floor((Date.UTC(2026, 9, 2) - 6 * 30.44 * 86_400_000) / 60_000) - 21_564_000);
    for (const k of ["packageWeight_lte", "salesRankDrops90_gte", "perPage", "page"]) expect(s).not.toHaveProperty(k);
  });

  it("direct estimate: pages × 11, then ~2 a detailed ASIN; the cap is the estimate + 10%", () => {
    // 5 roots × 2 pages = 10 pages, 110 tokens; up to 500 ASINs × 2.
    expect(directEstimate({ roots: 5, pages: 2 })).toMatchObject({ finderPages: 10, finder: 110, detail: 1000, total: 1110, tree: 0 });
    expect(directEstimate({ roots: 5, pages: 2, cachedAsins: 120 }).detail).toBe(760);
    expect(spendCap(1154)).toBe(1270);
  });

  it("estimates both stages, and how many leaves to detail fit the balance less the 100 reserve", () => {
    // 60 leaves × 11, 15 leaves × 12 ASINs × 2, trees stored.
    const e = huntEstimate({ rootsWithoutTree: 0, leavesToSize: 60, detailLeaves: 15, perLeaf: 12 });
    expect(e).toEqual({ tree: 0, sizing: 660, leavesToSize: 60, detail: 360, total: 1020 });
    expect(huntEstimate({ rootsWithoutTree: 1, leavesToSize: 60, detailLeaves: 15, perLeaf: 12, cachedAsins: 30 })).toMatchObject({ tree: 40, detail: 300, total: 1000 });
    expect(fittingDetailLeaves(e, 12, 824)).toBe(2); // 824 − 100 − 660 = 64 → 2 leaves of 24
    expect(fittingDetailLeaves(e, 12, 700)).toBe(0);
    // One leaf, sized and detailed with 9 ASINs: 11 + 18.
    expect(huntEstimate({ rootsWithoutTree: 0, leavesToSize: 1, detailLeaves: 1, perLeaf: 9 }).total).toBe(29);
  });

  it("reuses a leaf's count only under the same finder filters (the qualifying ones don't matter)", () => {
    expect(filtersKey(F)).toBe(filtersKey({ ...F, detailLeaves: 3, perLeaf: 5, minAsins: 2, maxReviews: 900, priceMax: 40, maxWeightG: 700 }));
    expect(filtersKey(F)).not.toBe(filtersKey({ ...F, finderPriceMax: 50 }));
  });

  it("names niches from titles: brand, sizes, colours and marketing words out", () => {
    expect(nicheOfTitle("Kitsure Silverware Organizer, Expandable Bamboo Drawer Organizer, Large", "Kitsure")).toEqual({ key: "silverware organiser", name: "silverware organiser" });
    expect(nicheOfTitle("MASS DYNAMIC Cutlery Drawer Organiser, Expandable Bamboo Cutlery Tray", "MASS DYNAMIC")).toEqual({ key: "drawer organiser", name: "cutlery drawer organiser" });
    expect(nicheOfTitle("Premium Bamboo Cutlery Trays 2 Pack - Natural", "Brand")?.key).toBe("cutlery tray");
    expect(nicheOfTitle("Wooden Cutlery Tray for Kitchen Drawers (Black)", null)?.key).toBe("cutlery tray");
    expect(nicheOfTitle("Baby Bottle Brushes Set of 3 | Silicone", null)).toEqual({ key: "bottle brush", name: "bottle brush" });
    expect(nicheOfTitle(null)).toBeNull();
  });

  it("qualifies on rank drops, Amazon, the exact parcel fit and Amazon brands; reviews make incumbents", () => {
    expect(disqualify(snap("A", "x"), F)).toEqual([]);
    expect(disqualify(snap("A", "x", { rank_drops_90d: 120 }), F)).toEqual(["40 sales a month (120 rank drops in 90 days)"]);
    // A fast seller's drops undercount: with no bought-past-month it passes on its rank; with one, that decides.
    expect(disqualify(snap("A", "x", { rank_drops_90d: 43, avg_rank_90d: 49 }), F)).toEqual([]);
    expect(disqualify(snap("A", "x", { rank_drops_90d: 43, avg_rank_90d: 49, bought_past_month: 50 }), F)).toEqual(["50 sales a month (43 rank drops in 90 days)"]);
    expect(disqualify(snap("A", "x", { amazon_last_seen_days: 40 }), F)).toEqual(["Amazon sold it in the last 90 days"]);
    expect(disqualify(snap("A", "x", { amazon_last_seen_days: 200 }), F)).toEqual([]);
    expect(disqualify(snap("A", "x", { dimensions: { l: 20, w: 30, h: 14 } }), F)).toEqual(["bigger than a small parcel"]);
    expect(disqualify(snap("A", "x", { brand: "Amazon Basics" }), F)).toEqual(["Amazon brand"]);
  });

  it("groups into niches of 3+ qualifying ASINs, with shape from the incumbents", () => {
    const rows = [
      snap("A1", "Bamboo Cutlery Tray", { rank_drops_90d: 900, review_count: 120, price: 20 }),
      snap("A2", "Wooden Cutlery Tray 5 Slots", { rank_drops_90d: 600, review_count: 300, price: 22 }),
      snap("A3", "Expandable Cutlery Trays - Grey", { rank_drops_90d: 450, review_count: 80, price: 30, rating: 3.9 }),
      snap("A4", "Large Cutlery Tray", { review_count: 2400 }), // incumbent
      snap("A5", "Cutlery Tray", { rank_drops_90d: 50 }), // too slow: neither
      snap("B1", "Pill Box Organiser", {}), snap("B2", "Weekly Pill Box Organiser", {}), // only 2
    ];
    const n = groupNiches(rows, F);
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ key: "cutlery tray", count: 3, medianPrice: 22, medianReviews: 120, maxReviews: 2400, shape: "contested", salesSum: 650, rootCategory: "Home & Kitchen" });
    expect(n[0].asins.map((a) => [a.asin, a.qualifies, a.incumbent])).toEqual([["A1", true, false], ["A2", true, false], ["A3", true, false], ["A4", false, true], ["A5", false, false]]);
    expect(n[0]).toMatchObject({ nearCount: 0, incumbentCount: 1 });
    expect(groupNiches(rows, F, new Set(["cutlery tray"]))).toEqual([]);
    expect(groupNiches(rows, { ...F, minAsins: 2 }).map((x) => x.key)).toEqual(["cutlery tray", "box organiser"]);
  });

  it("groups by the leaf browse category when Keepa has it, else a title phrase", () => {
    expect(nicheOfAsin({ title: "BLADO Barrier Mat Non Slip Door Mat Rubber Mats", brand: "BLADO", leaf_category: "Door Mats", leaf_category_id: 3316051031 })).toEqual({ key: "cat:3316051031", name: "door mats" });
    expect(nicheOfAsin({ title: "Bamboo Cutlery Tray", brand: null, leaf_category: null, leaf_category_id: null })).toEqual({ key: "cutlery tray", name: "bamboo cutlery tray" });
    const rows = ["A", "B", "C"].map((x, i) => snap(x, `Totally different title ${i} words here`, { leaf_category: "Cutlery Trays", leaf_category_id: 3313566031 }));
    expect(groupNiches(rows, F).map((n) => [n.key, n.name, n.count])).toEqual([["cat:3313566031", "cutlery trays", 3]]);
  });

  it("shapes: open, contested, dominated", () => {
    expect([shapeOf([100, 900]), shapeOf([1200, 300]), shapeOf([1200, 1500]), shapeOf([6000])]).toEqual(["open", "contested", "dominated", "dominated"]);
  });
});

describe("Niche Hunt qualifying: strict, near misses, the funnel", () => {
  it("near misses fail only Gatekeeper's warn band, or miss data; hard fails are fails", () => {
    expect(qualify(snap("A", "x"), PASS).status).toBe("qualifies");
    expect(qualify(snap("A", "x", { price: 38 }), PASS)).toMatchObject({ status: "near", near: ["price £38.00"] });
    expect(qualify(snap("A", "x", { price: 44 }), PASS)).toMatchObject({ status: "fails", fails: ["price £44.00"] });
    expect(qualify(snap("A", "x", { rating: 4.5 }), PASS).status).toBe("near");
    expect(qualify(snap("A", "x", { rating: 4.6 }), PASS).status).toBe("fails");
    expect(qualify(snap("A", "x", { weight: 650 }), PASS).status).toBe("near");
    expect(qualify(snap("A", "x", { weight: 800 }), PASS).status).toBe("fails");
    // Unknown weight isn't a miss: it qualifies, marked unknown. Missing size is still a near miss.
    expect(qualify(snap("A", "x", { weight: null }), PASS)).toMatchObject({ status: "qualifies", unknown: ["weight unknown"] });
    expect(qualify(snap("A", "x", { weight: null, dimensions: null }), PASS)).toMatchObject({ status: "near", near: ["no size"], unknown: ["weight unknown"] });
    expect(qualify(snap("A", "x", { rank_drops_90d: 60 }), PASS).status).toBe("fails");
    expect(qualify(snap("A", "x", { review_count: 1200, price: 38 }), PASS).status).toBe("incumbent");
    expect(disqualify(snap("A", "x", { price: 38, weight: 2000 }), PASS)).toEqual(["2000 g", "price £38.00"]);
  });

  it("counts near misses towards a niche unless strict, and shows every product's status", () => {
    const rows = [
      snap("A1", "x", { leaf_category: "Bath Mats", leaf_category_id: 1 }),
      snap("A2", "x", { leaf_category: "Bath Mats", leaf_category_id: 1, price: 39 }),
      snap("A3", "x", { leaf_category: "Bath Mats", leaf_category_id: 1, dimensions: null }),
      snap("A4", "x", { leaf_category: "Bath Mats", leaf_category_id: 1, rank_drops_90d: 30 }),
    ];
    const [n] = groupNiches(rows, PASS);
    expect(n).toMatchObject({ count: 1, nearCount: 2, incumbentCount: 0, maxReviews: 200 });
    expect(n.asins.map((a) => [a.asin, a.status])).toEqual([["A1", "qualifies"], ["A2", "near"], ["A3", "near"], ["A4", "fails"]]);
    expect(groupNiches(rows, PASS, new Set(), { strict: true })).toEqual([]);
  });

  it("says which check removed how many, in order", () => {
    const rows = [
      snap("A1", "x"), snap("A2", "x", { price: 50 }), snap("A3", "x", { price: 38 }), snap("A4", "x", { rating: 4.8 }),
      snap("A5", "x", { rank_drops_90d: 30 }), snap("A6", "x", { amazon_last_seen_days: 10 }), snap("A7", "x", { weight: 900 }),
      snap("A8", "x", { review_count: 3000 }),
    ];
    const r = funnel(rows, PASS);
    expect(r.start).toBe(8);
    expect(r.steps.map((x) => [x.label, x.removed, x.near])).toEqual([
      ["price £18–35", 1, 1], ["rating 3.8–4.3", 1, 0], ["100+ sales a month", 1, 0], ["no Amazon in 90 days", 1, 0],
      ["not an Amazon brand", 0, 0], ["500 g or less", 1, 0], ["small parcel", 0, 0],
    ]);
    expect(r).toMatchObject({ incumbents: 1, near: 1, qualifying: 1 });
  });
});
