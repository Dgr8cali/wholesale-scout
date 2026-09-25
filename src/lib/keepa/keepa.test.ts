import { describe, expect, it } from "vitest";
import { getKeepa, HttpKeepaClient, parseKeepaProduct, StubKeepaClient } from "./client";
import { decodeSeries, keepaTimeToMs, median, rankDrops, summarize } from "./summarize";
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
    const r = await new HttpKeepaClient("k".repeat(64), fetchImpl).lookupByEans(eans);
    expect(urls).toHaveLength(2);
    expect(urls[0].searchParams.get("domain")).toBe("2");
    expect(r.tokensUsed).toBe(150);
    expect(r.byEan.get(eans[0])![0].asin).toBe("B" + eans[0]);
    expect(r.byEan.get(eans[100])![0].asin).toBe("B" + eans[100]);
  });
});
