import { describe, expect, it } from "vitest";
import { EMPTY_FILTERS, filtersFromQuery, matches } from "../filters";
import { toFilterRow } from "../ui/resultRows";
import { planProductQuery } from "./productPage";
import { factsFilters, factsOf, filterRowOf } from "./productFacts";

const plan = (q: string) => planProductQuery(filtersFromQuery(new URLSearchParams(q)));

describe("Products: which filters the database answers", () => {
  it("answers search, plain verdicts, brands and supplier in the query, with nothing left to scan", () => {
    const p = plan("q=nail&verdict=buy,check,none&brand=Beter&supplier=Qogita%20UK");
    expect(p).toMatchObject({ text: "nail", brands: ["Beter"], supplier: "Qogita UK", scan: false });
    // Buy and Check on the brand map's priced verdict; Not scored = never priced (or no verdict).
    expect(p.verdictOr).toBe("and(priced.eq.true,verdict.in.(pass,warn)),priced.eq.false,verdict.is.null");
    expect(p.rest).toEqual(EMPTY_FILTERS);
  });

  it("reads profit, ROI, sales, BSR and gated from each product's latest result", () => {
    const p = plan("verdict=skip&profit=2&bsr=..50000&gated=no");
    expect(p.verdictOr).toBe("and(priced.eq.true,verdict.in.(fail))");
    expect(p.scan).toBe(true);
    expect(p.rest).toMatchObject({ verdicts: [], gated: "no", ranges: { profit: { min: 2, max: null }, bsr: { min: null, max: 50000 } } });
  });

  it("matches every verdict on the result once Error or Dormant is asked for", () => {
    const p = plan("verdict=buy,dormant");
    expect(p.verdictOr).toBeNull();
    expect(p).toMatchObject({ scan: true, rest: { verdicts: ["pass", "dormant"] } });
  });

  it("asks nothing of an empty filter set", () => {
    expect(plan("")).toMatchObject({ text: null, verdictOr: null, brands: [], supplier: null, scan: false });
  });
});

describe("Products: facts of each product's latest result", () => {
  const result = (over: Record<string, unknown> = {}) => ({
    id: "r1", updated_at: "2026-10-20T10:00:00Z", status: "done", verdict: "pass", band: "green", failed_gate: null,
    sell_price: 14.99, profit: 3.4, roi: 42, margin: 22, why: null, error: null,
    gate_outcomes: [{ gate: "gating", status: "pass" }, { gate: "amazonPresence", status: "pass" }],
    market: { hasHistory: true, rankNow: 42000, fbaOffers: 4, currentBuyBox: 14.99, monthlySold: 300 }, restriction: { status: "open" },
    product: { ean: "5000000000001", asin: "B000000001", title: "Nail nippers", brand: "Beter" }, offer: { title: null, supplier: { name: "Qogita UK" } },
    ...over,
  });
  const listed = (r: Record<string, unknown>) => ({ asin: "B000000001", ean: "5000000000001", brand: "Beter", priced: true, verdict: "pass", ...factsOf(r) });

  it("keeps what the filters read, and answers them the way a run's table does", () => {
    const r = result();
    const f = factsOf(r);
    expect(f).toMatchObject({ result_id: "r1", result_updated_at: "2026-10-20T10:00:00Z", approval: "open", amazon: "no", profit: 3.4, roi: 42, bsr: 42000, sellers: 4, is_error: false });
    for (const q of ["profit=3&roi=20", "profit=4", "bsr=..50000&gated=no", "gated=yes", "sales=1000", "verdict=buy,dormant", "amazon=yes"]) {
      const fs = filtersFromQuery(new URLSearchParams(q));
      const rest = planProductQuery(fs).rest;
      expect(matches(filterRowOf(listed(r), false), rest), q).toBe(matches({ ...toFilterRow({ ...r, inputs: { market: r.market, restriction: r.restriction } } as never, new Set()), verdict: "pass" }, rest));
    }
  });

  it("narrows in the database on ranges, gated, approval, Amazon, bands, failed gates and waived", () => {
    const f = factsFilters(filtersFromQuery(new URLSearchParams("profit=3&roi=20&bsr=..100000&gated=no")));
    expect(f).toEqual([["gte", "profit", 3], ["gte", "roi", 20], ["lte", "bsr", 100000], ["eq", "approval", "open"]]);
    expect(factsFilters(filtersFromQuery(new URLSearchParams("gated=yes")))).toEqual([["in", "approval", ["approval_required", "blocked"]]]);
    expect(factsFilters(EMPTY_FILTERS)).toEqual([]);
  });
});
