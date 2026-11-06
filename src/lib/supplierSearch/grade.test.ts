import { describe, expect, it } from "vitest";
import type { Checked } from "./extract";
import { compareModels, gate, gradeRows, hasGrades, parseGrades, providerMap, scoreGrades, toCsv, type GradeRow, type SpikeReport, type ProviderScore } from "./grade";
import type { PageResult, ProductRun } from "./spikeRun";
import type { TestItem } from "./testSet";

const row = (over: Partial<GradeRow> = {}): GradeRow => ({
  row_id: "p:a.com", product: "p", supplier: "A", url: "https://a.com/", model_type: "manufacturer", type_evidence: "", model_country: "CN", country_evidence: "", tld_hint: "",
  price_as_written: "", price_basis: "none", unit_price: "", moq: "", product_ok: "", type_ok: "", country_ok: "", price_ok: "", ...over,
});
const extraction = (over: Partial<Checked> = {}): Checked => ({
  productMatch: "yes", productName: "x", supplierName: "Acme", supplierType: "manufacturer", typeEvidence: "factory", typeConfidence: "high",
  country: "CN", countryEvidence: "Shenzhen", countrySource: "address", countryConfidence: "high",
  price: 5, priceBasis: "per_unit", unitsInPrice: null, currency: "USD", priceEvidence: "$5", moq: 100, moqUnit: "pcs", vat: "unknown",
  unitPrice: 5, tldHint: null, cleared: [], ...over,
});
const page = (url: string, over: Partial<PageResult> = {}): PageResult => ({ url, title: "Title", snippet: "s", status: "read", extraction: extraction(), costUsd: 0.01, ...over });
const run = (id: string, kind: TestItem["kind"], serper: PageResult[], brave: PageResult[] = []): ProductRun => ({
  item: { id, query: id, kind }, results: { serper, brave }, partial: [], stoppedForBudget: false, queriesUsed: { serper: 5, brave: 5 },
});

describe("gradeRows", () => {
  it("merges a domain found by both providers into one row", () => {
    const rows = gradeRows([run("p", "manufacturer", [page("https://a.com/1")], [page("https://www.a.com/2")])]);
    expect(rows).toHaveLength(1);
    expect(rows[0].row_id).toBe("p:a.com");
  });
  it("puts manufacturer products first", () => {
    const rows = gradeRows([run("g", "generic", [page("https://a.com/")]), run("m", "manufacturer", [page("https://b.com/")])]);
    expect(rows.map((r) => r.product)).toEqual(["m", "g"]);
  });
  it("takes each provider's top 10 readable results", () => {
    const pages = Array.from({ length: 15 }, (_, i) => page(`https://s${i}.com/`));
    expect(gradeRows([run("p", "generic", pages)])).toHaveLength(10);
  });
  it("leaves out pages that couldn't be read", () => {
    const rows = gradeRows([run("p", "generic", [page("https://a.com/", { status: "fetch_failed", extraction: null })])]);
    expect(rows).toEqual([]);
  });
  it("shows a platform page as not opened, with an unknown country", () => {
    const [r] = gradeRows([run("p", "manufacturer", [page("https://acme.en.alibaba.com/", { status: "snippet_only", extraction: null })])]);
    expect(r).toMatchObject({ model_type: "marketplace", model_country: "Unknown", price_basis: "not opened", supplier: "Title" });
  });
  it("shows a missing country and price honestly", () => {
    const [r] = gradeRows([run("p", "generic", [page("https://a.com/", { extraction: extraction({ country: null, countryEvidence: null, price: null, priceEvidence: null, priceBasis: "on_request", unitPrice: null }) })])]);
    expect(r).toMatchObject({ model_country: "Unknown", price_as_written: "", price_basis: "on_request", unit_price: "" });
  });
  it("records which providers found each row, away from the sheet", () => {
    const runs = [run("p", "manufacturer", [page("https://a.com/1")], [page("https://a.com/2"), page("https://b.com/")])];
    expect(providerMap(runs)).toEqual({ "p:a.com": ["serper", "brave"], "p:b.com": ["brave"] });
  });
});

describe("the sheet", () => {
  it("has no provider column and survives a round trip with commas and quotes", () => {
    const rows = [row({ supplier: 'A, "the" Co\nLtd', type_evidence: "x,y" }), row({ row_id: "p:b.com", supplier: "中国" })];
    const csv = toCsv(rows);
    expect(csv.split("\n")[0]).not.toContain("provider");
    expect(parseGrades(csv)).toEqual(rows);
  });
  it.each(["=HYPERLINK(1)", "+1", "-1", "@x"])("a page can't plant a spreadsheet formula with %s", (bad) => {
    const csv = toCsv([row({ supplier: bad })]);
    expect(csv).not.toContain(`,${bad},`);
    expect(csv).toContain(`'${bad}`);
    expect(parseGrades(csv)[0].supplier).toBe(bad);
  });
  it("hasGrades spots a sheet that has been filled in", () => {
    expect(hasGrades([row()])).toBe(false);
    expect(hasGrades([row(), row({ type_ok: "y" })])).toBe(true);
  });
});

const items: TestItem[] = [{ id: "p", query: "p", kind: "manufacturer" }, { id: "q", query: "q", kind: "generic" }];

describe("scoreGrades", () => {
  it("counts results per country, with no country shown as Unknown", () => {
    const rows = [row({ row_id: "1", model_country: "GB" }), row({ row_id: "2", model_country: "GB" }), row({ row_id: "3", model_country: "DE" }), row({ row_id: "4", model_country: "CN" }), row({ row_id: "5", model_country: "Unknown" })];
    const map = { 1: ["serper"], 2: ["serper"], 3: ["serper"], 4: ["serper"], 5: ["serper"] } as Record<string, ("serper" | "brave")[]>;
    expect(scoreGrades(rows, items, map).byCountry.serper).toEqual({ GB: 2, DE: 1, CN: 1, Unknown: 1 });
  });
  it("counts '?' as neither right nor wrong", () => {
    const rows = [row({ row_id: "1", type_ok: "y" }), row({ row_id: "2", type_ok: "n" }), row({ row_id: "3", type_ok: "?" })];
    const s = scoreGrades(rows, items, { 1: ["serper"], 2: ["serper"], 3: ["serper"] }).providers[0];
    expect(s.makerLabelled).toBe(2);
    expect(s.makerPrecision).toBe(0.5);
  });
  it("only scores a row for the provider that found it", () => {
    const rows = [row({ row_id: "1", type_ok: "y" }), row({ row_id: "2", type_ok: "n" })];
    const r = scoreGrades(rows, items, { 1: ["serper"], 2: ["brave"] });
    expect(r.providers.find((p) => p.provider === "serper")?.makerPrecision).toBe(1);
    expect(r.providers.find((p) => p.provider === "brave")?.makerPrecision).toBe(0);
  });
  it("a product counts as a maker hit with 3 results right on product and type", () => {
    const good = (id: string) => row({ row_id: id, product_ok: "y", type_ok: "y" });
    const rows = [good("1"), good("2"), good("3"), good("4"), row({ row_id: "5", product_ok: "y", type_ok: "n" })];
    const map = Object.fromEntries(rows.map((r) => [r.row_id, ["serper"]])) as Record<string, ("serper" | "brave")[]>;
    expect(scoreGrades(rows, items, map).providers[0].makersWithThree).toBe(1);
    expect(scoreGrades(rows.slice(0, 2), items, map).providers[0].makersWithThree).toBe(0);
  });
  it("wholesale scores read only branded and generic products", () => {
    const rows = [row({ row_id: "1", product: "q", product_ok: "y", price_as_written: "£1", price_ok: "n" }), row({ row_id: "2", product: "p", product_ok: "n", price_as_written: "£2", price_ok: "y" })];
    const s = scoreGrades(rows, items, { 1: ["serper"], 2: ["serper"] }).providers[0];
    expect(s.productPrecision).toBe(1);
    expect(s.pricePrecision).toBe(0);
  });
  it("a page never opened isn't counted against the country score", () => {
    const rows = [row({ row_id: "1", model_country: "CN", country_ok: "y" }), row({ row_id: "2", model_country: "Unknown", price_basis: "not opened" })];
    const s = scoreGrades(rows, items, { 1: ["serper"], 2: ["serper"] }).providers[0];
    expect(s.unknownShare).toBe(0);
    expect(s.countryPrecision).toBe(1);
    expect(s.notOpened).toBe(1);
  });
  it("reports how often the web address alone would have been right", () => {
    const rows = [row({ row_id: "1", model_country: "DE", tld_hint: "DE", country_ok: "y" }), row({ row_id: "2", model_country: "CN", tld_hint: "DE", country_ok: "y" }), row({ row_id: "3", model_country: "CN", tld_hint: "", country_ok: "y" })];
    const s = scoreGrades(rows, items, { 1: ["serper"], 2: ["serper"], 3: ["serper"] }).providers[0];
    expect(s.tldRight).toBe(1);
    expect(s.countryConfirmed).toBe(3);
  });
});

const score = (over: Partial<ProviderScore>): ProviderScore => ({
  provider: "serper", results: 100, graded: 100, makersWithThree: 8, makerProducts: 8, makerLabelled: 10, makerPrecision: 1, productPrecision: 1, pricePrecision: 1,
  countryPrecision: 1, unknownShare: 0, countryConfirmed: 10, tldRight: 0, notOpened: 0, ...over,
});
const reportWith = (over: Partial<ProviderScore>): SpikeReport => ({ providers: [score(over)], byCountry: {} });

describe("gate", () => {
  it("6 of 8 and 70% is go, 5 of 8 is stop", () => {
    expect(gate(reportWith({ makersWithThree: 6, makerPrecision: 0.7 }))[0].manufacturers).toBe("go");
    expect(gate(reportWith({ makersWithThree: 5, makerPrecision: 0.9 }))[0].manufacturers).toBe("stop");
    expect(gate(reportWith({ makersWithThree: 8, makerPrecision: 0.69 }))[0].manufacturers).toBe("stop");
  });
  it("wholesale needs 80% product and 90% price", () => {
    expect(gate(reportWith({ productPrecision: 0.8, pricePrecision: 0.9 }))[0].wholesale).toBe("go");
    expect(gate(reportWith({ productPrecision: 0.79 }))[0].wholesale).toBe("stop");
    expect(gate(reportWith({ pricePrecision: 0.89 }))[0].wholesale).toBe("stop");
  });
  it("90% country precision with 41% unknown is stop", () => {
    expect(gate(reportWith({ countryPrecision: 0.9, unknownShare: 0.41 }))[0].country).toBe("stop");
    expect(gate(reportWith({ countryPrecision: 0.9, unknownShare: 0.4 }))[0].country).toBe("go");
    expect(gate(reportWith({ countryPrecision: 0.89, unknownShare: 0 }))[0].country).toBe("stop");
  });
  it("nothing graded is a stop, never a pass", () => {
    const g = gate(reportWith({ makerPrecision: null, productPrecision: null, pricePrecision: null, countryPrecision: null, unknownShare: null }))[0];
    expect([g.manufacturers, g.wholesale, g.country]).toEqual(["stop", "stop", "stop"]);
  });
  it("gives its reasons", () => {
    expect(gate(reportWith({ makersWithThree: 5 }))[0].reasons.join(" ")).toMatch(/5 of 8/);
  });
});

describe("compareModels", () => {
  it("measures the other model only where its answer was confirmed by a grade", () => {
    const graded = [
      row({ row_id: "1", model_type: "manufacturer", type_ok: "y", model_country: "CN", country_ok: "y", price_as_written: "$5", price_ok: "y" }),
      row({ row_id: "2", model_type: "wholesaler", type_ok: "y", model_country: "DE", country_ok: "n" }),
      row({ row_id: "3", model_type: "retailer", type_ok: "?" }),
    ];
    const other = [
      row({ row_id: "1", model_type: "manufacturer", model_country: "CN", price_as_written: "$5" }),
      row({ row_id: "2", model_type: "retailer", model_country: "DE" }),
      row({ row_id: "3", model_type: "retailer" }),
    ];
    expect(compareModels(graded, other)).toEqual({ type: { same: 1, total: 2 }, country: { same: 1, total: 1 }, price: { same: 1, total: 1 } });
  });
});
