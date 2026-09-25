import { describe, expect, it, vi } from "vitest";
import { SpApiClient, SpApiError, sameGtin, spApiConfigFromEnv } from "./client";
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

  it("queries by EAN and parses dimensions, rank, variation and hazmat", async () => {
    const { fn, calls } = mockFetch([(url) => (url.includes("/catalog/2022-04-01/items") ? json({ items: [item] }) : undefined)]);
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
