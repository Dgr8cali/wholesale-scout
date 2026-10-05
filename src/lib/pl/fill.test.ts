import { describe, expect, it } from "vitest";
import type { Point } from "../keepa/types";
import { isAmazonBrand } from "./amazon-brands";
import { keepaFill, monthlySales, reviewsBand, type PlAsin } from "./fill";
import { bbTrend, offerTrend, rankTrend } from "./history";
import { extractPoe, growthBand, poeFill } from "./poe";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 1);

/** A daily series from a function of days ago (365 → 0). */
const series = (f: (daysAgo: number) => number): Point[] => {
  const out: Point[] = [];
  for (let d = 380; d >= 0; d--) out.push([NOW - d * DAY, f(d)]);
  return out;
};

const asin = (over: Partial<PlAsin>): PlAsin => ({
  asin: "B000000000", position: 1, is_reference: false, title: null, brand: "Acme", image: null, price: 20, rating: 4.2, review_count: 300,
  rank: 8000, avg_rank_90d: 8000, rank_drops_90d: 450, bought_past_month: null, offer_count: 1, buybox_price: null, amazon_ever_seller: false,
  amazon_brand: false, dimensions: { l: 20, w: 15, h: 4 }, weight: 300, first_seen: null, history: null, snapshot_at: "2026-10-01T00:00:00Z", ...over,
});

describe("Amazon brands", () => {
  it("matches Amazon's own brands however they're written", () => {
    expect(isAmazonBrand("AmazonBasics")).toBe(true);
    expect(isAmazonBrand("Amazon Basics")).toBe(true);
    expect(isAmazonBrand("Stone and Beam")).toBe(true);
    expect(isAmazonBrand("Presto!")).toBe(true);
    expect(isAmazonBrand("Kitsure")).toBe(false);
    expect(isAmazonBrand(null)).toBe(false);
  });
});

describe("history", () => {
  it("reads flat, growing, decline, seasonal and spike rank years", () => {
    expect(rankTrend(series(() => 5000), NOW).value).toBe("2");
    expect(rankTrend(series((d) => 2000 + d * 20), NOW).value).toBe("3");
    expect(rankTrend(series((d) => 9000 - d * 20), NOW).value).toBe("0");
    expect(rankTrend(series((d) => 5000 * 10 ** (0.6 * Math.sin((d / 365) * 2 * Math.PI * 2))), NOW).value).toBe("1");
    expect(rankTrend(series((d) => (d > 150 && d < 180 ? 800 : 6000)), NOW).value).toBe("0");
    expect(rankTrend(series((d) => (d < 60 ? 5000 : NaN)), NOW).value).toBeNull();
    // A stock-out month (rank 40× worse) is left out, not read as a swing.
    const r = rankTrend(series((d) => (d > 330 ? 200_000 : 5000 + (d % 30) * 20)), NOW);
    expect(r.value).toBe("2");
    expect(r.why).toMatch(/1 month over 5× the median left out/);
  });

  it("calls offers climbing only on a real rise", () => {
    expect(offerTrend(series((d) => (d < 90 ? 9 : 3)), NOW).value).toBe("climbing");
    expect(offerTrend(series((d) => (d < 90 ? 2 : 1)), NOW).value).toBe("steady");
  });

  it("calls the Buy Box sliding at 10% down", () => {
    expect(bbTrend(series((d) => (d < 90 ? 17 : 20)), NOW).value).toBe("sliding");
    expect(bbTrend(series((d) => (d < 90 ? 19 : 20)), NOW).value).toBe("holds");
  });
});

describe("Keepa fill", () => {
  it("prefers bought-in-past-month for fast sellers, else the highest source", () => {
    expect(monthlySales(asin({ avg_rank_90d: 3000, rank_drops_90d: 300, bought_past_month: 500 })).value).toBe(500);
    expect(monthlySales(asin({ avg_rank_90d: 3000, rank_drops_90d: 3000, bought_past_month: 500 })).value).toBe(500);
    expect(monthlySales(asin({ avg_rank_90d: 9000, rank_drops_90d: 900, bought_past_month: 100 })).value).toBe(300);
  });

  it("bands page-one reviews", () => {
    expect(reviewsBand([asin({ review_count: 3000 }), asin({ review_count: 1500 }), asin({ review_count: 50 })])?.value).toBe("0");
    expect(reviewsBand([asin({ review_count: 700 }), asin({ review_count: 1500 }), asin({ review_count: 50 })])?.value).toBe("1");
    expect(reviewsBand([asin({ review_count: 300 }), asin({ review_count: 120 }), asin({ review_count: 80 })])?.value).toBe("3");
    expect(reviewsBand([asin({ review_count: 300 }), asin({ review_count: 120, rank_drops_90d: 30 }), asin({ review_count: 400 })])?.value).toBe("2");
  });

  it("fills Gates 0, 1 and 2 from the listings and the reference", () => {
    const ref = asin({
      asin: "B0REF00000", is_reference: true, price: 24, bought_past_month: 300, amazon_ever_seller: true,
      history: { rankTrend: "2", rankTrendWhy: "flat", offerTrend: "steady", offerTrendWhy: "", bbTrend: "holds", bbTrendWhy: "", keepaRankDrops30: 140, buyBoxFetched: true },
    });
    const f = keepaFill([ref, asin({ asin: "B0X", price: 30, brand: "Amazon Basics", amazon_brand: true }), asin({ asin: "B0Y", price: 10 }), asin({ asin: "B0Z", price: 22, rank_drops_90d: 90 })]);
    expect(f.sell.value).toBe("23");
    expect([f.weight.value, f.dimL.value, f.dimW.value, f.dimH.value]).toEqual(["300", "20", "15", "4"]);
    expect(f.amazonBrand.value).toBe("yes");
    expect(f.priceTight.value).toBe("yes"); // 3 of 4 in £14.40–£42
    expect(f.top10Sales.value).toBe("150");
    expect(f.top3Share.value).toBe("95"); // 300 + 150 + 150 of 630
    expect([f.rankTrend.value, f.rankDrops.value, f.bought.value, f.offerTrend.value, f.bbTrend.value, f.amazonSeller.value]).toEqual(["2", "150", "300", "steady", "holds", "yes"]);
  });

  it("price spread reads the candidate's own target band", () => {
    const list = [asin({ asin: "B0A", price: 9 }), asin({ asin: "B0B", price: 11 }), asin({ asin: "B0C", price: 14 }), asin({ asin: "B0D", price: 26 })];
    expect(keepaFill(list).priceTight.value).toBe("no"); // 1 of 4 in £14.40–£42
    const own = keepaFill(list, { min: 8, max: 15 }).priceTight;
    expect(own.value).toBe("yes"); // 3 of 4 in £6.40–£18
    expect(own.why).toContain("the £8.00–£15.00 target band");
  });
});

describe("Opportunity Explorer", () => {
  const payload = {
    niche: {
      data: {
        getNiche: {
          nicheId: "abc123",
          nicheTitle: "bamboo cutlery tray",
          nicheSummary: {
            searchVolumeT90: 12000, searchVolumeT360: 52000, searchVolumeGrowthT180: 0.08,
            productCount: 140, searchConversionRateT360: 0.112, avgUnitsSoldT360: 2400,
          },
          searchTermMetrics: [
            { searchTerm: "cutlery tray", searchVolumeT360: 36000, clickShareT360: 0.31, searchConversionRateT360: 0.1 },
            { searchTerm: "bamboo cutlery tray", searchVolumeT360: 9600, clickShareT360: 0.2, searchConversionRateT360: 0.12 },
            { searchTerm: "expandable cutlery tray", searchVolumeT360: 4800 },
            { searchTerm: "drawer organiser kitchen", searchVolumeT360: 2400 },
          ],
          products: [
            { asin: "B1", clickShareT360: 0.2 }, { asin: "B2", clickShareT360: 0.15 }, { asin: "B3", clickShareT360: 0.1 }, { asin: "B4", clickShareT360: 0.05 },
          ],
        },
      },
    },
    growth: null,
  };

  it("reads the niche, preferring 360-day figures, as percentages and per month", () => {
    const x = extractPoe(payload);
    expect(x).toMatchObject({
      niche_title: "bamboo cutlery tray", niche_id: "abc123", search_volume_360: 52000, search_volume_growth: 8,
      products_in_niche: 140, top3_click_share: 45, search_conversion: 11.2, avg_units_per_product: 200,
    });
    expect(x.search_terms.map((t) => [t.term, t.volume])).toEqual([["cutlery tray", 3000], ["bamboo cutlery tray", 800], ["expandable cutlery tray", 400], ["drawer organiser kitchen", 200]]);
    const f = poeFill(x);
    expect(f.longtail.value).toBe("2");
    expect(f.headVol.value).toBe("3000");
    expect(f.svGrowth.value).toBe("growing");
    expect(f.headBid).toBeUndefined();
  });

  it("bands growth", () => {
    expect([growthBand(-8), growthBand(2), growthBand(12), growthBand(null)]).toEqual(["declining", "flat", "growing", null]);
  });
});
