import { describe, expect, it } from "vitest";
import { braveSearch, SearchError, serperSearch } from "./search";
import type { PlannedQuery } from "./queries";

const q: PlannedQuery = { q: "bin bags wholesale UK", country: "GB", lang: "en" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("serperSearch", () => {
  it("posts the country and language, and reads organic results in order", async () => {
    let call: { url: string; init?: RequestInit } | null = null;
    const hits = await serperSearch(q, { apiKey: "k", fetchImpl: (async (url: string, init?: RequestInit) => {
      call = { url, init };
      return json({ organic: [{ link: "https://a.co.uk/x", title: "A", snippet: "sa", position: 1 }, { link: "https://b.co.uk/", title: "B", snippet: "sb", position: 2 }] });
    }) as typeof fetch });
    expect(call!.url).toBe("https://google.serper.dev/search");
    expect(call!.init?.method).toBe("POST");
    expect((call!.init?.headers as Record<string, string>)["X-API-KEY"]).toBe("k");
    expect(JSON.parse(String(call!.init?.body))).toEqual({ q: "bin bags wholesale UK", gl: "gb", hl: "en", num: 10 });
    expect(hits).toEqual([
      { url: "https://a.co.uk/x", title: "A", snippet: "sa", rank: 1, provider: "serper", query: "bin bags wholesale UK" },
      { url: "https://b.co.uk/", title: "B", snippet: "sb", rank: 2, provider: "serper", query: "bin bags wholesale UK" },
    ]);
  });
  it("an empty answer is no hits, not an error", async () => {
    expect(await serperSearch(q, { apiKey: "k", fetchImpl: (async () => json({})) as typeof fetch })).toEqual([]);
  });
});

describe("braveSearch", () => {
  it("sends the token header and reads web.results", async () => {
    let call: { url: string; init?: RequestInit } | null = null;
    const hits = await braveSearch({ q: "bin bags Großhandel", country: "DE", lang: "de" }, { apiKey: "k", fetchImpl: (async (url: string, init?: RequestInit) => {
      call = { url, init };
      return json({ web: { results: [{ url: "https://a.de/", title: "A", description: "da" }] } });
    }) as typeof fetch });
    const u = new URL(call!.url);
    expect(u.origin + u.pathname).toBe("https://api.search.brave.com/res/v1/web/search");
    expect(Object.fromEntries(u.searchParams)).toEqual({ q: "bin bags Großhandel", country: "DE", search_lang: "de", count: "10" });
    expect((call!.init?.headers as Record<string, string>)["X-Subscription-Token"]).toBe("k");
    expect(hits).toEqual([{ url: "https://a.de/", title: "A", snippet: "da", rank: 1, provider: "brave", query: "bin bags Großhandel" }]);
  });
  it("an empty answer is no hits, not an error", async () => {
    expect(await braveSearch(q, { apiKey: "k", fetchImpl: (async () => json({})) as typeof fetch })).toEqual([]);
  });
});

describe("failures", () => {
  it.each([[401, false], [402, true], [429, false], [500, false]])("status %i raises SearchError (outOfCredit %s)", async (status, outOfCredit) => {
    for (const search of [serperSearch, braveSearch]) {
      const err = await search(q, { apiKey: "secret-key", fetchImpl: (async () => json({ error: "x" }, status)) as typeof fetch }).catch((e) => e);
      expect(err).toBeInstanceOf(SearchError);
      expect(err.status).toBe(status);
      expect(err.outOfCredit).toBe(outOfCredit);
      expect(err.message).not.toContain("secret-key");
    }
  });
  it("Serper's 'not enough credits' 400 counts as out of credit", async () => {
    const err = await serperSearch(q, { apiKey: "k", fetchImpl: (async () => json({ message: "Not enough credits" }, 400)) as typeof fetch }).catch((e) => e);
    expect(err.outOfCredit).toBe(true);
  });
  it("a network failure is a SearchError too", async () => {
    const err = await braveSearch(q, { apiKey: "k", fetchImpl: (async () => { throw new Error("ECONNRESET"); }) as typeof fetch }).catch((e) => e);
    expect(err).toBeInstanceOf(SearchError);
    expect(err.status).toBe(0);
  });
});
