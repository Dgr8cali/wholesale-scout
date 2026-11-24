import "server-only";
import { accessToken, adsEnv, type AdsEnv } from "../adsapi/client";
import { decryptToken, encryptToken } from "../adsapi/crypto";
import type { ImportedDay } from "../adsapi/compare";
import { db, must, schemaMissing, selectAll } from "./db";

export interface AdsConnection { connected: boolean; profileId: string | null; profileName: string | null; profileCountry: string | null; connectedAt: string | null }
export const NOT_CONNECTED: AdsConnection = { connected: false, profileId: null, profileName: null, profileCountry: null, connectedAt: null };

interface Row { refresh_token_enc: string; profile_id: string | null; profile_name: string | null; profile_country: string | null; connected_at: string }

async function row(): Promise<Row | null> {
  const res = await db().from("ads_connection").select("*").eq("id", 1).maybeSingle();
  if (res.error) { if (schemaMissing(res.error.message)) return null; throw new Error(`read ads connection: ${res.error.message}`); }
  return (res.data as Row | null) ?? null;
}

/** Connected or not, and which profile: never the token. */
export async function connectionStatus(): Promise<AdsConnection> {
  const r = await row();
  return r ? { connected: true, profileId: r.profile_id, profileName: r.profile_name, profileCountry: r.profile_country, connectedAt: r.connected_at } : NOT_CONNECTED;
}

/** Store (or replace) the refresh token, encrypted. A new connection forgets the chosen profile. */
export async function saveRefreshToken(refreshToken: string): Promise<void> {
  const now = new Date().toISOString();
  must(await db().from("ads_connection").upsert({ id: 1, refresh_token_enc: encryptToken(refreshToken), profile_id: null, profile_name: null, profile_country: null, connected_at: now, updated_at: now }, { onConflict: "id" }), "save ads connection");
}

export async function saveProfile(p: { profileId: string; name: string; country: string }): Promise<void> {
  must(await db().from("ads_connection").update({ profile_id: p.profileId, profile_name: p.name, profile_country: p.country, updated_at: new Date().toISOString() }).eq("id", 1), "save ads profile");
}

export async function disconnect(): Promise<void> {
  must(await db().from("ads_connection").delete().eq("id", 1), "disconnect ads");
}

/** What a call to the Ads API needs: the app's credentials, a fresh access token and the chosen profile. */
export async function adsSession(): Promise<{ env: AdsEnv; token: string; profileId: string | null }> {
  const env = adsEnv();
  if (!env) throw new Error("Amazon Ads isn't set up on the server: ADS_CLIENT_ID and ADS_CLIENT_SECRET");
  const r = await row();
  if (!r) throw new Error("Amazon Ads isn't connected: press Connect in Settings → Amazon Ads");
  return { env, token: await accessToken(env, decryptToken(r.refresh_token_enc)), profileId: r.profile_id };
}

/** The daily campaign rows already imported from report files, for the days of a pull. */
export async function importedDays(from: string, to: string): Promise<ImportedDay[]> {
  const rows = await selectAll<{ date: string; impressions: number | null; clicks: number; cost: number; orders: number; sales: number; ads_campaigns: { campaign_id: string | null; name: string } | { campaign_id: string | null; name: string }[] | null }>(
    "ads_campaign_daily", "date, impressions, clicks, cost, orders, sales, ads_campaigns(campaign_id, name)", ["date", "campaign"], (q) => q.gte("date", from).lte("date", to));
  return rows.map((r) => {
    const c = Array.isArray(r.ads_campaigns) ? r.ads_campaigns[0] : r.ads_campaigns;
    return { date: r.date, campaignId: c?.campaign_id ?? null, campaignName: c?.name ?? "", impressions: Number(r.impressions ?? 0), clicks: Number(r.clicks), cost: Number(r.cost), orders: Number(r.orders), sales: Number(r.sales) };
  });
}
