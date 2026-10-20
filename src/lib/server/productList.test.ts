import { describe, expect, it } from "vitest";
import { EMPTY_FILTERS, filtersFromQuery } from "../filters";
import { planProductQuery } from "./productPage";

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
