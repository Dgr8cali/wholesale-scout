import { describe, expect, it } from "vitest";
import type { Checked } from "./extract";
import { committedUsd, countryName, effectiveSearch, parseSearchRequest, priceLine, priceSortValue, type SupplierResult } from "./display";
import { outcomeOf, toResults } from "./results";
import type { PageResult, ProductRun } from "./spikeRun";

const extraction = (over: Partial<Checked> = {}): Checked => ({
  productMatch: "yes", productName: "Bag", supplierName: "Acme", supplierType: "wholesaler", typeEvidence: "trade only", typeConfidence: "high",
  country: "GB", countryEvidence: "Leeds", countrySource: "address", countryConfidence: "high",
  price: null, priceBasis: "none", unitsInPrice: null, currency: null, priceEvidence: null, moq: null, moqUnit: null, vat: "unknown",
  unitPrice: null, tldHint: "GB", cleared: [], ...over,
});
const page = (url: string, over: Partial<PageResult> = {}): PageResult => ({ url, title: "T", snippet: "s", status: "read", extraction: extraction(), costUsd: 0.01, ...over });
const run = (pages: PageResult[]): ProductRun => ({ item: { id: "x", query: "bags", kind: "generic" }, results: { serper: pages }, partial: [], searchErrors: [], stoppedForBudget: false, queriesUsed: {} });

describe("toResults", () => {
  it("keeps what a supplier row needs", () => {
    const [r] = toResults(run([page("https://a.example/p", { extraction: extraction({ price: 2, currency: "GBP", priceBasis: "per_pack", unitsInPrice: 10, unitPrice: 0.2, priceEvidence: "£2", priceProduct: "Bag 10s" }) })]), "wholesale").rows;
    expect(r).toMatchObject({ url: "https://a.example/p", supplier: "Acme", type: "wholesaler", country: "GB", price: 2, currency: "GBP", unitPrice: 0.2, priceProduct: "Bag 10s", opened: true });
  });
  it("drops wrong products, failed pages and comparison sites", () => {
    const rows = toResults(run([
      page("https://wrong.example/", { extraction: extraction({ productMatch: "no" }) }),
      page("https://failed.example/", { status: "fetch_failed", extraction: null }),
      page("https://www.idealo.de/x", { status: "snippet_only", extraction: null }),
      page("https://ok.example/"),
    ]), "wholesale").rows;
    expect(rows.map((r) => r.url)).toEqual(["https://ok.example/"]);
  });
  it("keeps a marketplace page it didn't open, marked as such, named by its title", () => {
    const [r] = toResults(run([page("https://www.alibaba.com/x", { status: "snippet_only", extraction: null, title: "Bags factory" })]), "manufacturer").rows;
    expect(r).toMatchObject({ opened: false, type: "marketplace", supplier: "Bags factory", country: null, price: null });
  });
  it("refuses a link that isn't http or https", () => {
    expect(toResults(run([page("javascript:alert(1)")]), "wholesale").rows).toEqual([]);
  });
  it("puts what you asked for first, then pages with a price, retailers and unopened pages last", () => {
    const rows = toResults(run([
      page("https://shop.example/", { extraction: extraction({ supplierType: "retailer", price: 1 }) }),
      page("https://www.alibaba.com/x", { status: "snippet_only", extraction: null }),
      page("https://trade.example/"),
      page("https://factory.example/", { extraction: extraction({ supplierType: "manufacturer" }) }),
      page("https://factory2.example/", { extraction: extraction({ supplierType: "manufacturer", price: 1 }) }),
    ]), "manufacturer").rows;
    expect(rows.map((r) => new URL(r.url).hostname)).toEqual(["factory2.example", "factory.example", "trade.example", "shop.example", "www.alibaba.com"]);
  });
  it("counts what happened, so a thin result can say why", () => {
    const { stats } = toResults(run([page("https://a.example/"), page("https://b.example/", { status: "fetch_failed", extraction: null }), page("https://c.example/", { status: "robots_blocked", extraction: null }), page("https://www.alibaba.com/x", { status: "snippet_only", extraction: null })]), "wholesale");
    expect(stats).toEqual({ read: 1, failed: 1, blocked: 1, notOpened: 1 });
  });
});

describe("parseSearchRequest", () => {
  it("accepts a product and a kind, trimmed", () => {
    expect(parseSearchRequest({ query: "  bin bags ", kind: "manufacturer" })).toEqual({ query: "bin bags", kind: "manufacturer" });
  });
  it("defaults to wholesale", () => {
    expect(parseSearchRequest({ query: "bin bags", kind: "nonsense" })).toEqual({ query: "bin bags", kind: "wholesale" });
  });
  it.each([[{}], [{ query: "a" }], [{ query: "x".repeat(121) }], [{ query: 5 }]])("refuses %j", (b) => {
    expect(typeof parseSearchRequest(b)).toBe("string");
  });
});

describe("effectiveSearch", () => {
  const started = "2026-11-07T10:00:00Z";
  it("reads a search stuck running for over 10 minutes as failed", () => {
    expect(effectiveSearch({ status: "running", created_at: started, error: null }, Date.parse(started) + 11 * 60_000)).toMatchObject({ status: "failed", error: expect.stringMatching(/interrupted/i) });
  });
  it("leaves a recent search alone", () => {
    expect(effectiveSearch({ status: "running", created_at: started, error: null }, Date.parse(started) + 60_000).status).toBe("running");
  });
  it("leaves a finished search alone", () => {
    expect(effectiveSearch({ status: "done", created_at: started, error: null }, Date.parse(started) + 3_600_000).status).toBe("done");
  });
});

describe("outcomeOf", () => {
  it("is done with rows, and says when the budget or a query cut it short", () => {
    const r = run([page("https://a.example/")]);
    const o = outcomeOf({ ...r, stoppedForBudget: true, searchErrors: ["serper search failed (status 500)"] }, "wholesale");
    expect(o.status).toBe("done");
    expect(o.warnings).toHaveLength(2);
  });
  it("fails when every search failed, naming why", () => {
    const o = outcomeOf({ ...run([]), searchErrors: ["serper search failed (status 401)"] }, "wholesale");
    expect(o).toMatchObject({ status: "failed", error: expect.stringContaining("401") });
  });
  it("fails when the AI couldn't read anything", () => {
    const o = outcomeOf(run([page("https://a.example/", { status: "model_error", extraction: null, reason: "401 invalid key" })]), "wholesale");
    expect(o.status).toBe("failed");
  });
  it("is done with nothing when there were simply no suppliers", () => {
    expect(outcomeOf(run([]), "wholesale")).toMatchObject({ status: "done", rows: [] });
  });
});

describe("priceLine", () => {
  const row = (over: Partial<SupplierResult>): SupplierResult => toResults(run([page("https://a.example/")]), "wholesale").rows[0] && { ...toResults(run([page("https://a.example/")]), "wholesale").rows[0], ...over };
  it("says what the price buys and the unit price", () => {
    expect(priceLine(row({ price: 14.99, currency: "GBP", priceBasis: "per_case", unitsInPrice: 20, unitPrice: 0.7495 }))).toEqual({ main: "£14.99 a case of 20", unit: "£0.75 a unit" });
  });
  it("marks a range as a starting price", () => {
    expect(priceLine(row({ price: 0.41, currency: "USD", priceBasis: "range" }))!.main).toBe("from $0.41");
  });
  it("is empty with no price, never an estimate", () => {
    expect(priceLine(row({ price: null }))).toBeNull();
  });
  it("shows the code when it has no sign, and nothing when it has no currency", () => {
    expect(priceLine(row({ price: 3, currency: "CNY", priceBasis: "per_unit" }))!.main).toBe("CNY 3.00 a unit");
    expect(priceLine(row({ price: 3, currency: null, priceBasis: "none" }))!.main).toBe("3.00");
  });
});

describe("countryName", () => {
  it("spells out a country code", () => {
    expect(countryName("GB")).toBe("United Kingdom");
    expect(countryName("CN")).toBe("China");
  });
  it("says Unknown for nothing or nonsense", () => {
    expect(countryName(null)).toBe("Unknown");
    expect(countryName("not a code")).toBe("Unknown");
  });
});

describe("outcomeOf and the time limit", () => {
  it("warns that the search ran out of time", () => {
    const o = outcomeOf({ ...run([page("https://a.example/")]), stoppedForTime: true }, "wholesale");
    expect(o.status).toBe("done");
    expect(o.warnings[0]).toMatch(/time/i);
  });
});

describe("committedUsd", () => {
  const now = Date.parse("2026-11-07T10:30:00Z");
  const search = (status: string, cost_usd: number, created_at = "2026-11-07T10:29:00Z") => ({ status, cost_usd, created_at, error: null });
  it("adds up finished searches", () => {
    expect(committedUsd([search("done", 0.2), search("failed", 0.1)], 0.5, now)).toBeCloseTo(0.3);
  });
  it("counts a search still running at its full limit", () => {
    expect(committedUsd([search("running", 0), search("running", 0)], 0.5, now)).toBeCloseTo(1);
  });
  it("counts a running search that's already past its limit at what it spent", () => {
    expect(committedUsd([search("running", 0.6)], 0.5, now)).toBeCloseTo(0.6);
  });
  it("counts an interrupted search at what it spent, so it can't hold the limit for ever", () => {
    expect(committedUsd([search("running", 0.07, "2026-11-07T09:00:00Z")], 0.5, now)).toBeCloseTo(0.07);
  });
  it("reads the numeric column's text form", () => {
    expect(committedUsd([search("done", "0.2500" as unknown as number)], 0.5, now)).toBeCloseTo(0.25);
  });
});

describe("priceSortValue", () => {
  const row = (over: Partial<SupplierResult>) => ({ ...toResults(run([page("https://a.example/")]), "wholesale").rows[0], ...over });
  it("orders by unit price within a currency", () => {
    const a = priceSortValue(row({ currency: "GBP", unitPrice: 12.5 }))!, b = priceSortValue(row({ currency: "GBP", unitPrice: 12.25 }))!;
    expect(a).toBeGreaterThan(b);
  });
  it("keeps each currency together, whatever the amount", () => {
    expect(priceSortValue(row({ currency: "GBP", unitPrice: 900 }))!).toBeLessThan(priceSortValue(row({ currency: "CNY", unitPrice: 0.5 }))!);
  });
  it("leaves out a row with no unit price, so a case total isn't ranked against unit prices", () => {
    expect(priceSortValue(row({ currency: "GBP", price: 14.99, unitPrice: null }))).toBeUndefined();
  });
});
