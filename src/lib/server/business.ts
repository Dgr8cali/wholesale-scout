import "server-only";
import { withDefaults, type ProfileConfig } from "../screening/config";
import { db, must } from "./db";

/**
 * Business-wide settings (Settings → Business): VAT registration and rate, which every profit
 * figure in the app follows, and the Qogita account's region. The screening profiles carry the
 * VAT basis too (their fees.vatRegistered / vatRatePct): saving here keeps them in step.
 */
export interface BusinessSettings { vatRegistered: boolean; vatRate: number; qogitaRegion: "UK" | "EU" }
export const DEFAULT_BUSINESS: BusinessSettings = { vatRegistered: true, vatRate: 20, qogitaRegion: "UK" };

export async function businessSettings(): Promise<BusinessSettings> {
  const res = await db().from("business_settings").select("key, value");
  if (res.error) return DEFAULT_BUSINESS; // before the migration
  const m = Object.fromEntries((res.data as { key: string; value: unknown }[]).map((r) => [r.key, r.value]));
  return {
    vatRegistered: typeof m.vatRegistered === "boolean" ? m.vatRegistered : DEFAULT_BUSINESS.vatRegistered,
    vatRate: typeof m.vatRate === "number" && m.vatRate >= 0 && m.vatRate < 100 ? m.vatRate : DEFAULT_BUSINESS.vatRate,
    qogitaRegion: m.qogitaRegion === "EU" ? "EU" : "UK",
  };
}

/** A profile's config on the business's VAT basis. */
export function onBusinessBasis(config: ProfileConfig, b: BusinessSettings): ProfileConfig {
  return withDefaults({ ...config, fees: { ...config.fees, vatRegistered: b.vatRegistered, vatRatePct: b.vatRate } });
}

/**
 * Save business settings. A change of VAT basis is written into every screening profile so new
 * runs and re-screens use it; saved results change only when you Recalculate all.
 */
export async function saveBusinessSettings(patch: Partial<BusinessSettings>): Promise<{ settings: BusinessSettings; profilesUpdated: number }> {
  const d = db();
  const cur = await businessSettings();
  const next: BusinessSettings = {
    vatRegistered: typeof patch.vatRegistered === "boolean" ? patch.vatRegistered : cur.vatRegistered,
    vatRate: patch.vatRate != null && Number.isFinite(Number(patch.vatRate)) && Number(patch.vatRate) >= 0 && Number(patch.vatRate) < 100 ? Number(patch.vatRate) : cur.vatRate,
    qogitaRegion: patch.qogitaRegion === "EU" ? "EU" : patch.qogitaRegion === "UK" ? "UK" : cur.qogitaRegion,
  };
  const at = new Date().toISOString();
  must(await d.from("business_settings").upsert(Object.entries(next).map(([key, value]) => ({ key, value, updated_at: at })), { onConflict: "key" }), "save business settings");
  let profilesUpdated = 0;
  if (next.vatRegistered !== cur.vatRegistered || next.vatRate !== cur.vatRate) {
    const profiles = must(await d.from("profiles").select("id, config"), "profiles") as { id: string; config: ProfileConfig }[];
    for (const p of profiles) {
      must(await d.from("profiles").update({ config: onBusinessBasis(withDefaults(p.config), next), updated_at: at }).eq("id", p.id), "profile VAT basis");
      profilesUpdated++;
    }
  }
  return { settings: next, profilesUpdated };
}
