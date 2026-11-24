import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encryptToken } from "../adsapi/crypto";
import { forgetAccessTokens, LWA_TOKEN_URL } from "../adsapi/client";
import { advanceAdsPulls, pullStatus, requestPull } from "./adsApiPulls";
import { __setDbForTests } from "./db";
import { FakeDb } from "./fakeDb";

const ENV = { ADS_CLIENT_ID: "cid", ADS_CLIENT_SECRET: "client-secret-value", ADS_REDIRECT_URI: "https://ws.example/api/ads/callback" };
const REFRESH = "Atzr|REFRESH-SECRET-TOKEN", ACCESS = "ACCESS-TOKEN-XYZ";
const json = (b: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json", ...headers } });

/** Fixtures: what Amazon's reports contain, by the report type id the request names. */
const FILES: Record<string, unknown> = {
  spCampaigns: [
    { date: "2026-11-22", campaignId: 9, campaignName: "AD_READY: B0AAA", campaignStatus: "ENABLED", campaignBudgetAmount: 10, impressions: 100, clicks: 5, cost: 4, purchases7d: 1, sales7d: 12.99, unitsSoldClicks7d: 1 },
    { date: "2026-11-23", campaignId: 9, campaignName: "AD_READY: B0AAA", campaignStatus: "ENABLED", campaignBudgetAmount: 10, impressions: 80, clicks: 4, cost: 3, purchases7d: 0, sales7d: 0, unitsSoldClicks7d: 0 },
    { date: "2026-11-23", campaignId: 8, campaignName: "Other", impressions: 5, clicks: 1, cost: 0.5, purchases7d: 0, sales7d: 0 },
  ],
  spSearchTerm: [
    { date: "2026-11-22", campaignId: 9, adGroupId: 4, adGroupName: "G", keywordId: 77, keyword: "bin bags", matchType: "BROAD", searchTerm: "Black Bin Bags", impressions: 10, clicks: 2, cost: 1, purchases7d: 1, sales7d: 12.99, unitsSoldClicks7d: 1 },
    { date: "2026-11-23", campaignId: 9, adGroupId: 4, adGroupName: "G", keywordId: 77, keyword: "bin bags", matchType: "BROAD", searchTerm: "black bin bags", impressions: 8, clicks: 1, cost: 0.5, purchases7d: 0, sales7d: 0 },
  ],
  spTargeting: [
    { campaignId: 9, adGroupId: 4, keywordId: 77, keyword: "bin bags", keywordBid: 0.45, keywordType: "BROAD", matchType: "BROAD", targeting: "bin bags", adKeywordStatus: "ENABLED", impressions: 200, clicks: 9, cost: 5, purchases7d: 1, sales7d: 12.99 },
    { campaignId: 9, adGroupId: 4, keywordId: 88, keywordBid: 0.3, keywordType: "TARGETING_EXPRESSION", targeting: 'asin="B0BBB"', adKeywordStatus: "PAUSED", impressions: 50, clicks: 1, cost: 0.2, purchases7d: 0, sales7d: 0 },
  ],
  spAdvertisedProduct: [
    { campaignId: 9, campaignName: "AD_READY: B0AAA", adGroupId: 4, advertisedAsin: "B0AAA", advertisedSku: "SKU-1", impressions: 300, clicks: 10, cost: 6, purchases7d: 1, sales7d: 12.99 },
  ],
};

interface Call { method: string; url: string; headers: Record<string, string>; body?: { configuration: { reportTypeId: string; columns: string[] }; startDate: string; endDate: string } }
interface Behaviour {
  token?: () => Response;
  create?: (c: Call, n: number) => Response;
  status?: (reportId: string, n: number) => Response;
}
/** A mocked Amazon: the token endpoint, report creation, status and the file download. */
function amazon(b: Behaviour = {}) {
  const calls: Call[] = [];
  const kindOf = new Map<string, string>(); // report id → report type id
  let creates = 0;
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input), method = init?.method ?? "GET";
    const call: Call = { method, url, headers: (init?.headers ?? {}) as Record<string, string>, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined };
    calls.push(call);
    if (url === LWA_TOKEN_URL) return b.token?.() ?? json({ access_token: ACCESS, expires_in: 3600 });
    if (method === "POST" && url.endsWith("/reporting/reports")) {
      const res = b.create?.(call, creates++);
      if (res) return res;
      const id = `rep-${call.body!.configuration.reportTypeId}`;
      kindOf.set(id, call.body!.configuration.reportTypeId);
      return json({ reportId: id, status: "PENDING" });
    }
    const m = url.match(/\/reporting\/reports\/([^/?]+)$/);
    if (m) {
      const n = calls.filter((c) => c.url === url).length - 1;
      return b.status?.(m[1], n) ?? json({ status: "COMPLETED", url: `https://s3.example/${m[1]}` });
    }
    if (url.startsWith("https://s3.example/")) return new Response(gzipSync(JSON.stringify(FILES[url.split("/").pop()!.replace("rep-", "")])));
    throw new Error(`unexpected request ${method} ${url}`);
  }) as unknown as typeof fetch;
  return { f, calls, creates: () => calls.filter((c) => c.method === "POST" && c.url.endsWith("/reporting/reports")), statusCalls: () => calls.filter((c) => /\/reporting\/reports\/[^/]+$/.test(c.url)) };
}

const EARLY = new Date("2026-11-24T05:00:00Z"); // before 06:30 UK: the daily pull doesn't start by itself
const min = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);
let db: FakeDb;

beforeEach(() => {
  Object.assign(process.env, ENV);
  forgetAccessTokens();
  db = new FakeDb();
  __setDbForTests(db);
  db.tables.ads_connection = [{ id: 1, refresh_token_enc: encryptToken(REFRESH), profile_id: "123", profile_name: "Shop UK", profile_country: "UK", connected_at: "2026-11-24T00:00:00Z", needs_reconnect: false, reconnect_reason: null, last_error: null, next_daily_attempt_at: null }];
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { for (const k of Object.keys(ENV)) delete process.env[k]; vi.restoreAllMocks(); });

const reports = () => db.tables.ads_api_reports ?? [];
const conn = () => db.tables.ads_connection[0];

describe("asking Amazon for the reports", () => {
  it("records one pending report per type with its dates, scoped to the profile, and returns at once", async () => {
    const a = amazon();
    const res = await requestPull("manual", { f: a.f, now: EARLY });
    expect(res.requested.map((r) => r.kind)).toEqual(["campaigns", "search_terms", "targeting", "advertised_products"]);
    expect(reports()).toHaveLength(4);
    expect(reports().every((r) => r.status === "pending" && r.profile_id === "123" && r.trigger === "manual")).toBe(true);
    expect(reports().find((r) => r.report_type === "campaigns")).toMatchObject({ date_from: "2026-11-17", date_to: "2026-11-23", amazon_report_id: "rep-spCampaigns" });
    expect(reports().find((r) => r.report_type === "targeting")).toMatchObject({ date_from: "2026-10-25", date_to: "2026-11-23" }); // 30 days
    const c = a.creates()[0];
    expect(c.headers["Amazon-Advertising-API-Scope"]).toBe("123");
    expect(c.headers["Amazon-Advertising-API-ClientId"]).toBe("cid");
    expect(a.statusCalls()).toHaveLength(0); // nothing waits for Amazon
  });

  it("a backfill asks for the last 30 days of each type", async () => {
    const a = amazon();
    await requestPull("backfill", { f: a.f, now: EARLY });
    expect(reports().map((r) => [r.date_from, r.date_to])).toEqual(Array(4).fill(["2026-10-25", "2026-11-23"]));
  });

  it("never runs two pulls for the same dates and type at once", async () => {
    const a = amazon();
    await requestPull("manual", { f: a.f, now: EARLY });
    const again = await requestPull("manual", { f: a.f, now: EARLY });
    expect(again.requested).toEqual([]);
    expect(again.skipped.map((s) => s.reason)).toEqual(Array(4).fill("already being fetched"));
    expect(a.creates()).toHaveLength(4);
    expect(reports()).toHaveLength(4);
  });

  it("reuses the report Amazon says is a duplicate instead of failing", async () => {
    const a = amazon({ create: (c) => c.body!.configuration.reportTypeId === "spCampaigns" ? json({ detail: "The Request is a duplicate of : 0f1e2d3c-1111-4222-8333-444455556666" }, 425) : (undefined as never) });
    await requestPull("manual", { f: a.f, now: EARLY, kinds: ["campaigns"] });
    expect(reports()[0]).toMatchObject({ amazon_report_id: "0f1e2d3c-1111-4222-8333-444455556666", status: "pending" });
  });

  it("when Amazon rejects a column name, asks again with the core columns", async () => {
    const a = amazon({ create: (c, n) => n === 0 ? json({ message: "Invalid column: campaignBudgetAmount" }, 400) : (undefined as never) });
    await requestPull("manual", { f: a.f, now: EARLY, kinds: ["campaigns"] });
    expect(a.creates()).toHaveLength(2);
    expect(a.creates()[0].body!.configuration.columns).toContain("campaignBudgetAmount");
    expect(a.creates()[1].body!.configuration.columns).not.toContain("campaignBudgetAmount");
    expect(reports()[0].status).toBe("pending");
  });

  it("records a refusal for good (the core columns too) as failed, with Amazon's reason, and goes on", async () => {
    const a = amazon({ create: (c) => c.body!.configuration.reportTypeId === "spSearchTerm" ? json({ message: "Profile not allowed" }, 400) : (undefined as never) });
    const res = await requestPull("manual", { f: a.f, now: EARLY });
    expect(res.requested.map((r) => r.kind)).toEqual(["campaigns", "targeting", "advertised_products"]);
    expect(reports().find((r) => r.report_type === "search_terms")).toMatchObject({ status: "failed", failure_reason: expect.stringContaining("Profile not allowed") });
  });

  it("stops at a 429 (Retry-After kept) or a 5xx, records nothing for that type, and says so", async () => {
    const a = amazon({ create: (c, n) => n === 1 ? json({ message: "Too many requests" }, 429, { "retry-after": "90" }) : (undefined as never) });
    const res = await requestPull("manual", { f: a.f, now: EARLY });
    expect(res.requested.map((r) => r.kind)).toEqual(["campaigns"]);
    expect(res.error).toContain("429");
    expect(res.retryAfterS).toBe(90);
    expect(reports()).toHaveLength(1);
    const b = amazon({ create: () => json({ message: "boom" }, 503) });
    expect((await requestPull("manual", { f: b.f, now: EARLY, kinds: ["targeting"] })).error).toContain("503");
  });
});

describe("the background job", () => {
  it("leaves a report alone until it's due, then checks it and backs off while Amazon is still building it", async () => {
    const a = amazon({ status: () => json({ status: "PROCESSING" }) });
    await requestPull("manual", { f: a.f, now: EARLY, kinds: ["campaigns"] });
    await advanceAdsPulls({ f: a.f, now: min(EARLY, 0.2) }); // 12 s: not due
    expect(a.statusCalls()).toHaveLength(0);
    await advanceAdsPulls({ f: a.f, now: min(EARLY, 1) });
    expect(a.statusCalls()).toHaveLength(1);
    expect(reports()[0]).toMatchObject({ status: "pending", amazon_status: "PROCESSING", attempts: 1 });
    // The next check is after the backoff, 30 s then 60 s then more.
    expect(Date.parse(reports()[0].next_check_at as string) - min(EARLY, 1).getTime()).toBe(30_000);
    await advanceAdsPulls({ f: a.f, now: min(EARLY, 2) });
    await advanceAdsPulls({ f: a.f, now: min(EARLY, 4) });
    expect(Date.parse(reports()[0].next_check_at as string) - min(EARLY, 4).getTime()).toBe(60_000);
  });

  it("downloads and stores a finished report once, whatever happens to the page, and marks it imported with counts", async () => {
    const a = amazon();
    await requestPull("manual", { f: a.f, now: EARLY, kinds: ["campaigns"] });
    const out = await advanceAdsPulls({ f: a.f, now: min(EARLY, 1) });
    expect(out.polled).toEqual({ imported: 1 });
    expect(reports()[0]).toMatchObject({ status: "imported", rows_added: 3, rows_updated: 0, amazon_status: "COMPLETED" });
    const days = db.tables.ads_campaign_daily;
    expect(days).toHaveLength(3);
    expect(days.every((r) => r.source === "api")).toBe(true);
    expect(days.find((r) => r.date === "2026-11-22")).toMatchObject({ clicks: 5, cost: 4, orders: 1, sales: 12.99, units: 1 });
    // No second look at a report that's done.
    await advanceAdsPulls({ f: a.f, now: min(EARLY, 5) });
    expect(a.statusCalls()).toHaveLength(1);
    expect(a.calls.filter((c) => c.url.startsWith("https://s3")).every((c) => !c.headers.Authorization)).toBe(true); // the download carries no credentials
  });

  it("a re-pull replaces the API's rows instead of doubling them, and never touches an imported row", async () => {
    db.tables.ads_campaigns = [{ id: "camp-9", campaign_id: "9", name: "AD_READY: B0AAA", asin: "B0AAA", asin_source: "name" }];
    db.tables.ads_campaign_daily = [{ campaign: "camp-9", date: "2026-11-22", impressions: 90, clicks: 4, cost: 3.5, orders: 1, sales: 12, units: 1, source: "import", import_id: "imp-1" }];
    const a = amazon();
    await requestPull("manual", { f: a.f, now: EARLY, kinds: ["campaigns"] });
    await advanceAdsPulls({ f: a.f, now: min(EARLY, 1) });
    expect(db.tables.ads_campaign_daily).toHaveLength(4); // 3 API rows + the imported one, side by side
    expect(db.tables.ads_campaign_daily.find((r) => r.source === "import")).toMatchObject({ clicks: 4, cost: 3.5, import_id: "imp-1" });
    // Again, as the daily refresh would: same days replaced, not added.
    await requestPull("daily", { f: a.f, now: min(EARLY, 10), kinds: ["campaigns"] });
    await advanceAdsPulls({ f: a.f, now: min(EARLY, 12) });
    expect(db.tables.ads_campaign_daily).toHaveLength(4);
    const second = reports().filter((r) => r.status === "imported").at(-1)!;
    expect(second).toMatchObject({ rows_added: 0, rows_updated: 3 });
  });

  it("stores search terms per day, keywords with their bids, product targets and advertised products in the import tables", async () => {
    db.tables.ads_keywords = [{ keyword_id: "77", campaign: "x", ad_group_id: "4", keyword_text: "bin bags", match_type: "Broad", bid: 0.4, state: "enabled", source: "import" }];
    const a = amazon();
    await requestPull("manual", { f: a.f, now: EARLY });
    await advanceAdsPulls({ f: a.f, now: min(EARLY, 1) });
    await advanceAdsPulls({ f: a.f, now: min(EARLY, 2) });
    expect(reports().map((r) => r.status)).toEqual(Array(4).fill("imported"));
    const terms = db.tables.ads_search_terms;
    expect(terms).toHaveLength(2); // one row per day: "Black Bin Bags" and "black bin bags" are the same term
    expect(terms[0]).toMatchObject({ term: "black bin bags", keyword_id: "77", keyword_text: "bin bags", match_type: "Broad", ad_group_id: "4", source: "api", date_from: "2026-11-22", date_to: "2026-11-22" });
    const kw = db.tables.ads_keywords.find((k) => k.keyword_id === "77")!;
    expect(kw).toMatchObject({ bid: 0.45, state: "enabled", match_type: "Broad", clicks: 9, source: "api", date_from: "2026-10-25", date_to: "2026-11-23" });
    expect(db.tables.ads_keyword_ranges).toEqual([expect.objectContaining({ keyword_id: "77", date_from: "2026-10-25", date_to: "2026-11-23" })]);
    expect(db.tables.ads_product_targets[0]).toMatchObject({ target_id: "88", expression: 'asin="B0BBB"', bid: 0.3, state: "paused", source: "api" });
    expect(db.tables.ads_product_ads[0]).toMatchObject({ ad_id: "api:4:B0AAA:SKU-1", asin: "B0AAA", sku: "SKU-1", source: "api" });
    expect(db.tables.ads_campaigns.find((c) => c.campaign_id === "9")).toMatchObject({ asin: "B0AAA", asin_source: "product_ad" });
    // The imports it made are listed as the API's.
    expect(db.tables.ads_imports.map((i) => i.report_type).sort()).toEqual(["api_campaign_daily", "api_products", "api_search_terms", "api_targeting"]);
  });

  it("a missing bid or state never blanks one that's stored", async () => {
    db.tables.ads_keywords = [{ keyword_id: "77", campaign: "x", ad_group_id: "4", keyword_text: "bin bags", match_type: "Broad", bid: 0.4, state: "enabled", source: "import" }];
    const a = amazon();
    FILES.spTargeting = [{ campaignId: 9, adGroupId: 4, keywordId: 77, keyword: "bin bags", keywordType: "BROAD", matchType: "BROAD", clicks: 1, cost: 1 }];
    try {
      await requestPull("manual", { f: a.f, now: EARLY, kinds: ["targeting"] });
      await advanceAdsPulls({ f: a.f, now: min(EARLY, 1) });
    } finally { FILES.spTargeting = [{ campaignId: 9, adGroupId: 4, keywordId: 77, keyword: "bin bags", keywordBid: 0.45, keywordType: "BROAD", matchType: "BROAD", targeting: "bin bags", adKeywordStatus: "ENABLED", impressions: 200, clicks: 9, cost: 5, purchases7d: 1, sales7d: 12.99 }, { campaignId: 9, adGroupId: 4, keywordId: 88, keywordBid: 0.3, keywordType: "TARGETING_EXPRESSION", targeting: 'asin="B0BBB"', adKeywordStatus: "PAUSED", impressions: 50, clicks: 1, cost: 0.2, purchases7d: 0, sales7d: 0 }]; }
    expect(db.tables.ads_keywords.find((k) => k.keyword_id === "77")).toMatchObject({ bid: 0.4, state: "enabled", clicks: 1 });
  });

  it("marks a report Amazon failed with Amazon's reason", async () => {
    const a = amazon({ status: () => json({ status: "FAILURE", failureReason: "Report date range exceeds the limit" }) });
    await requestPull("manual", { f: a.f, now: EARLY, kinds: ["campaigns"] });
    await advanceAdsPulls({ f: a.f, now: min(EARLY, 1) });
    expect(reports()[0]).toMatchObject({ status: "failed", failure_reason: "Report date range exceeds the limit" });
    expect(db.tables.ads_campaign_daily ?? []).toHaveLength(0);
  });

  it("gives up on a report Amazon hasn't finished in 2 hours", async () => {
    const a = amazon({ status: () => json({ status: "PROCESSING" }) });
    await requestPull("manual", { f: a.f, now: EARLY, kinds: ["campaigns"] });
    await advanceAdsPulls({ f: a.f, now: min(EARLY, 119) });
    expect(reports()[0].status).toBe("pending");
    await advanceAdsPulls({ f: a.f, now: min(EARLY, 121) });
    expect(reports()[0]).toMatchObject({ status: "failed", failure_reason: expect.stringContaining("2 hours") });
  });

  it("keeps a report through a 429 or a 5xx while checking, and waits at least Retry-After", async () => {
    let n = 0;
    const a = amazon({ status: () => (n++ === 0 ? json({ message: "slow down" }, 429, { "retry-after": "240" }) : n === 2 ? json({ message: "oops" }, 502) : json({ status: "PROCESSING" })) });
    await requestPull("manual", { f: a.f, now: EARLY, kinds: ["campaigns"] });
    await advanceAdsPulls({ f: a.f, now: min(EARLY, 1) });
    expect(reports()[0]).toMatchObject({ status: "pending", attempts: 1 });
    expect(Date.parse(reports()[0].next_check_at as string) - min(EARLY, 1).getTime()).toBe(240_000);
    await advanceAdsPulls({ f: a.f, now: min(EARLY, 6) });
    expect(reports()[0]).toMatchObject({ status: "pending", attempts: 2 });
    expect(conn().needs_reconnect).toBe(false);
  });

  it("two ticks at once don't both work on one report", async () => {
    const a = amazon({ status: () => json({ status: "PROCESSING" }) });
    await requestPull("manual", { f: a.f, now: EARLY, kinds: ["campaigns"] });
    await Promise.all([advanceAdsPulls({ f: a.f, now: min(EARLY, 1) }), advanceAdsPulls({ f: a.f, now: min(EARLY, 1) })]);
    expect(a.statusCalls()).toHaveLength(1);
  });
});

describe("a rejected token", () => {
  const rejected = () => json({ error: "invalid_grant", error_description: "The refresh token is expired or revoked" }, 400);
  it("stops the schedule and marks the connection as needing a reconnect (while polling)", async () => {
    const ok = amazon();
    await requestPull("manual", { f: ok.f, now: EARLY, kinds: ["campaigns"] });
    forgetAccessTokens();
    const bad = amazon({ token: rejected });
    const out = await advanceAdsPulls({ f: bad.f, now: min(EARLY, 1) });
    expect(out.polled).toEqual({ reconnect: 1 });
    expect(conn()).toMatchObject({ needs_reconnect: true, reconnect_reason: expect.stringContaining("invalid_grant") });
    expect(reports()[0].status).toBe("pending"); // kept: it's still asked about after a reconnect
    const calls = bad.calls.length;
    expect(await advanceAdsPulls({ f: bad.f, now: min(EARLY, 20) })).toMatchObject({ state: "needs reconnect" });
    expect(bad.calls.length).toBe(calls); // nothing more is sent to Amazon
    await expect(requestPull("manual", { f: bad.f, now: EARLY })).rejects.toThrow(/needs reconnecting/);
    expect((await pullStatus({ now: EARLY })).nextRun).toBeNull();
    expect((await pullStatus({ now: EARLY })).connection).toMatchObject({ needsReconnect: true });
  });

  it("also when it's rejected while asking, and a 401 from the API counts too", async () => {
    const a = amazon({ token: rejected });
    await expect(requestPull("manual", { f: a.f, now: EARLY })).rejects.toThrow(/invalid_grant/);
    expect(conn().needs_reconnect).toBe(true);
    conn().needs_reconnect = false; forgetAccessTokens();
    const b = amazon({ create: () => json({ message: "Unauthorized" }, 401) });
    const res = await requestPull("manual", { f: b.f, now: EARLY, kinds: ["campaigns"] });
    expect(res.error).toContain("401");
    expect(conn().needs_reconnect).toBe(true);
  });
});

describe("the daily pull", () => {
  it("starts from 06:30 UK time, once a day, for every type", async () => {
    const a = amazon();
    await advanceAdsPulls({ f: a.f, now: new Date("2026-11-24T06:29:00Z") });
    expect(a.creates()).toHaveLength(0);
    const out = await advanceAdsPulls({ f: a.f, now: new Date("2026-11-24T06:31:00Z") });
    expect(out.started?.requested).toHaveLength(4);
    expect(reports().every((r) => r.trigger === "daily")).toBe(true);
    expect(reports().find((r) => r.report_type === "campaigns")).toMatchObject({ date_from: "2026-11-17", date_to: "2026-11-23" });
    await advanceAdsPulls({ f: a.f, now: new Date("2026-11-24T09:00:00Z") });
    expect(a.creates()).toHaveLength(4); // not again the same day
    await advanceAdsPulls({ f: a.f, now: new Date("2026-11-25T06:35:00Z") });
    expect(a.creates()).toHaveLength(8); // tomorrow's
  });

  it("follows UK time through summer time", async () => {
    const a = amazon();
    await advanceAdsPulls({ f: a.f, now: new Date("2026-07-10T05:29:00Z") }); // 06:29 BST
    expect(a.creates()).toHaveLength(0);
    await advanceAdsPulls({ f: a.f, now: new Date("2026-07-10T05:31:00Z") });
    expect(a.creates()).toHaveLength(4);
  });

  it("after Amazon asks us to slow down, waits and then asks for the types still missing, not the ones it has", async () => {
    let n = 0;
    const a = amazon({ create: () => (n++ === 2 ? json({ message: "Too many requests" }, 429, { "retry-after": "120" }) : (undefined as never)) });
    const t0 = new Date("2026-11-24T06:31:00Z");
    const first = await advanceAdsPulls({ f: a.f, now: t0 });
    expect(first.started?.requested.map((r) => r.kind)).toEqual(["campaigns", "search_terms"]);
    expect(conn()).toMatchObject({ last_error: expect.stringContaining("429") });
    expect(Date.parse(conn().next_daily_attempt_at as string) - t0.getTime()).toBe(120_000); // Amazon's Retry-After
    const before = a.creates().length;
    await advanceAdsPulls({ f: a.f, now: min(t0, 1) });
    expect(a.creates().length).toBe(before); // too soon
    const later = await advanceAdsPulls({ f: a.f, now: min(t0, 3) });
    expect(later.started?.requested.map((r) => r.kind)).toEqual(["targeting", "advertised_products"]);
    expect(conn().last_error).toBeNull();
  });

  it("does nothing when not connected or no profile is chosen", async () => {
    db.tables.ads_connection[0].profile_id = null;
    const a = amazon();
    expect(await advanceAdsPulls({ f: a.f, now: new Date("2026-11-24T07:00:00Z") })).toMatchObject({ state: "not connected" });
    db.tables.ads_connection = [];
    expect(await advanceAdsPulls({ f: a.f, now: new Date("2026-11-24T07:00:00Z") })).toMatchObject({ state: "not connected" });
    expect(a.calls).toHaveLength(0);
  });
});

describe("status for Settings", () => {
  it("reports the last success, pending and failed reports, the next run and which source the app uses", async () => {
    db.tables.ads_campaigns = [{ id: "camp-9", campaign_id: "9", name: "AD_READY: B0AAA", asin: null, asin_source: null }];
    db.tables.ads_campaign_daily = [{ campaign: "camp-9", date: "2026-11-23", clicks: 1, cost: 1, orders: 0, sales: 0, source: "import" }, { campaign: "camp-9", date: "2026-11-01", clicks: 1, cost: 1, orders: 0, sales: 0, source: "import" }];
    const a = amazon({ create: (c) => c.body!.configuration.reportTypeId === "spSearchTerm" ? json({ message: "Not allowed" }, 400) : (undefined as never), status: (id) => (id === "rep-spTargeting" ? json({ status: "PROCESSING" }) : (undefined as never)) });
    await requestPull("daily", { f: a.f, now: new Date("2026-11-24T06:31:00Z") });
    await advanceAdsPulls({ f: a.f, now: new Date("2026-11-24T06:33:00Z") });
    const st = await pullStatus({ now: new Date("2026-11-24T06:40:00Z") });
    expect(st.lastSuccess).toMatchObject({ rowsAdded: expect.any(Number) });
    expect(st.lastSuccess!.reports.map((r) => r.kind).sort()).toEqual(["advertised_products", "campaigns"]);
    expect(st.pending.map((p) => p.report_type)).toEqual(["targeting"]);
    expect(st.failed).toEqual([expect.objectContaining({ kind: "search_terms", reason: expect.stringContaining("Not allowed") })]);
    expect(st.nextRun).toBe("2026-11-25T06:30:00.000Z");
    expect(st.source).toMatchObject({ api: { days: 2 }, import: { days: 2 }, overlapDays: 1 });
  });
});

describe("secrets", () => {
  it("no token or secret reaches the database, a recorded reason or the log", async () => {
    const a = amazon({ create: (c) => c.body!.configuration.reportTypeId === "spSearchTerm" ? json({ message: `bad request for ${ACCESS} ${REFRESH}` }, 400) : (undefined as never) });
    await requestPull("manual", { f: a.f, now: EARLY });
    await advanceAdsPulls({ f: a.f, now: min(EARLY, 1) });
    const all = JSON.stringify(db.tables.ads_api_reports) + JSON.stringify(db.tables.ads_connection.map((c) => ({ ...c, refresh_token_enc: undefined })));
    for (const secret of [REFRESH, ACCESS, ENV.ADS_CLIENT_SECRET, "REFRESH-SECRET-TOKEN"]) expect(all).not.toContain(secret);
    expect(JSON.stringify(db.tables.ads_connection[0].refresh_token_enc)).not.toContain("REFRESH-SECRET-TOKEN"); // encrypted at rest
    expect(JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls)).not.toContain(ACCESS);
  });
});
