import { describe, expect, it } from "vitest";
import { compareResults, firstResultDir, nextResultSort } from "./sort";
import type { Result } from "./types";

const r = (id: string, o: Partial<Result> & { asin?: string; rankNow?: number | null; buyBox?: number | null } = {}): Result => ({
  id, status: "done", verdict: "pass", failed_gate: null, gate_outcomes: [], fees: null, sell_price: null, price_source: null, landed_cost: null,
  profit: null, roi: null, margin: null, hurdle_price: null, score: null, group_scores: null, why: null, band: null, offer_count: 0, error: null,
  inputs: { market: { hasHistory: true, rankNow: o.rankNow ?? null, currentBuyBox: o.buyBox ?? null } },
  product: { ean: id, asin: o.asin ?? null, title: id, brand: null, category: null }, offer: null, ...o,
} as Result);

const order = (rows: Result[], key: Parameters<typeof compareResults>[0], dir: 1 | -1, sparks?: Parameters<typeof compareResults>[3]) =>
  [...rows].sort(compareResults(key, dir, 500, sparks)).map((x) => x.id);

describe("results sort", () => {
  it("numbers: blanks last whichever way", () => {
    const rows = [r("a", { profit: 2 }), r("b"), r("c", { profit: 5 }), r("d", { profit: -1 })];
    expect(order(rows, "profit", -1)).toEqual(["c", "a", "d", "b"]);
    expect(order(rows, "profit", 1)).toEqual(["d", "a", "c", "b"]);
  });

  it("90-day rank: the sparkline's average when loaded, else the current rank; best first on the first click", () => {
    const rows = [r("a", { asin: "A1", rankNow: 9000 }), r("b", { asin: "B1", rankNow: 100 }), r("c", { asin: "C1" })];
    expect(firstResultDir("rank90")).toBe(1);
    expect(order(rows, "rank90", 1)).toEqual(["b", "a", "c"]);
    // A's sparkline averages 50: now the best.
    expect(order(rows, "rank90", 1, { A1: { rank: [40, null, 60], buyBox: null } })).toEqual(["a", "b", "c"]);
  });

  it("90-day Buy Box, and why by its first reason A–Z", () => {
    const rows = [r("a", { buyBox: 12 }), r("b", { buyBox: 30 }), r("c")];
    expect(order(rows, "bb90", firstResultDir("bb90"))).toEqual(["b", "a", "c"]);
    const why = [r("a", { why: "Price below floor; no sales" }), r("b", { why: "amazon on listing" }), r("c")];
    expect(order(why, "why", firstResultDir("why"))).toEqual(["b", "a", "c"]);
  });

  it("first click: text ascending, numbers descending; the same column flips", () => {
    expect([firstResultDir("title"), firstResultDir("verdict"), firstResultDir("score"), firstResultDir("profitMo")]).toEqual([1, 1, -1, -1]);
    expect(nextResultSort({ key: "score", dir: -1 }, "score")).toEqual({ key: "score", dir: 1 });
    expect(nextResultSort({ key: "score", dir: -1 }, "title")).toEqual({ key: "title", dir: 1 });
  });
});
