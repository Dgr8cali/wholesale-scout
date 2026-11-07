import { describe, expect, it } from "vitest";
import type { Usage } from "../ads/ai";
import type { Extraction } from "./extract";
import { SearchError, type SearchHit, type SearchProvider } from "./search";
import { Budget, dedupeByDomain, runProduct, type SpikeDeps, type Store } from "./spikeRun";
import type { TestItem } from "./testSet";

const item: TestItem = { id: "pill-box", query: "pill box", kind: "manufacturer" };
const hit = (url: string, rank = 1, provider: SearchProvider = "serper"): SearchHit => ({ url, title: `T ${url}`, snippet: "s", rank, provider, query: "q" });
const page = "Acme Plastics Co, Shenzhen, China. We are a factory making pill boxes. $0.50 per piece, MOQ 1000. ".repeat(4);
const good: Extraction = {
  productMatch: "yes", productName: "Pill box", supplierName: "Acme", supplierType: "manufacturer", typeEvidence: "We are a factory", typeConfidence: "high",
  country: "CN", countryEvidence: "Shenzhen, China", countrySource: "address", countryConfidence: "high",
  price: 0.5, priceBasis: "per_unit", unitsInPrice: null, currency: "USD", priceEvidence: "$0.50 per piece", moq: 1000, moqUnit: "pieces", vat: "unknown",
};
const usage: Usage = { input_tokens: 10, output_tokens: 5 };

function memoryStore(): Store & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return { data, get: async <T,>(k: string) => (data.has(k) ? (data.get(k) as T) : null), put: async (k, v) => { data.set(k, v); } };
}
function deps(over: Partial<SpikeDeps> = {}) {
  const calls = { fetch: [] as string[], extract: [] as string[], country: [] as string[], search: 0 };
  const d: SpikeDeps = {
    model: "m",
    search: { serper: async () => { calls.search++; return [hit("https://a.com/1")]; } },
    fetchPage: async (url) => { calls.fetch.push(url); return { status: "ok", finalUrl: url, html: `<body><p>${page}</p></body>`, truncated: false }; },
    fetchRobots: async () => null,
    extract: async (_q, _t, url) => { calls.extract.push(url); return { extraction: good, stop: "end_turn", usage }; },
    extractCountry: async (_t, url) => { calls.country.push(url); return { country: null, countryEvidence: null, countrySource: "none", countryConfidence: "low", usage }; },
    spend: () => 0.01,
    store: memoryStore(),
    budget: new Budget(100),
    ...over,
  };
  return { d, calls };
}

describe("dedupeByDomain", () => {
  it("keeps the best-ranked page per domain", () => {
    const out = dedupeByDomain([hit("https://a.co.uk/x", 3), hit("https://www.a.co.uk/y", 1), hit("https://b.com/", 2)]);
    expect(out.map((h) => h.url)).toEqual(["https://www.a.co.uk/y", "https://b.com/"]);
  });
  it("treats subdomains of a .com as one supplier", () => {
    expect(dedupeByDomain([hit("https://shop.a.com/", 1), hit("https://a.com/", 2)])).toHaveLength(1);
  });
  it("keeps separate shops on a platform apart", () => {
    expect(dedupeByDomain([hit("https://acme.en.alibaba.com/", 1), hit("https://bolt.en.alibaba.com/", 2)])).toHaveLength(2);
  });
  it("drops an address it can't read", () => {
    expect(dedupeByDomain([hit("not a url", 1)])).toEqual([]);
  });
});

describe("runProduct", () => {
  it("reads a page and keeps the checked answer and its cost", async () => {
    const { d } = deps();
    const run = await runProduct(item, d);
    const p = run.results.serper![0];
    expect(p.status).toBe("read");
    expect(p.extraction?.country).toBe("CN");
    expect(p.extraction?.unitPrice).toBe(0.5);
    expect(p.costUsd).toBeCloseTo(0.01);
    expect(run.queriesUsed.serper).toBe(5);
    expect(run.partial).toEqual([]);
  });
  it("never opens a platform page and stays snippet-only", async () => {
    const { d, calls } = deps({ search: { serper: async () => [hit("https://acme.en.alibaba.com/p/1")] } });
    const run = await runProduct(item, d);
    expect(run.results.serper![0].status).toBe("snippet_only");
    expect(calls.fetch).toEqual([]);
    expect(calls.extract).toEqual([]);
  });
  it("skips a robots-disallowed page without fetching it or calling the model", async () => {
    const { d, calls } = deps({ fetchRobots: async () => "User-agent: *\nDisallow: /" });
    const run = await runProduct(item, d);
    expect(run.results.serper![0].status).toBe("robots_blocked");
    expect(calls.fetch).toEqual([]);
    expect(calls.extract).toEqual([]);
  });
  it("a page that can't be fetched is recorded, and costs nothing", async () => {
    const { d, calls } = deps({ fetchPage: async () => ({ status: "http_error", reason: "status 403" }) });
    const run = await runProduct(item, d);
    expect(run.results.serper![0]).toMatchObject({ status: "fetch_failed", reason: "status 403", costUsd: 0 });
    expect(calls.extract).toEqual([]);
  });
  it("a lasting failure isn't tried again on a re-run", async () => {
    let fetches = 0;
    const { d } = deps({ fetchPage: async () => { fetches++; return { status: "http_error", reason: "status 404" }; } });
    await runProduct(item, d);
    await runProduct(item, d);
    expect(fetches).toBe(1);
  });
  it.each([[{ status: "error", reason: "timed out" }], [{ status: "http_error", reason: "status 503" }], [{ status: "http_error", reason: "status 429" }]] as const)("a temporary failure (%j) is tried again on a re-run", async (failure) => {
    let down = true;
    const { d, calls } = deps({ fetchPage: async (url) => (down ? failure : { status: "ok", finalUrl: url, html: `<body><p>${page}</p></body>`, truncated: false }) });
    expect((await runProduct(item, d)).results.serper![0].status).toBe("fetch_failed");
    down = false;
    expect((await runProduct(item, d)).results.serper![0].status).toBe("read");
    expect(calls.extract).toHaveLength(1);
  });
  it("robots.txt that can't be reached means don't crawl for now, and is checked again next time", async () => {
    let down = true;
    const { d, calls } = deps({ fetchRobots: async () => { if (down) throw new Error("timed out"); return null; } });
    const first = (await runProduct(item, d)).results.serper![0];
    expect(first.status).toBe("fetch_failed");
    expect(calls.fetch).toEqual([]);
    down = false;
    expect((await runProduct(item, d)).results.serper![0].status).toBe("read");
  });
  it("a redirect to a platform or a robots-blocked page is refused on the way", async () => {
    const answers: (string | null)[] = [];
    const { d, calls } = deps({
      fetchRobots: async () => "User-agent: *\nDisallow: /secret",
      fetchPage: async (url, allow) => {
        answers.push(await allow!(new URL("https://www.alibaba.com/p")), await allow!(new URL("https://b.com/secret")), await allow!(new URL("https://b.com/fine")));
        return { status: "blocked", reason: answers[0]! };
      },
    });
    await runProduct(item, d);
    expect(answers[0]).toMatch(/platform/);
    expect(answers[1]).toMatch(/robots/);
    expect(answers[2]).toBeNull();
    expect(calls.extract).toEqual([]);
  });
  it("one badly built page is recorded and the run carries on", async () => {
    const { d, calls } = deps({
      search: { serper: async () => [hit("https://deep.com/", 1), hit("https://b.com/", 2)] },
      fetchPage: async (url) => ({ status: "ok", finalUrl: url, truncated: false, html: url.includes("deep") ? "<div>".repeat(12000) : `<body><p>${page}</p></body>` }),
    });
    const run = await runProduct(item, d);
    expect(run.results.serper!.map((p) => p.status)).toEqual(["fetch_failed", "read"]);
    expect(run.results.serper![0].reason).toMatch(/nested/);
    expect(calls.extract).toEqual(["https://b.com/"]);
  });
  it("the same page for two products is judged for each one", async () => {
    const budget = new Budget(100);
    const { d, calls } = deps({ budget, extract: async (q, _t, url) => { calls.extract.push(url); return { extraction: { ...good, productName: q }, stop: "end_turn", usage }; } });
    const a = await runProduct({ id: "bags", query: "bags", kind: "generic" }, d);
    const b = await runProduct({ id: "foil", query: "foil", kind: "generic" }, d);
    expect(a.results.serper![0].extraction?.productName).toBe("bags");
    expect(b.results.serper![0].extraction?.productName).toBe("foil");
    expect(calls.fetch).toHaveLength(1);
    expect(budget.spent).toBeCloseTo(0.02);
  });
  it("the budget is saved after every paid call, so a crash can't lose it", async () => {
    const { d } = deps({
      search: { serper: async () => [hit("https://a.com/", 1), hit("https://b.com/", 2)] },
      extract: async (_q, _t, url) => { if (url.includes("b.com")) { expect(await d.store.get("budget")).toEqual({ spent: 0.01 }); } return { extraction: good, stop: "end_turn", usage }; },
    });
    await runProduct(item, d);
    expect(await d.store.get("budget")).toEqual({ spent: 0.02 });
  });
  it("a page with almost no text isn't sent to the model", async () => {
    const { d, calls } = deps({ fetchPage: async (url) => ({ status: "ok", finalUrl: url, html: "<body>Loading</body>", truncated: false }) });
    const run = await runProduct(item, d);
    expect(run.results.serper![0].status).toBe("no_text");
    expect(calls.extract).toEqual([]);
  });
  it("a rate limit on one query doesn't lose the others, and says why", async () => {
    let n = 0;
    const { d } = deps({ search: { serper: async () => { n++; if (n === 1) throw new SearchError("serper", 429, false); return [hit(`https://s${n}.com/`)]; } } });
    const run = await runProduct(item, d);
    expect(n).toBe(5);
    expect(run.queriesUsed.serper).toBe(4);
    expect(run.partial).toEqual(["serper"]);
    expect(run.searchErrors).toEqual(["serper search failed (status 429)"]);
  });
  it.each([[401], [402]])("status %i stops that provider's searches for this product", async (status) => {
    let n = 0;
    const { d } = deps({ search: { serper: async () => { n++; throw new SearchError("serper", status, status === 402); } } });
    await runProduct(item, d);
    expect(n).toBe(1);
  });
  it("one provider failing leaves the other's results and marks the run partial", async () => {
    const { d } = deps({ search: {
      serper: async () => { throw new SearchError("serper", 402, true); },
      brave: async () => [hit("https://a.com/1", 1, "brave")],
    } });
    const run = await runProduct(item, d);
    expect(run.partial).toEqual(["serper"]);
    expect(run.results.brave).toHaveLength(1);
    expect(run.results.serper).toEqual([]);
  });
  it("a failed search isn't saved, so a re-run tries it again", async () => {
    let fail = true;
    const search = { serper: async () => { if (fail) throw new SearchError("serper", 429, false); return [hit("https://a.com/1")]; } };
    const { d } = deps({ search });
    expect((await runProduct(item, d)).partial).toEqual(["serper"]);
    fail = false;
    const again = await runProduct(item, d);
    expect(again.partial).toEqual([]);
    expect(again.results.serper).toHaveLength(1);
  });
  it("a page found by both providers is read and paid for once", async () => {
    const budget = new Budget(100);
    const { d, calls } = deps({ budget, search: {
      serper: async () => [hit("https://a.com/1")],
      brave: async () => [hit("https://a.com/1", 1, "brave")],
    } });
    const run = await runProduct(item, d);
    expect(calls.extract).toHaveLength(1);
    expect(budget.spent).toBeCloseTo(0.01);
    expect(run.results.serper![0].costUsd).toBeCloseTo(0.01);
    expect(run.results.brave![0].costUsd).toBeCloseTo(0.01);
  });
  it("a re-run reads the saved stage and spends nothing", async () => {
    const { d, calls } = deps();
    await runProduct(item, d);
    const firstSearches = calls.search, firstSpent = d.budget.spent;
    const again = await runProduct(item, d);
    expect(calls.search).toBe(firstSearches);
    expect(calls.fetch).toHaveLength(1);
    expect(calls.extract).toHaveLength(1);
    expect(d.budget.spent).toBe(firstSpent);
    expect(again.results.serper![0].extraction?.country).toBe("CN");
  });
  it("another model re-reads the saved page text without fetching it again", async () => {
    const { d, calls } = deps();
    await runProduct(item, d);
    await runProduct(item, { ...d, model: "other" });
    expect(calls.fetch).toHaveLength(1);
    expect(calls.extract).toHaveLength(2);
  });
  it("stops cleanly when the budget is reached and keeps what it has", async () => {
    const { d, calls } = deps({ budget: new Budget(0.01), search: { serper: async () => [hit("https://a.com/1"), hit("https://b.com/1"), hit("https://c.com/1")] } });
    const run = await runProduct(item, d);
    expect(calls.extract).toHaveLength(1);
    expect(run.stoppedForBudget).toBe(true);
    expect(run.results.serper!.map((p) => p.status)).toEqual(["read", "budget_stop", "budget_stop"]);
  });
  it("a budget stop isn't saved, so a re-run with more budget finishes the page", async () => {
    const budget = new Budget(0);
    const { d, calls } = deps({ budget });
    await runProduct(item, d);
    expect(calls.extract).toHaveLength(0);
    await runProduct(item, { ...d, budget: new Budget(1) });
    expect(calls.extract).toHaveLength(1);
  });
  it("a refused page is recorded with its cost", async () => {
    const { d } = deps({ extract: async () => ({ extraction: null, stop: "refusal", usage }) });
    const p = (await runProduct(item, d)).results.serper![0];
    expect(p).toMatchObject({ status: "no_answer", reason: "refusal" });
    expect(p.costUsd).toBeCloseTo(0.01);
  });
  it("a model error is recorded, isn't saved, and the run carries on", async () => {
    let fail = true;
    const { d } = deps({ extract: async () => { if (fail) throw new Error("529 overloaded"); return { extraction: good, stop: "end_turn", usage }; } });
    expect((await runProduct(item, d)).results.serper![0].status).toBe("model_error");
    fail = false;
    expect((await runProduct(item, d)).results.serper![0].status).toBe("read");
  });
  describe("the contact page", () => {
    const withLink = (url: string) => ({ status: "ok" as const, finalUrl: url, truncated: false, html: `<body><p>${page}</p><a href="/contact">Contact</a></body>` });
    const noCountry: Extraction = { ...good, country: null, countryEvidence: null, countrySource: "none" };
    it("follows it once only when the country is unknown", async () => {
      const { d, calls } = deps({
        fetchPage: async (url) => { calls_.push(url); return withLink(url); },
        extract: async () => ({ extraction: noCountry, stop: "end_turn", usage }),
        extractCountry: async () => ({ country: "CN", countryEvidence: "Shenzhen, China", countrySource: "address", countryConfidence: "high", usage }),
      });
      const calls_: string[] = [];
      const p = (await runProduct(item, d)).results.serper![0];
      expect(calls_).toEqual(["https://a.com/1", "https://a.com/contact"]);
      expect(p.extraction?.country).toBe("CN");
      expect(p.countryFrom).toBe("contact");
      expect(p.costUsd).toBeCloseTo(0.02);
      expect(calls.extract).toEqual([]);
    });
    it("isn't followed when the page already gave the country", async () => {
      const { d, calls } = deps({ fetchPage: async (url) => withLink(url) });
      await runProduct(item, d);
      expect(calls.country).toEqual([]);
    });
    it("isn't followed for the wrong product", async () => {
      const { d, calls } = deps({ fetchPage: async (url) => withLink(url), extract: async () => ({ extraction: { ...noCountry, productMatch: "no" }, stop: "end_turn", usage }) });
      await runProduct(item, d);
      expect(calls.country).toEqual([]);
    });
    it("respects robots on the contact page", async () => {
      const { d, calls } = deps({ fetchPage: async (url) => withLink(url), fetchRobots: async () => "User-agent: *\nDisallow: /contact", extract: async () => ({ extraction: noCountry, stop: "end_turn", usage }) });
      await runProduct(item, d);
      expect(calls.country).toEqual([]);
    });
  });
  it("pays only for the 10 readable pages that can reach the sheet", async () => {
    const many = Array.from({ length: 30 }, (_, i) => hit(`https://s${i}.com/`, i + 1));
    const { d, calls } = deps({ search: { serper: async () => many } });
    await runProduct(item, d);
    expect(calls.extract).toHaveLength(10);
  });
  it("tries further down the list when pages fail, up to 20", async () => {
    const many = Array.from({ length: 30 }, (_, i) => hit(`https://s${i}.com/`, i + 1));
    const { d, calls } = deps({ search: { serper: async () => many }, fetchPage: async (url) => { calls.fetch.push(url); return { status: "http_error", reason: "status 403" }; } });
    await runProduct(item, d);
    expect(calls.fetch).toHaveLength(20);
  });
});

describe("Budget", () => {
  it("counts up and says when it's used", () => {
    const b = new Budget(1);
    expect(b.exhausted).toBe(false);
    b.add(0.6); b.add(0.4);
    expect(b.spent).toBeCloseTo(1);
    expect(b.exhausted).toBe(true);
  });
  it("can start from what an earlier run spent", () => {
    expect(new Budget(1, 1).exhausted).toBe(true);
  });
});
