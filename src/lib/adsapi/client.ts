/**
 * Amazon Ads API client (Europe: the UK advertiser account). Login with Amazon for auth, the
 * Europe host for the API. Server code only: it reads secrets from process.env, and no token or
 * secret ever goes into an error message, a log line or a response.
 */
import { gunzipSync } from "node:zlib";

export const LWA_AUTH_URL = "https://eu.account.amazon.com/ap/oa";
export const LWA_TOKEN_URL = "https://api.amazon.co.uk/auth/o2/token";
export const ADS_HOST = "https://advertising-api-eu.amazon.com";
export const STATE_COOKIE = "ads_oauth_state";
export const ADS_SCOPE = "advertising::campaign_management";
const DEFAULT_REDIRECT = "https://ws.dgr8cali.co.uk/api/ads/callback";

export interface AdsEnv { clientId: string; clientSecret: string; redirectUri: string }

/** ADS_CLIENT_ID / ADS_CLIENT_SECRET / ADS_REDIRECT_URI (the older ADS_LWA_* names still work). */
export function adsEnv(env: NodeJS.ProcessEnv = process.env): AdsEnv | null {
  const clientId = env.ADS_CLIENT_ID || env.ADS_LWA_CLIENT_ID;
  const clientSecret = env.ADS_CLIENT_SECRET || env.ADS_LWA_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri: env.ADS_REDIRECT_URI || DEFAULT_REDIRECT };
}

export class AdsApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

type Fetch = typeof fetch;

/** Where the Connect button sends the browser. */
export function authorizeUrl(e: AdsEnv, state: string): string {
  const q = new URLSearchParams({ client_id: e.clientId, scope: ADS_SCOPE, response_type: "code", redirect_uri: e.redirectUri, state });
  return `${LWA_AUTH_URL}?${q}`;
}

/** Token-endpoint call. Only Amazon's error code and description are ever surfaced. */
async function tokenCall(body: Record<string, string>, f: Fetch): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
  const res = await f(LWA_TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !j.access_token) throw new AdsApiError(`Amazon sign-in failed (${res.status}): ${j.error ?? "no token"}${j.error_description ? `, ${j.error_description}` : ""}`, res.status);
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_in: j.expires_in ?? 3600 };
}

export async function exchangeCode(e: AdsEnv, code: string, f: Fetch = fetch): Promise<{ refreshToken: string; accessToken: string }> {
  const t = await tokenCall({ grant_type: "authorization_code", code, redirect_uri: e.redirectUri, client_id: e.clientId, client_secret: e.clientSecret }, f);
  if (!t.refresh_token) throw new AdsApiError("Amazon didn't return a refresh token", 502);
  return { refreshToken: t.refresh_token, accessToken: t.access_token };
}

const cache = new Map<string, { token: string; until: number }>();
/** A one-hour access token for the refresh token, cached in memory (keyed by a short hash-free prefix check on the whole value). */
export async function accessToken(e: AdsEnv, refreshToken: string, f: Fetch = fetch, now = Date.now()): Promise<string> {
  const hit = cache.get(refreshToken);
  if (hit && hit.until > now + 60_000) return hit.token;
  const t = await tokenCall({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: e.clientId, client_secret: e.clientSecret }, f);
  cache.set(refreshToken, { token: t.access_token, until: now + t.expires_in * 1000 });
  return t.access_token;
}
export function forgetAccessTokens() { cache.clear(); }

async function adsFetch(e: AdsEnv, token: string, path: string, init: { method?: string; profileId?: string; contentType?: string; accept?: string; body?: unknown }, f: Fetch): Promise<Response> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, "Amazon-Advertising-API-ClientId": e.clientId };
  if (init.profileId) headers["Amazon-Advertising-API-Scope"] = init.profileId;
  if (init.contentType) headers["Content-Type"] = init.contentType;
  if (init.accept) headers.Accept = init.accept;
  return f(`${ADS_HOST}${path}`, { method: init.method ?? "GET", headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
}

async function failure(res: Response, what: string): Promise<AdsApiError> {
  const j = (await res.json().catch(() => ({}))) as { message?: string; details?: string; code?: string };
  return new AdsApiError(`${what} failed (${res.status}): ${j.message ?? j.details ?? j.code ?? "no detail"}`, res.status);
}

export interface AdsProfile { profileId: string; country: string; currency: string; timezone: string; name: string; type: string; marketplaceId: string | null }

export async function listProfiles(e: AdsEnv, token: string, f: Fetch = fetch): Promise<AdsProfile[]> {
  const res = await adsFetch(e, token, "/v2/profiles", {}, f);
  if (!res.ok) throw await failure(res, "Listing Amazon Ads profiles");
  const rows = (await res.json()) as { profileId: number | string; countryCode?: string; currencyCode?: string; timezone?: string; accountInfo?: { name?: string; type?: string; marketplaceStringId?: string } }[];
  return rows.map((p) => ({
    profileId: String(p.profileId), country: p.countryCode ?? "", currency: p.currencyCode ?? "", timezone: p.timezone ?? "",
    name: p.accountInfo?.name ?? "(unnamed)", type: p.accountInfo?.type ?? "", marketplaceId: p.accountInfo?.marketplaceStringId ?? null,
  }));
}

/** The UK profile among them (Amazon's country code for the UK is "UK"). */
export const isUk = (p: AdsProfile) => p.country === "UK" || p.country === "GB" || p.marketplaceId === "A1F83G8C2ARO7P";

export interface CampaignDay { date: string; campaignId: string; campaignName: string; impressions: number; clicks: number; cost: number; orders: number; sales: number }

/** Last 7 complete days (yesterday back), as YYYY-MM-DD. */
export function last7Days(now = new Date()): { from: string; to: string } {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const end = new Date(now); end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(now); start.setUTCDate(start.getUTCDate() - 7);
  return { from: iso(start), to: iso(end) };
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Ask for the Sponsored Products campaign report, one row per campaign per day. */
export async function createCampaignReport(e: AdsEnv, token: string, profileId: string, from: string, to: string, f: Fetch = fetch): Promise<string> {
  const res = await adsFetch(e, token, "/reporting/reports", {
    method: "POST", profileId, contentType: "application/vnd.createasyncreportrequest.v3+json",
    body: {
      name: `Wholesale Scout SP campaigns ${from} to ${to}`, startDate: from, endDate: to,
      configuration: {
        adProduct: "SPONSORED_PRODUCTS", groupBy: ["campaign"], timeUnit: "DAILY", format: "GZIP_JSON", reportTypeId: "spCampaigns",
        columns: ["date", "campaignId", "campaignName", "impressions", "clicks", "cost", "purchases7d", "sales7d"],
      },
    },
  }, f);
  if (res.status === 425) { // the same report was already requested: Amazon names it in the message
    const j = (await res.json().catch(() => ({}))) as { detail?: string; message?: string };
    const id = `${j.detail ?? ""} ${j.message ?? ""}`.match(UUID)?.[0];
    if (id) return id;
    throw new AdsApiError("Amazon says this report was already requested, but not which: try again in a minute", 425);
  }
  if (!res.ok) throw await failure(res, "Requesting the campaign report");
  const j = (await res.json()) as { reportId?: string };
  if (!j.reportId) throw new AdsApiError("Amazon didn't return a report id", 502);
  return j.reportId;
}

export type ReportState = { status: "PENDING" | "PROCESSING" } | { status: "FAILURE"; reason: string } | { status: "COMPLETED"; rows: CampaignDay[] };

/** Where the report is; once it's done, download and parse it. */
export async function campaignReport(e: AdsEnv, token: string, profileId: string, reportId: string, f: Fetch = fetch): Promise<ReportState> {
  const res = await adsFetch(e, token, `/reporting/reports/${encodeURIComponent(reportId)}`, { profileId, accept: "application/vnd.createasyncreportrequest.v3+json" }, f);
  if (!res.ok) throw await failure(res, "Checking the campaign report");
  const j = (await res.json()) as { status?: string; url?: string; failureReason?: string };
  if (j.status === "FAILURE") return { status: "FAILURE", reason: j.failureReason ?? "Amazon gave no reason" };
  if (j.status !== "COMPLETED" || !j.url) return { status: j.status === "PROCESSING" ? "PROCESSING" : "PENDING" };
  // The download link is pre-signed: no auth headers on it.
  const file = await f(j.url);
  if (!file.ok) throw new AdsApiError(`Downloading the campaign report failed (${file.status})`, file.status);
  let buf = Buffer.from(await file.arrayBuffer());
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = gunzipSync(buf);
  return { status: "COMPLETED", rows: parseCampaignRows(JSON.parse(buf.toString("utf8"))) };
}

export function parseCampaignRows(json: unknown): CampaignDay[] {
  if (!Array.isArray(json)) return [];
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return json.map((r: Record<string, unknown>) => ({
    date: String(r.date ?? ""), campaignId: String(r.campaignId ?? ""), campaignName: String(r.campaignName ?? ""),
    impressions: n(r.impressions), clicks: n(r.clicks), cost: n(r.cost), orders: n(r.purchases7d), sales: n(r.sales7d),
  })).filter((r) => r.date);
}
