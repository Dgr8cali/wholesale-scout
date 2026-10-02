import "server-only";
import { db, must } from "./db";

/** The Ads workspace's settings: the target ACoS (%), 30 until changed. */
export interface AdsSettings { targetAcos: number }
export const DEFAULT_ADS_SETTINGS: AdsSettings = { targetAcos: 30 };

export async function adsSettings(): Promise<AdsSettings> {
  const res = await db().from("ads_settings").select("key, value");
  if (res.error) return DEFAULT_ADS_SETTINGS; // before the migration
  const out = { ...DEFAULT_ADS_SETTINGS };
  for (const r of res.data as { key: string; value: number }[]) if (r.key in out) out[r.key as keyof AdsSettings] = Number(r.value);
  return out;
}

export async function saveAdsSettings(input: Partial<AdsSettings>): Promise<AdsSettings> {
  const v = Number(input.targetAcos);
  if (!(v > 0 && v < 100)) throw new Error("Target ACoS must be between 0 and 100%");
  must(await db().from("ads_settings").upsert({ key: "targetAcos", value: v, updated_at: new Date().toISOString() }, { onConflict: "key" }), "save ads settings");
  return adsSettings();
}
