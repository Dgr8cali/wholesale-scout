import { describe, expect, it } from "vitest";
import { activeChips, EMPTY_FILTERS, filtersFromQuery, filtersToQuery, isEmpty, matches, normalizeFilters, parseRange, type FilterRow, type FilterSet } from "./filters";
import { favKey, toFilterRow, type ResultLike } from "./ui/resultRows";

const row = (over: Partial<FilterRow> = {}): FilterRow => ({
  verdict: "warn", band: "amber", failedGate: null, brand: "Bioderma", supplier: "Pharmazon", amazon: "no", approval: "open",
  favourite: false, waived: false, dormant: false, values: { sales: 200, sellers: 5, profit: 6.4, roi: 84, margin: 30, sell: 22.9, bsr: 12_000 }, text: "Bioderma Sebium gel 3401399277092", ...over,
});
const f = (over: Partial<FilterSet>): FilterSet => ({ ...EMPTY_FILTERS, ...over });

describe("dormant in the verdict filter", () => {
  it("picks dormant listings, alone or alongside verdicts", () => {
    expect(matches(row({ verdict: "fail", dormant: true }), f({ verdicts: ["dormant"] }))).toBe(true);
    expect(matches(row({ verdict: "pass", dormant: false }), f({ verdicts: ["dormant"] }))).toBe(false);
    expect(matches(row({ verdict: "pass", dormant: false }), f({ verdicts: ["pass", "dormant"] }))).toBe(true);
  });

  it("marks a stored row dormant when it has history but no Buy Box and no rank now", () => {
    const base: ResultLike = { status: "done", verdict: "fail", band: null, failed_gate: "demand", sell_price: null, profit: null, roi: null, margin: null, why: null, gate_outcomes: [], product: { ean: "1", asin: "B000000001", title: "x", brand: null }, offer: null, inputs: { market: { hasHistory: true, currentBuyBox: null, rankNow: null } } };
    expect(toFilterRow(base, new Set()).dormant).toBe(true);
    expect(toFilterRow({ ...base, inputs: { market: { hasHistory: true, currentBuyBox: 9.99, rankNow: null } } }, new Set()).dormant).toBe(false);
    expect(toFilterRow({ ...base, inputs: { market: { hasHistory: false, currentBuyBox: null, rankNow: null } } }, new Set()).dormant).toBe(false);
    // Offers live now (Amazon selling, say) even with no Buy Box or rank in the summary: not dormant.
    expect(toFilterRow({ ...base, inputs: { market: { hasHistory: true, currentBuyBox: null, rankNow: null, offersNow: 2 } } }, new Set()).dormant).toBe(false);
    expect(toFilterRow({ ...base, inputs: { market: { hasHistory: true, currentBuyBox: null, rankNow: null, lastOfferDaysAgo: 0 } } }, new Set()).dormant).toBe(false);
  });
});

describe("filters combine with AND", () => {
  it("matches everything when empty", () => {
    expect(matches(row(), EMPTY_FILTERS)).toBe(true);
    expect(isEmpty(EMPTY_FILTERS)).toBe(true);
  });

  it("applies each kind of filter", () => {
    expect(matches(row(), f({ verdicts: ["pass", "warn"] }))).toBe(true);
    expect(matches(row(), f({ verdicts: ["pass"] }))).toBe(false);
    expect(matches(row({ verdict: "fail", failedGate: "amazonPresence" }), f({ gates: ["amazonPresence", "fees"] }))).toBe(true);
    expect(matches(row(), f({ gates: ["fees"] }))).toBe(false);
    expect(matches(row(), f({ brands: ["Bioderma", "Nuxe"] }))).toBe(true);
    expect(matches(row(), f({ supplier: "Qogita" }))).toBe(false);
    expect(matches(row(), f({ amazon: "no" }))).toBe(true);
    expect(matches(row({ amazon: null }), f({ amazon: "no" }))).toBe(false); // unknown drops out
    expect(matches(row(), f({ approval: ["approval_required", "blocked"] }))).toBe(false);
    expect(matches(row(), f({ favouritesOnly: true }))).toBe(false);
    expect(matches(row({ favourite: true }), f({ favouritesOnly: true }))).toBe(true);
    expect(matches(row(), f({ q: "sebium" }))).toBe(true);
    expect(matches(row(), f({ waivedOnly: true }))).toBe(false);
    expect(matches(row({ waived: true }), f({ waivedOnly: true }))).toBe(true);
  });

  it("takes numeric ranges inclusively, and drops rows with no value once a range is set", () => {
    expect(matches(row(), f({ ranges: { roi: { min: 84, max: null } } }))).toBe(true);
    expect(matches(row(), f({ ranges: { profit: { min: 2, max: 6 } } }))).toBe(false);
    expect(matches(row({ values: { ...row().values, sales: null } }), f({ ranges: { sales: { min: 30, max: null } } }))).toBe(false);
    expect(matches(row({ values: { ...row().values, sales: null } }), f({ ranges: { sales: { min: null, max: null } } }))).toBe(true);
  });

  it("requires every active filter at once", () => {
    const set = f({ verdicts: ["warn"], brands: ["Bioderma"], ranges: { sell: { min: 12, max: 40 } }, amazon: "no" });
    expect(matches(row(), set)).toBe(true);
    expect(matches(row({ amazon: "yes" }), set)).toBe(false);
  });
});

describe("chips", () => {
  it("lists one removable chip per active value", () => {
    const set = f({ verdicts: ["pass", "warn"], gates: ["fees"], amazon: "yes", ranges: { roi: { min: 25, max: null }, profit: { min: 2, max: 8 } }, q: "gel" });
    const chips = activeChips(set, { fees: "Fee engine" });
    expect(chips.map((c) => c.label)).toEqual(["Buy", "Check", "Failed: Fee engine", "Amazon on listing: yes", "Profit £2–£8", "ROI ≥ 25%", "“gel”"]);
    const after = chips.find((c) => c.label === "Buy")!.remove(set);
    expect(after.verdicts).toEqual(["warn"]);
    expect(chips.find((c) => c.id === "r:roi")!.remove(set).ranges.roi).toBeUndefined();
  });

  it("fills fields missing from an older saved set", () => {
    expect(normalizeFilters({ verdicts: ["pass"] } as Partial<FilterSet>)).toEqual({ ...EMPTY_FILTERS, verdicts: ["pass"] });
  });
});

describe("result rows", () => {
  const r: ResultLike = {
    status: "done", verdict: "fail", band: null, failed_gate: "amazonPresence", sell_price: 23.55, profit: 4, roi: 40, margin: 18, why: "Failed amazon presence",
    gate_outcomes: [{ gate: "amazonPresence", status: "fail", tags: ["AMAZON"] }, { gate: "gating", status: "pass", tags: ["BRAND_APPROVED"] }],
    inputs: { market: { hasHistory: true, rankDrops30d: 53, monthlySold: 200, fbaOffers: 4 }, restriction: { status: "approval_required" } },
    product: { ean: "3401399277092", asin: "B0060OMXUA", title: "Bioderma Sebium", brand: "Bioderma" },
    offer: { supplier: { name: "Pharmazon" } },
  };

  it("reads Amazon presence from the gate, approval (brand-approved = open), sales and favourite", () => {
    const fr = toFilterRow(r, new Set([favKey("3401399277092", "B0060OMXUA")]));
    expect(fr).toMatchObject({ amazon: "yes", approval: "open", favourite: true, supplier: "Pharmazon", brand: "Bioderma" });
    expect(fr.values).toMatchObject({ sales: 200, sellers: 4, sell: 23.55 });
  });
});

describe("Not scored, gated and BSR", () => {
  it("picks rows with no verdict, gated or open, and a BSR ceiling", () => {
    expect(matches(row({ verdict: null }), f({ verdicts: ["unscored"] }))).toBe(true);
    expect(matches(row(), f({ verdicts: ["unscored"] }))).toBe(false);
    expect(matches(row({ verdict: null }), f({ verdicts: ["pass", "unscored"] }))).toBe(true);
    expect(matches(row({ approval: "approval_required" }), f({ gated: "yes" }))).toBe(true);
    expect(matches(row({ approval: "blocked" }), f({ gated: "no" }))).toBe(false);
    expect(matches(row({ approval: "open" }), f({ gated: "no" }))).toBe(true);
    // Unknown gating drops out either way.
    expect(matches(row({ approval: null }), f({ gated: "yes" }))).toBe(false);
    expect(matches(row(), f({ ranges: { bsr: { min: null, max: 10_000 } } }))).toBe(false);
    expect(matches(row(), f({ ranges: { bsr: { min: null, max: 50_000 } } }))).toBe(true);
  });
});

describe("filters in the address", () => {
  it("reads every filter from the query string", () => {
    const p = new URLSearchParams("q=gel&verdict=buy,check,none&profit=5&roi=..80&sales=30..200&bsr=..50000&gated=no&supplier=Pharmazon&brand=Nuxe&brand=A%2C%20B&band=green,purple&gate=demand&amazon=yes&approval=open,nope&fav=1&waived=1&tab=products&page=2");
    expect(filtersFromQuery(p)).toEqual({
      ...EMPTY_FILTERS, q: "gel", verdicts: ["pass", "warn", "unscored"],
      ranges: { profit: { min: 5, max: null }, roi: { min: null, max: 80 }, sales: { min: 30, max: 200 }, bsr: { min: null, max: 50000 } },
      gated: "no", supplier: "Pharmazon", brands: ["Nuxe", "A, B"], bands: ["green"], gates: ["demand"], amazon: "yes", approval: ["open"],
      favouritesOnly: true, waivedOnly: true,
    });
  });

  it("ignores what it can't read", () => {
    expect(filtersFromQuery(new URLSearchParams("verdict=maybe&profit=abc&gated=perhaps&amazon=1&roi=..&tab=x"))).toEqual(EMPTY_FILTERS);
    expect(parseRange("..")).toBeUndefined();
    expect(parseRange("7")).toEqual({ min: 7, max: null });
    expect(parseRange("1.5..")).toEqual({ min: 1.5, max: null });
  });

  it("writes only the filters set, keeps other parameters, and reads back the same", () => {
    expect(filtersToQuery(EMPTY_FILTERS, new URLSearchParams("tab=products&q=old&verdict=buy")).toString()).toBe("tab=products");
    const set = f({ q: "gel", verdicts: ["fail", "dormant"], ranges: { profit: { min: 2, max: null }, bsr: { min: null, max: 9000 }, sell: { min: 10, max: 20 } }, gated: "yes", brands: ["A, B", "C"], supplier: "Qogita", waivedOnly: true });
    const q = filtersToQuery(set, new URLSearchParams("tab=products"));
    expect(q.get("tab")).toBe("products");
    expect(q.get("verdict")).toBe("skip,dormant");
    expect(q.get("bsr")).toBe("..9000");
    expect(q.get("sell")).toBe("10..20");
    expect(q.getAll("brand")).toEqual(["A, B", "C"]);
    expect(filtersFromQuery(q)).toEqual(set);
  });
});
