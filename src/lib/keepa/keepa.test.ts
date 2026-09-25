import { describe, expect, it } from "vitest";
import { getKeepa, HttpKeepaClient, parseKeepaProduct, parseSeller, StubKeepaClient } from "./client";
import { decodeSeries, keepaTimeToMs, median, rankDrops, summarize, trimSeries } from "./summarize";
import type { Point } from "./types";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 25);
const daysAgo = (d: number) => NOW - d * DAY;

describe("series decoding", () => {
  it("converts Keepa minutes and pence, and adds shipping for the Buy Box", () => {
    const t = 7_000_000;
    expect(decodeSeries([t, 1299], { pence: true })).toEqual([[keepaTimeToMs(t), 12.99]]);
    expect(decodeSeries([t, 1299, 100], { withShipping: true, pence: true })).toEqual([[keepaTimeToMs(t), 13.99]]);
  });

  it("keeps -1 as a gap", () => {
    const s = decodeSeries([1, 500, 2, -1], { pence: true });
    expect(s[1][1]).toBeNaN();
  });
});

describe("summary", () => {
  // Rank falls (a sale) every other day for a year, recovering in between.
  const rank: Point[] = [];
  for (let d = 365; d >= 0; d--) rank.push([daysAgo(d), d % 2 ? 20_000 : 10_000]);

  it("counts rank drops in the last 30 days", () => {
    expect(rankDrops(rank, daysAgo(30), NOW)).toBe(16); // even days 30…0 inclusive
  });

  it("takes the 12-month median Buy Box and today's price", () => {
    const bb: Point[] = [[daysAgo(365), 20], [daysAgo(100), 22], [daysAgo(5), 30]];
    const s = summarize({ now: NOW, rank, buyBox: bb, offerCount: [], amazon: [], reviewCount: [] });
    expect(s.currentBuyBox).toBe(30);
    expect(s.medianBuyBox12m).toBe(20); // 265 days at £20, 95 at £22, 6 at £30
    expect(s.historyDays).toBe(365);
  });

  it("reports a falling price as a negative slope", () => {
    const bb: Point[] = [];
    for (let d = 365; d >= 0; d--) bb.push([daysAgo(d), 30 - (365 - d) * (6 / 365)]); // £30 → £24
    const s = summarize({ now: NOW, rank, buyBox: bb, offerCount: [], amazon: [], reviewCount: [] });
    expect(s.bbSlopePctYr!).toBeLessThan(-15);
  });

  it("finds when Amazon last held an offer", () => {
    const amazon: Point[] = [[daysAgo(200), 19.99], [daysAgo(150), NaN]];
    const s = summarize({ now: NOW, rank, buyBox: [], offerCount: [], amazon, reviewCount: [] });
    expect(s.amazonLastSeenDays).toBe(150);
    const never = summarize({ now: NOW, rank, buyBox: [], offerCount: [], amazon: [], reviewCount: [] });
    expect(never.amazonLastSeenDays).toBeNull();
    const now = summarize({ now: NOW, rank, buyBox: [], offerCount: [], amazon: [[daysAgo(3), 9.99]], reviewCount: [] });
    expect(now.amazonLastSeenDays).toBe(0);
  });

  it("measures the top seller's Buy Box share", () => {
    const sellers: [number, string][] = [[daysAgo(365), "A"], [daysAgo(73), "B"]];
    const s = summarize({ now: NOW, rank, buyBox: [], offerCount: [], amazon: [], reviewCount: [], buyBoxSellers: sellers });
    expect(s.topSellerBbSharePct).toBeCloseTo(80, 0);
  });

  it("flags a one-day review jump", () => {
    const reviews: Point[] = [[daysAgo(10), 40], [daysAgo(9), 100]];
    const s = summarize({ now: NOW, rank, buyBox: [], offerCount: [], amazon: [], reviewCount: reviews });
    expect(s.reviewJumpPct).toBe(150);
  });

  it("computes the median", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("clients", () => {
  it("uses the stub until the key looks real", () => {
    expect(getKeepa({ KEEPA_API_KEY: "placeholder" } as unknown as NodeJS.ProcessEnv)).toBeInstanceOf(StubKeepaClient);
    expect(getKeepa({} as NodeJS.ProcessEnv).available).toBe(false);
    expect(getKeepa({ KEEPA_API_KEY: "a".repeat(64) } as unknown as NodeJS.ProcessEnv)).toBeInstanceOf(HttpKeepaClient);
    expect(getKeepa({ KEEPA_API_KEY: "a".repeat(64), KEEPA_MODE: "stub" } as unknown as NodeJS.ProcessEnv)).toBeInstanceOf(StubKeepaClient);
  });

  it("parses a raw product: dims in mm → cm, EAN list, category", () => {
    const p = parseKeepaProduct({
      asin: "B1", eanList: ["5012345678900"], title: "T", brand: "Br",
      categoryTree: [{ name: "Health & Personal Care" }],
      packageLength: 120, packageWidth: 80, packageHeight: 50, packageWeight: 210,
      csv: [],
    }, NOW);
    expect(p.dimsCm).toEqual({ l: 12, w: 8, h: 5 });
    expect(p.weightG).toBe(210);
    expect(p.category).toBe("Health & Personal Care");
    expect(p.summary.monthlySold).toBeNull();
    const sold = parseKeepaProduct({ asin: "B2", csv: [], monthlySold: 200 }, NOW);
    expect(sold.summary.monthlySold).toBe(200);
    expect(parseKeepaProduct({ asin: "B3", csv: [], monthlySold: -1 }, NOW).summary.monthlySold).toBeNull();
  });

  it("looks up EANs in batches of 100 on domain 2 and matches by EAN", async () => {
    const urls: URL[] = [];
    const fetchImpl = (async (u: URL) => {
      urls.push(u);
      const codes = u.searchParams.get("code")!.split(",");
      return new Response(JSON.stringify({ tokensConsumed: codes.length, products: [{ asin: "B" + codes[0], eanList: [codes[0]], csv: [] }] }));
    }) as unknown as typeof fetch;
    const eans = Array.from({ length: 150 }, (_, i) => String(5000000000000 + i));
    const r = await new HttpKeepaClient("k".repeat(64), fetchImpl, () => {}).lookupByEans(eans);
    expect(urls).toHaveLength(2);
    expect(urls[0].searchParams.get("domain")).toBe("2");
    expect(r.tokensUsed).toBe(150);
    expect(r.byEan.get(eans[0])![0].asin).toBe("B" + eans[0]);
    expect(r.byEan.get(eans[100])![0].asin).toBe("B" + eans[100]);
  });
});

describe("Keepa requests: logging and tokens", () => {
  const reply = (body: object, status = 200) => new Response(JSON.stringify(body), { status });

  it("looks up by ASIN, logs Keepa's token figures, and reports each response before parsing", async () => {
    const lines: string[] = [];
    const seen: unknown[] = [];
    const fetchImpl = (async (u: URL) => {
      expect(u.searchParams.get("asin")).toBe("B1,B2");
      expect(u.searchParams.get("buybox")).toBe("1");
      return reply({ tokensConsumed: 6, tokensLeft: 279, refillIn: 7598, processingTimeInMs: 496, products: [{ asin: "B1", csv: [] }, { asin: "B2", csv: [] }] });
    }) as unknown as typeof fetch;
    const r = await new HttpKeepaClient("k".repeat(64), fetchImpl, (l) => lines.push(l)).lookupByAsins(["B1", "B2", "B1"], (m) => void seen.push(m));
    expect([...r.byAsin.keys()]).toEqual(["B1", "B2"]);
    expect(r).toMatchObject({ tokensUsed: 6, tokensLeft: 279 });
    expect(lines).toEqual(["[keepa] asin lookup n=2 http=200 products=2 tokensConsumed=6 tokensLeft=279 refillIn=7598ms processing=496ms"]);
    expect(seen).toEqual([{ kind: "asin", count: 2, status: 200, tokensConsumed: 6, tokensLeft: 279, refillInMs: 7598, processingTimeInMs: 496, products: 2 }]);
  });

  it("stops asking once Keepa reports no tokens left", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return reply({ tokensConsumed: 300, tokensLeft: -12, refillIn: 60000, products: [] });
    }) as unknown as typeof fetch;
    const asins = Array.from({ length: 150 }, (_, i) => `B${i}`);
    const r = await new HttpKeepaClient("k".repeat(64), fetchImpl, () => {}).lookupByAsins(asins);
    expect(calls).toBe(1);
    expect(r.exhausted).toEqual({ refillInMs: 60000, skipped: 50 });
  });

  it("reports a 429 as exhausted, with the tokens it cost", async () => {
    const fetchImpl = (async () => reply({ tokensConsumed: 0, tokensLeft: -5, refillIn: 30000, error: { type: "NOT_ENOUGH_TOKEN" } }, 429)) as unknown as typeof fetch;
    const r = await new HttpKeepaClient("k".repeat(64), fetchImpl, () => {}).lookupByAsins(["B1", "B2"]);
    expect(r.exhausted).toEqual({ refillInMs: 30000, skipped: 2 });
    expect(r.requests[0]).toMatchObject({ status: 429, tokensLeft: -5 });
    expect(r.byAsin.size).toBe(0);
  });
});

describe("summary fixes from live data", () => {
  it("treats Keepa's negative 'not collected' FBA count as unknown", () => {
    const s = summarize({ now: NOW, rank: [], buyBox: [], offerCount: [], amazon: [], reviewCount: [], fbaOfferCount: -2 });
    expect(s.fbaOffers).toBeNull();
  });

  it("won't extrapolate a slope from a few scattered Buy Box points", () => {
    // Five priced spells in a year with gaps between: once gave -592%/yr.
    const bb: Point[] = [];
    for (const d of [360, 300, 200, 100, 20]) bb.push([daysAgo(d), 40 - d / 20], [daysAgo(d - 3), NaN]);
    const s = summarize({ now: NOW, rank: [], buyBox: bb, offerCount: [], amazon: [], reviewCount: [] });
    expect(s.bbSlopePctYr).toBeNull();
  });

  it("trims a series to a window, keeping the point in force at its start", () => {
    const series: Point[] = [[daysAgo(900), 1], [daysAgo(600), 2], [daysAgo(100), 3], [daysAgo(10), 4]];
    expect(trimSeries(series, daysAgo(460))).toEqual([[daysAgo(600), 2], [daysAgo(100), 3], [daysAgo(10), 4]]);
    expect(trimSeries(series, daysAgo(5))).toEqual([[daysAgo(10), 4]]);
  });
});

describe("snapshot extras and seller profiles (fields as the live API returns them)", () => {
  it("reads Keepa's fee, referral %, own drop count, variations, package and top Buy Box sellers", () => {
    const km = (msAgoDays: number) => String(Math.round((NOW - msAgoDays * DAY) / 60000 - 21_564_000));
    const p = parseKeepaProduct({
      asin: "B0060OMXUA", csv: [],
      packageLength: 212, packageWidth: 71, packageHeight: 70, packageWeight: 570,
      fbaFees: { pickAndPackFee: 309 }, referralFeePercent: 15, variations: [{}, {}, {}, {}],
      stats: { salesRankDrops30: 68, offerCountFBA: -2 },
      buyBoxSellerIdHistory: [km(400), "OLD", km(365), "A2EMSOJIB72L9M", km(200), "ACZ7XXV2ABVHG", km(73), "A213N0RBNFMX21"],
    } as Parameters<typeof parseKeepaProduct>[0], NOW);
    expect(p.summary).toMatchObject({
      fbaFee: 3.09, referralFeePct: 15, keepaRankDrops30: 68, variationCount: 4, fbaOffers: null,
      packageDims: { l: 21.2, w: 7.1, h: 7 }, packageWeightG: 570,
    });
    // Last 365 days only ("OLD" held it before that): 165, 127 and 73 days.
    expect(p.summary.topSellers).toEqual([
      { sellerId: "A2EMSOJIB72L9M", sharePct: 45.2 },
      { sellerId: "ACZ7XXV2ABVHG", sharePct: 34.8 },
      { sellerId: "A213N0RBNFMX21", sharePct: 20 },
    ]);
  });

  it("parses a seller: rating, storefront size from the last pair, brands largest first", () => {
    const s = parseSeller("A2EMSOJIB72L9M", {
      sellerName: "Cosmeco", currentRating: 98, currentRatingCount: 1289, totalStorefrontAsins: [7900000, 700, 7963294, 766],
      sellerBrandStatistics: [{ brand: "taaj", productCount: 61 }, { brand: "bioderma", productCount: 110 }, { brand: "x", productCount: 0 }],
    });
    expect(s).toEqual({ sellerId: "A2EMSOJIB72L9M", name: "Cosmeco", ratingPct: 98, ratingCount: 1289, storefrontSize: 766,
      brands: [{ brand: "bioderma", count: 110 }, { brand: "taaj", count: 61 }] });
  });

  it("asks the seller endpoint on domain 2 and logs Keepa's token figures", async () => {
    const lines: string[] = [];
    const fetchImpl = (async (u: URL) => {
      expect(u.pathname).toBe("/seller");
      expect(u.searchParams.get("seller")).toBe("S1,S2");
      return new Response(JSON.stringify({ tokensConsumed: 2, tokensLeft: 267, sellers: { S1: { sellerName: "One" }, S2: { sellerName: "Two" } } }));
    }) as unknown as typeof fetch;
    const r = await new HttpKeepaClient("k".repeat(64), fetchImpl, (l) => lines.push(l)).lookupSellers(["S1", "S2", "S1"]);
    expect([...r.profiles.keys()]).toEqual(["S1", "S2"]);
    expect(r.tokensUsed).toBe(2);
    expect(lines[0]).toMatch(/^\[keepa\] seller lookup n=2 http=200 products=2 tokensConsumed=2 tokensLeft=267/);
  });
});
