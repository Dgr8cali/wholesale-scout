import { describe, expect, it, vi } from "vitest";
import { lookupCandidates, SpApiClient, SpApiError, sameGtin, spApiConfigFromEnv } from "./client";
import type { SpApiConfig } from "./types";

const CFG: SpApiConfig = {
  clientId: "cid",
  clientSecret: "secret",
  refreshToken: "rtoken",
  marketplaceId: "A1F83G8C2ARO7P",
  sellerId: "SELLER1",
  endpoint: "https://sellingpartnerapi-eu.amazon.com",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function mockFetch(handlers: ((url: string, init: RequestInit) => Response | undefined)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.startsWith("https://api.amazon.com/auth/o2/token")) return json({ access_token: "atoken", expires_in: 3600 });
    for (const h of handlers) {
      const r = h(url, init);
      if (r) return r;
    }
    return json({ errors: [{ message: "unhandled" }] }, 404);
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

const noSleep = async () => {};

describe("config", () => {
  it("returns null without credentials and defaults the UK marketplace", () => {
    expect(spApiConfigFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
    const c = spApiConfigFromEnv({ SPAPI_CLIENT_ID: "a", SPAPI_CLIENT_SECRET: "b", SPAPI_REFRESH_TOKEN: "c" } as unknown as NodeJS.ProcessEnv);
    expect(c?.marketplaceId).toBe("A1F83G8C2ARO7P");
    expect(c?.endpoint).toBe("https://sellingpartnerapi-eu.amazon.com");
  });
});

describe("LWA token exchange", () => {
  it("posts the refresh token as a form and caches the access token", async () => {
    const { fn, calls } = mockFetch([]);
    const c = new SpApiClient(CFG, fn, noSleep);
    expect(await c.accessToken()).toBe("atoken");
    expect(await c.accessToken()).toBe("atoken");
    const lwa = calls.filter((x) => x.url.includes("/auth/o2/token"));
    expect(lwa).toHaveLength(1);
    const form = new URLSearchParams(String(lwa[0].init.body));
    expect(form.get("grant_type")).toBe("refresh_token");
    expect(form.get("refresh_token")).toBe("rtoken");
    expect(form.get("client_id")).toBe("cid");
    expect(form.get("client_secret")).toBe("secret");
  });

  it("throws a readable error when LWA refuses", async () => {
    const fn = vi.fn(async () => json({ error: "invalid_grant", error_description: "bad refresh token" }, 400));
    const c = new SpApiClient(CFG, fn as unknown as typeof fetch, noSleep);
    await expect(c.accessToken()).rejects.toThrow(/bad refresh token/);
  });
});

describe("request retries", () => {
  it("retries 429 then succeeds, sending the access token header", async () => {
    let n = 0;
    const { fn, calls } = mockFetch([
      (url) => (url.includes("/restrictions") ? (++n < 3 ? json({}, 429) : json({ restrictions: [] })) : undefined),
    ]);
    const c = new SpApiClient(CFG, fn, noSleep);
    const r = await c.getListingsRestrictions("B000TEST01");
    expect(r.status).toBe("open");
    const api = calls.filter((x) => x.url.includes("/restrictions"));
    expect(api).toHaveLength(3);
    expect((api[0].init.headers as Record<string, string>)["x-amz-access-token"]).toBe("atoken");
    const u = new URL(api[0].url);
    expect(u.searchParams.get("sellerId")).toBe("SELLER1");
    expect(u.searchParams.get("conditionType")).toBe("new_new");
  });

  it("does not retry a 400", async () => {
    const { fn } = mockFetch([(url) => (url.includes("/restrictions") ? json({ errors: [{ message: "Invalid ASIN" }] }, 400) : undefined)]);
    const c = new SpApiClient(CFG, fn, noSleep);
    await expect(c.getListingsRestrictions("bad")).rejects.toThrow(SpApiError);
  });
});

describe("getListingsRestrictions", () => {
  const withReasons = (reasons: unknown[]) =>
    mockFetch([(url) => (url.includes("/restrictions") ? json({ restrictions: [{ marketplaceId: CFG.marketplaceId, conditionType: "new_new", reasons }] }) : undefined)]);

  it("keeps each reason's links", async () => {
    const link = { resource: "https://sellercentral.amazon.co.uk/hz/approvalrequest/restrictions/approve?asin=B1", verb: "GET", title: "Request Approval via Seller Central.", type: "text/html" };
    const c = new SpApiClient(CFG, withReasons([{ reasonCode: "APPROVAL_REQUIRED", message: "You need approval to list this brand.", links: [link] }]).fn, noSleep);
    const r = await c.getListingsRestrictions("B1");
    expect(r.reasons[0].links).toEqual([link]);
  });

  it("maps APPROVAL_REQUIRED and NOT_ELIGIBLE", async () => {
    let c = new SpApiClient(CFG, withReasons([{ reasonCode: "APPROVAL_REQUIRED", message: "You need approval" }]).fn, noSleep);
    expect((await c.getListingsRestrictions("B1")).status).toBe("approval_required");
    c = new SpApiClient(CFG, withReasons([{ reasonCode: "NOT_ELIGIBLE", message: "Blocked" }]).fn, noSleep);
    expect((await c.getListingsRestrictions("B1")).status).toBe("blocked");
  });

  it("reports unknown without a seller id, without calling Amazon", async () => {
    const { fn, calls } = mockFetch([]);
    const c = new SpApiClient({ ...CFG, sellerId: null }, fn, noSleep);
    expect((await c.getListingsRestrictions("B1")).status).toBe("unknown");
    expect(calls).toHaveLength(0);
  });
});

describe("getMyFeesEstimate", () => {
  const feesResult = {
    Status: "Success",
    FeesEstimate: {
      TotalFeesEstimate: { CurrencyCode: "GBP", Amount: 6.54 },
      FeeDetailList: [
        { FeeType: "ReferralFee", FeeAmount: { Amount: 3.75 }, FinalFee: { Amount: 3.75 } },
        { FeeType: "VariableClosingFee", FeeAmount: { Amount: 0 }, FinalFee: { Amount: 0 } },
        { FeeType: "PerItemFee", FeeAmount: { Amount: 0 }, FinalFee: { Amount: 0 } },
        { FeeType: "FBAFees", FeeAmount: { Amount: 2.79 }, FinalFee: { Amount: 2.79 } },
      ],
    },
  };

  it("posts the price for FBA and splits referral from fulfilment", async () => {
    const { fn, calls } = mockFetch([(url) => (url.includes("/feesEstimate") ? json({ payload: { FeesEstimateResult: feesResult } }) : undefined)]);
    const c = new SpApiClient(CFG, fn, noSleep);
    const f = await c.getMyFeesEstimate("B000TEST01", 24.999);
    expect(f).toMatchObject({ ok: true, referral: 3.75, fba: 2.79, total: 6.54 });
    const call = calls.find((x) => x.url.includes("/items/B000TEST01/feesEstimate"))!;
    const body = JSON.parse(String(call.init.body));
    expect(body.FeesEstimateRequest.IsAmazonFulfilled).toBe(true);
    expect(body.FeesEstimateRequest.MarketplaceId).toBe("A1F83G8C2ARO7P");
    expect(body.FeesEstimateRequest.PriceToEstimateFees.ListingPrice).toEqual({ CurrencyCode: "GBP", Amount: 25 });
  });

  it("returns an error result for a failed estimate", async () => {
    const { fn } = mockFetch([(url) => (url.includes("/feesEstimate") ? json({ payload: { FeesEstimateResult: { Status: "ClientError", Error: { Message: "ASIN not found" } } } }) : undefined)]);
    const f = await new SpApiClient(CFG, fn, noSleep).getMyFeesEstimate("B1", 10);
    expect(f).toMatchObject({ ok: false, error: "ASIN not found" });
  });

  it("asks again when Amazon returns a ServerError result", async () => {
    let n = 0;
    const flaky = { Status: "ServerError", Error: { Type: "Receiver", Code: "InternalError", Message: "There is an internal service failure." } };
    const { fn, calls } = mockFetch([
      (url, init) => url.endsWith("/products/fees/v0/feesEstimate")
        ? json(JSON.parse(String(init.body)).map((x: { IdValue: string }) => (x.IdValue === "B2" && n++ === 0 ? flaky : feesResult)))
        : undefined,
    ]);
    const out = await new SpApiClient(CFG, fn, noSleep).getMyFeesEstimates([{ asin: "B1", price: 20 }, { asin: "B2", price: 25 }]);
    expect(out.map((x) => x.ok)).toEqual([true, true]);
    expect(out[1].asin).toBe("B2");
    expect(calls.filter((x) => x.url.endsWith("/feesEstimate"))).toHaveLength(2);
  });

  it("gives up on a ServerError after two retries", async () => {
    const flaky = { Status: "ServerError", Error: { Message: "There is an internal service failure." } };
    const { fn, calls } = mockFetch([(url) => (url.includes("/feesEstimate") ? json({ payload: { FeesEstimateResult: flaky } }) : undefined)]);
    const f = await new SpApiClient(CFG, fn, noSleep).getMyFeesEstimate("B1", 25);
    expect(f).toMatchObject({ ok: false, retryable: true });
    expect(calls.filter((x) => x.url.includes("/feesEstimate"))).toHaveLength(3);
  });

  it("batches up to 20 per call", async () => {
    const { fn, calls } = mockFetch([
      (url, init) =>
        url.endsWith("/products/fees/v0/feesEstimate")
          ? json(JSON.parse(String(init.body)).map(() => feesResult))
          : undefined,
    ]);
    const items = Array.from({ length: 25 }, (_, i) => ({ asin: `B${i}`, price: 20 }));
    const out = await new SpApiClient(CFG, fn, noSleep).getMyFeesEstimates(items);
    expect(out).toHaveLength(25);
    expect(calls.filter((x) => x.url.endsWith("/feesEstimate"))).toHaveLength(2);
  });
});

describe("catalog lookup by EAN", () => {
  const item = {
    asin: "B0CHANTE01",
    identifiers: [{ marketplaceId: "A1F83G8C2ARO7P", identifiers: [{ identifierType: "EAN", identifier: "8002910012345" }] }],
    summaries: [{ marketplaceId: "A1F83G8C2ARO7P", itemName: "Chanteclair Refill 600ml", brand: "Chanteclair", browseClassification: { displayName: "Cleaning" } }],
    dimensions: [{
      marketplaceId: "A1F83G8C2ARO7P",
      package: {
        length: { unit: "inches", value: 10 }, width: { unit: "inches", value: 4 }, height: { unit: "inches", value: 2 },
        weight: { unit: "kilograms", value: 0.65 },
      },
    }],
    salesRanks: [{ marketplaceId: "A1F83G8C2ARO7P", displayGroupRanks: [{ title: "Home & Kitchen", rank: 4321 }] }],
    relationships: [{ marketplaceId: "A1F83G8C2ARO7P", relationships: [{ type: "VARIATION", parentAsins: ["B0PARENT01"] }] }],
    attributes: { supplier_declared_dg_hz_regulation: [{ value: "ghs" }, { value: "not_applicable" }] },
  };

  /** Answers like Amazon: only items whose identifiers were asked for. */
  const catalogFor = (items: typeof item[]) => (url: string) => {
    if (!url.includes("/catalog/2022-04-01/items")) return undefined;
    const asked = new URL(url).searchParams.get("identifiers")!.split(",");
    const hits = items.filter((it) => it.identifiers[0].identifiers.some((i) => asked.some((a) => sameGtin(a, i.identifier))));
    return json({ numberOfResults: hits.length, items: hits });
  };

  it("queries by EAN and parses dimensions, rank, variation and hazmat", async () => {
    const { fn, calls } = mockFetch([catalogFor([item])]);
    const out = await new SpApiClient(CFG, fn, noSleep).catalogByEans(["08002910012345", "5000000000000"]);
    const u = new URL(calls.find((x) => x.url.includes("/catalog"))!.url);
    expect(u.searchParams.get("identifiersType")).toBe("EAN");
    expect(u.searchParams.get("identifiers")).toBe("08002910012345,5000000000000");
    const m = out.get("08002910012345")![0];
    expect(m).toMatchObject({
      asin: "B0CHANTE01",
      title: "Chanteclair Refill 600ml",
      brand: "Chanteclair",
      category: "Home & Kitchen",
      dimsCm: { l: 25.4, w: 10.2, h: 5.1 },
      weightG: 650,
      salesRank: 4321,
      parentAsin: "B0PARENT01",
      hazmat: ["ghs"],
    });
    expect(out.has("5000000000000")).toBe(false);
  });

  it("falls back to the summary's display group when there's no rank", async () => {
    const noRank = { ...item, salesRanks: [], summaries: [{ ...item.summaries[0], websiteDisplayGroupName: "Grocery" }] };
    const { fn } = mockFetch([catalogFor([noRank])]);
    const out = await new SpApiClient(CFG, fn, noSleep).catalogByEans(["8002910012345"]);
    expect(out.get("8002910012345")![0].category).toBe("Grocery");
  });

  const many = (n: number, ean: string) => Array.from({ length: n }, (_, k) => ({
    ...item, asin: `B0${ean.slice(-4)}${String(k).padStart(4, "0")}`,
    identifiers: [{ marketplaceId: "A1F83G8C2ARO7P", identifiers: [{ identifierType: "EAN", identifier: ean }] }],
  }));

  it("follows nextToken across pages of a batch", async () => {
    const pages = [many(20, "3264680023323"), many(3, "3337875598996")];
    const { fn, calls } = mockFetch([(url) => {
      if (!url.includes("/catalog/2022-04-01/items")) return undefined;
      const page = new URL(url).searchParams.get("pageToken") ? 1 : 0;
      return json({ numberOfResults: 23, items: pages[page], pagination: page === 0 ? { nextToken: "p2" } : {} });
    }]);
    const r = await new SpApiClient(CFG, fn, noSleep).lookupEans(["3264680023323", "3337875598996"]);
    expect(r.matches.get("3264680023323")).toHaveLength(20);
    expect(r.matches.get("3337875598996")).toHaveLength(3);
    expect(calls.filter((x) => x.url.includes("pageToken=p2"))).toHaveLength(1);
  });

  it("asks a truncated batch's missing EANs one at a time", async () => {
    // Amazon reports 26 results, returns 20, and gives no token: the last EAN's item is lost.
    const all = [...many(20, "3264680023323"), ...many(6, "3282770204681")];
    const { fn } = mockFetch([(url) => {
      if (!url.includes("/catalog/2022-04-01/items")) return undefined;
      const asked = new URL(url).searchParams.get("identifiers")!.split(",");
      const hits = all.filter((it) => asked.includes(it.identifiers[0].identifiers[0].identifier));
      return json({ numberOfResults: hits.length, items: hits.slice(0, 20) });
    }]);
    const r = await new SpApiClient(CFG, fn, noSleep).lookupEans(["3264680023323", "3282770204681"]);
    expect(r.matches.get("3282770204681")).toHaveLength(6);
    expect(r.traces.get("3282770204681")).toMatchObject({
      outcome: "matched",
      attempts: [{ identifiersType: "EAN", code: "batch of 2", items: 0, total: 26 }, { identifiersType: "EAN", code: "3282770204681", items: 6 }],
    });
    // The retry is batched in fives; with one EAN cut off, that's a single-code request.
  });

  it("tries UPC for 12-digit codes and records a search miss with the raw response", async () => {
    const upcItem = { ...item, asin: "B0UPC00001", identifiers: [{ marketplaceId: "A1F83G8C2ARO7P", identifiers: [{ identifierType: "UPC", identifier: "036000291452" }] }] };
    const { fn, calls } = mockFetch([(url) => {
      if (!url.includes("/catalog/2022-04-01/items")) return undefined;
      const q = new URL(url).searchParams;
      const hit = q.get("identifiersType") === "UPC" && q.get("identifiers")!.split(",").includes("036000291452");
      return json({ numberOfResults: hit ? 1 : 0, items: hit ? [upcItem] : [] });
    }]);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const r = await new SpApiClient(CFG, fn, noSleep).lookupEans(["0036000291452", "5000000000028"]);
    expect(r.matches.get("0036000291452")![0].asin).toBe("B0UPC00001");
    const types = calls.filter((x) => x.url.includes("identifiers=036000291452")).map((x) => new URL(x.url).searchParams.get("identifiersType"));
    expect(types).toEqual(["UPC"]);
    // Every pass batched: EANs, then GTIN-14s together; UPC only for the 12-digit code.
    expect(calls.filter((x) => x.url.includes("/catalog/")).map((x) => new URL(x.url).searchParams.get("identifiersType"))).toEqual(["EAN", "GTIN", "UPC"]);
    const miss = r.traces.get("5000000000028")!;
    expect(miss.outcome).toBe("search_miss");
    expect(miss.attempts.map((a) => `${a.identifiersType} ${a.code}`)).toEqual(["EAN batch of 2", "GTIN batch of 2"]);
    expect(miss.raw).toContain('"numberOfResults":0');
    expect(log).toHaveBeenCalledWith(expect.stringContaining("[catalog] 5000000000028 search_miss"));
    log.mockRestore();
  });

  it("calls it an API error, not a miss, when Amazon doesn't answer", async () => {
    const { fn } = mockFetch([(url) => (url.includes("/catalog/2022-04-01/items") ? json({ errors: [{ message: "Bad identifier" }] }, 400) : undefined)]);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const r = await new SpApiClient(CFG, fn, noSleep).lookupEans(["3264680023323"]);
    expect(r.traces.get("3264680023323")!.outcome).toBe("api_error");
    expect(r.traces.get("3264680023323")!.attempts.at(-1)!.error).toMatch(/400: Bad identifier/);
    log.mockRestore();
  });

  it("builds identifier variants from an EAN", () => {
    expect(lookupCandidates("0036000291452")).toEqual([["EAN", "0036000291452"], ["UPC", "036000291452"], ["GTIN", "00036000291452"]]);
    expect(lookupCandidates("3264680023323")).toEqual([["EAN", "3264680023323"], ["GTIN", "03264680023323"]]);
  });

  it("treats GTINs that differ by leading zeros as the same", () => {
    expect(sameGtin("08002910012345", "8002910012345")).toBe(true);
    expect(sameGtin("5000000000001", "5000000000002")).toBe(false);
  });
});

describe("getCompetitivePricing", () => {
  it("reads the new-condition Buy Box and offer count", async () => {
    const payload = [{
      ASIN: "B1", status: "Success",
      Product: {
        CompetitivePricing: {
          CompetitivePrices: [{ CompetitivePriceId: "1", condition: "New", Price: { LandedPrice: { Amount: 24.99 }, ListingPrice: { Amount: 24.99 } } }],
          NumberOfOfferListings: [{ condition: "New", Count: 5 }],
        },
        SalesRankings: [{ ProductCategoryId: "home_display_on_website", Rank: 1200 }],
      },
    }];
    const { fn } = mockFetch([(url) => (url.includes("/competitivePrice") ? json({ payload }) : undefined)]);
    const out = await new SpApiClient(CFG, fn, noSleep).getCompetitivePricing(["B1"]);
    expect(out.get("B1")).toEqual({ asin: "B1", buyBox: 24.99, newOffers: 5, salesRank: 1200 });
  });
});

describe("rate limiting", () => {
  it("runs restriction checks in parallel up to Amazon's burst, then at its rate", async () => {
    let now = 1_000_000;
    let slept = 0;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    const sleep = async (ms: number) => {
      slept += ms;
      now += ms;
    };
    const { fn } = mockFetch([(url) => (url.includes("/restrictions") ? json({ restrictions: [] }) : undefined)]);
    const c = new SpApiClient(CFG, fn, sleep);
    await Promise.all(Array.from({ length: 12 }, (_, i) => c.getListingsRestrictions(`B${i}`)));
    // Burst of 10 goes at once; the 11th and 12th wait 200 ms each at 5 per second.
    expect(slept).toBe(400);
    clock.mockRestore();
  });

  it("shares one LWA token exchange across parallel requests", async () => {
    const { fn, calls } = mockFetch([(url) => (url.includes("/restrictions") ? json({ restrictions: [] }) : undefined)]);
    const c = new SpApiClient(CFG, fn, noSleep);
    await Promise.all(Array.from({ length: 5 }, (_, i) => c.getListingsRestrictions(`B${i}`)));
    expect(calls.filter((x) => x.url.includes("/auth/o2/token"))).toHaveLength(1);
  });
});
