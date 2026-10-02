import { describe, expect, it } from "vitest";
import { defaultFilters, disqualify, filtersKey, finderSelection, fittingDetailLeaves, groupNiches, huntEstimate, nicheOfAsin, nicheOfTitle, shapeOf, validFilters, type HuntAsin } from "./hunt";

const CATS = [{ id: 11052681, name: "Home & Kitchen" }, { id: 117332031, name: "Beauty" }, { id: 79903031, name: "DIY & Tools" }];
const F = defaultFilters(CATS);

const snap = (asin: string, title: string, over: Partial<HuntAsin> = {}): HuntAsin => ({
  asin, title, position: 0, is_reference: false, brand: "Acme", image: null, price: 24, rating: 4.1, review_count: 200, rank: 8000, avg_rank_90d: 8000,
  rank_drops_90d: 450, bought_past_month: null, offer_count: 2, buybox_price: null, amazon_ever_seller: false, amazon_brand: false,
  dimensions: { l: 30, w: 20, h: 5 }, weight: 300, first_seen: null, history: null, snapshot_at: "2026-10-01T00:00:00Z",
  root_category: "Home & Kitchen", amazon_last_seen_days: null, ...over,
});

describe("Niche Hunt", () => {
  it("defaults to Gate 0's categories and Gatekeeper's thresholds", () => {
    expect(F).toMatchObject({ priceMin: 18, priceMax: 35, maxReviews: 500, ratingMin: 3.8, ratingMax: 4.3, minRankDrops90: 300, maxWeightG: 500, minAsins: 3, leavesCap: 60, detailLeaves: 15, perLeaf: 12, minLeafMatches: 5 });
    expect(F.categories).toEqual([11052681, 79903031]); // Beauty is an avoid category
    expect(validFilters({ ...F, leavesCap: 300 })).toMatch(/1–200/);
    expect(validFilters({ ...F, leafIds: [3313566031] })).toMatchObject({ leafIds: [3313566031] });
    expect(validFilters({ ...F, categories: [] })).toMatch(/category/);
  });

  it("sizes one leaf with the finder: only what it can check, Keepa's smallest page", () => {
    const s = finderSelection(F, 3313566031, Date.UTC(2026, 9, 2));
    expect(s).toMatchObject({
      categories_include: [3313566031], current_BUY_BOX_SHIPPING_gte: 1800, current_BUY_BOX_SHIPPING_lte: 3500,
      current_RATING_gte: 38, current_RATING_lte: 43, avg90_SALES_gte: 1, avg90_SALES_lte: 75000, availabilityAmazon: [-1], buyBoxStatsAmazon90_lte: 0,
      packageWeight_lte: 500, packageLength_lte: 350, productType: [0], singleVariation: true, perPage: 50, sort: [["avg90_SALES", "asc"]],
    });
    expect((s.brand as string[])[0]).toBe("✜Amazon Basics");
    expect(s).not.toHaveProperty("current_COUNT_REVIEWS_lte"); // reviews qualify after the fetch (incumbents stay)
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

  it("reuses a leaf's count only under the same finder filters", () => {
    expect(filtersKey(F)).toBe(filtersKey({ ...F, detailLeaves: 3, perLeaf: 5, minAsins: 2, maxReviews: 900 }));
    expect(filtersKey(F)).not.toBe(filtersKey({ ...F, priceMax: 40 }));
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
    expect(n[0].asins.map((a) => [a.asin, a.qualifies, a.incumbent])).toEqual([["A1", true, false], ["A2", true, false], ["A3", true, false], ["A4", false, true]]);
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
