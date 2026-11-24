import { gzipSync } from "node:zlib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { accessToken, adsEnv, authorizeUrl, campaignReport, createCampaignReport, exchangeCode, forgetAccessTokens, last7Days, listProfiles, parseCampaignRows } from "./client";
import { compareWeek } from "./compare";
import { decryptToken, encryptToken } from "./crypto";

const env = { clientId: "amzn1.app.x", clientSecret: "shh-secret-value", redirectUri: "https://ws.example/api/ads/callback" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

describe("crypto", () => {
  const e = { ADS_CLIENT_SECRET: "a-client-secret" } as unknown as NodeJS.ProcessEnv;
  it("round-trips and doesn't store plain text", () => {
    const stored = encryptToken("Atzr|refresh-token", e);
    expect(stored).not.toContain("Atzr");
    expect(decryptToken(stored, e)).toBe("Atzr|refresh-token");
    expect(encryptToken("Atzr|refresh-token", e)).not.toBe(stored); // fresh IV each time
  });
  it("won't decrypt with another key or a tampered value", () => {
    const stored = encryptToken("t", e);
    expect(() => decryptToken(stored, { ADS_CLIENT_SECRET: "other" } as unknown as NodeJS.ProcessEnv)).toThrow(/connect again/);
    expect(() => decryptToken(stored.slice(0, -2) + "xx", e)).toThrow(/connect again/);
    expect(() => encryptToken("t", {} as NodeJS.ProcessEnv)).toThrow(/ADS_CLIENT_SECRET/);
  });
  it("prefers ADS_TOKEN_KEY", () => {
    const k = { ADS_TOKEN_KEY: "k1", ADS_CLIENT_SECRET: "s" } as unknown as NodeJS.ProcessEnv;
    expect(decryptToken(encryptToken("x", k), k)).toBe("x");
    expect(() => decryptToken(encryptToken("x", k), e)).toThrow();
  });
});

describe("env and authorise URL", () => {
  it("reads ADS_* names, with the older ADS_LWA_* as fallback", () => {
    expect(adsEnv({ ADS_CLIENT_ID: "a", ADS_CLIENT_SECRET: "b", ADS_REDIRECT_URI: "https://r" } as unknown as NodeJS.ProcessEnv)).toEqual({ clientId: "a", clientSecret: "b", redirectUri: "https://r" });
    expect(adsEnv({ ADS_LWA_CLIENT_ID: "a", ADS_LWA_CLIENT_SECRET: "b" } as unknown as NodeJS.ProcessEnv)?.redirectUri).toBe("https://ws.dgr8cali.co.uk/api/ads/callback");
    expect(adsEnv({} as NodeJS.ProcessEnv)).toBeNull();
  });
  it("uses the Europe consent page and the campaign_management scope, and never the secret", () => {
    const u = new URL(authorizeUrl(env, "st4te"));
    expect(u.origin + u.pathname).toBe("https://eu.account.amazon.com/ap/oa");
    expect(u.searchParams.get("scope")).toBe("advertising::campaign_management");
    expect(u.searchParams.get("state")).toBe("st4te");
    expect(u.toString()).not.toContain("shh-secret");
  });
});

describe("tokens", () => {
  beforeEach(() => forgetAccessTokens());
  it("exchanges the code on the Europe token endpoint", async () => {
    const f = vi.fn(async () => json({ access_token: "A", refresh_token: "R", expires_in: 3600 }));
    expect(await exchangeCode(env, "the-code", f as unknown as typeof fetch)).toEqual({ refreshToken: "R", accessToken: "A" });
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("https://api.amazon.co.uk/auth/o2/token");
  });
  it("shows Amazon's error code but not the secret", async () => {
    const f = async () => json({ error: "invalid_grant", error_description: "bad code" }, 400);
    const err = await exchangeCode(env, "c", f as unknown as typeof fetch).catch((e: Error) => e);
    expect((err as Error).message).toContain("invalid_grant");
    expect((err as Error).message).not.toContain("shh-secret");
  });
  it("caches the access token", async () => {
    const f = vi.fn(async () => json({ access_token: "A", expires_in: 3600 }));
    await accessToken(env, "R1", f as unknown as typeof fetch);
    await accessToken(env, "R1", f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("API calls", () => {
  it("lists profiles from the Europe host with the client id header", async () => {
    const f = vi.fn(async () => json([{ profileId: 123, countryCode: "UK", currencyCode: "GBP", timezone: "Europe/London", accountInfo: { name: "Shop UK", type: "seller", marketplaceStringId: "A1F83G8C2ARO7P" } }]));
    const p = await listProfiles(env, "tok", f as unknown as typeof fetch);
    expect(p[0]).toMatchObject({ profileId: "123", country: "UK", name: "Shop UK" });
    const [url, init] = f.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    expect(url).toBe("https://advertising-api-eu.amazon.com/v2/profiles");
    expect(init.headers["Amazon-Advertising-API-ClientId"]).toBe(env.clientId);
  });
  it("requests a daily SP campaign report scoped to the profile", async () => {
    const f = vi.fn(async () => json({ reportId: "rep-1" }));
    expect(await createCampaignReport(env, "tok", "123", "2026-11-17", "2026-11-23", f as unknown as typeof fetch)).toBe("rep-1");
    const [, init] = f.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }];
    expect(init.headers["Amazon-Advertising-API-Scope"]).toBe("123");
    expect(JSON.parse(init.body).configuration).toMatchObject({ adProduct: "SPONSORED_PRODUCTS", reportTypeId: "spCampaigns", timeUnit: "DAILY" });
  });
  it("reuses the report Amazon says is a duplicate", async () => {
    const f = async () => json({ detail: "The Request is a duplicate of : 0f1e2d3c-1111-4222-8333-444455556666" }, 425);
    expect(await createCampaignReport(env, "t", "1", "a", "b", f as unknown as typeof fetch)).toBe("0f1e2d3c-1111-4222-8333-444455556666");
  });
  it("reports progress, and downloads the gzip file without auth headers when done", async () => {
    expect(await campaignReport(env, "t", "1", "r", (async () => json({ status: "PROCESSING" })) as unknown as typeof fetch)).toEqual({ status: "PROCESSING" });
    const rows = [{ date: "2026-11-20", campaignId: 9, campaignName: "C", impressions: 10, clicks: 2, cost: 1.5, purchases7d: 1, sales7d: 12.99 }];
    const f = vi.fn(async (url: string) => url.includes("s3") ? new Response(gzipSync(JSON.stringify(rows))) : json({ status: "COMPLETED", url: "https://s3.example/report.gz" }));
    const r = await campaignReport(env, "t", "1", "r", f as unknown as typeof fetch);
    expect(r).toEqual({ status: "COMPLETED", rows: [{ date: "2026-11-20", campaignId: "9", campaignName: "C", impressions: 10, clicks: 2, cost: 1.5, orders: 1, sales: 12.99 }] });
    expect((f.mock.calls[1] as unknown[]).length).toBe(1); // only the URL: no Authorization on the download
  });
  it("tolerates junk rows", () => { expect(parseCampaignRows({})).toEqual([]); expect(parseCampaignRows([{ clicks: "x" }])).toEqual([]); });
  it("takes the last 7 full days", () => { expect(last7Days(new Date("2026-11-24T10:00:00Z"))).toEqual({ from: "2026-11-17", to: "2026-11-23" }); });
});

describe("compareWeek", () => {
  const api = [
    { date: "2026-11-20", campaignId: "9", campaignName: "AD: B0AAA", impressions: 100, clicks: 5, cost: 4, orders: 1, sales: 20 },
    { date: "2026-11-21", campaignId: "9", campaignName: "AD: B0AAA", impressions: 50, clicks: 2, cost: 1.5, orders: 0, sales: 0 },
    { date: "2026-11-21", campaignId: "8", campaignName: "Only API", impressions: 5, clicks: 1, cost: 0.5, orders: 0, sales: 0 },
  ];
  const imported = [{ date: "2026-11-20", campaignId: null, campaignName: "ad: b0aaa", impressions: 100, clicks: 5, cost: 4, orders: 1, sales: 20 }];
  const c = compareWeek(api, imported, "2026-11-19", "2026-11-22");
  it("lists every day, null where nothing exists", () => {
    expect(c.days.map((d) => d.label)).toEqual(["2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
    expect(c.days[0]).toMatchObject({ api: null, imported: null });
    expect(c.days[1].imported?.cost).toBe(4);
    expect(c.days[2].imported).toBeNull();
  });
  it("matches campaigns by id, else by name", () => {
    const k = c.campaigns.find((r) => r.key === "9")!;
    expect(k.api?.cost).toBe(5.5);
    expect(k.imported?.cost).toBe(4);
    expect(c.campaigns.find((r) => r.key === "8")!.imported).toBeNull();
    expect(c.campaigns).toHaveLength(2);
  });
  it("has totals; imported total is null with no imports", () => {
    expect(c.apiTotal.cost).toBe(6);
    expect(compareWeek(api, [], "2026-11-19", "2026-11-22").importedTotal).toBeNull();
  });
});
