/**
 * Private label's ads-per-unit defaults, from what an order costs in ads: CPC ÷ conversion. The CPC
 * is Settings → Ads's (£0.60 to start, then the account's trailing CPC once reports are imported);
 * the conversion is the candidate's Gate 3 search conversion (Opportunity Explorer) when it has one,
 * else 7%. Steady state is 40% of launch (ranked, most sales come organically). A value you type
 * wins. Pure.
 */
import { num, type Fields } from "./gatekeeper";

export const DEFAULT_CONVERSION_PCT = 7;
export const STEADY_SHARE = 0.4;

export interface AdsDefault { value: number; why: string }

export function adsDefaults(f: Fields, cpc: number): { adsLaunch: AdsDefault; adsSteady: AdsDefault } {
  const conv = num(f.conv);
  const pct = conv != null && conv > 0 ? conv : DEFAULT_CONVERSION_PCT;
  const launch = Math.round((cpc / (pct / 100)) * 100) / 100;
  const src = conv != null && conv > 0 ? "Gate 3's search conversion" : "7% (no Gate 3 conversion yet)";
  return {
    adsLaunch: { value: launch, why: `CPC £${cpc.toFixed(2)} ÷ conversion ${pct}% (${src}) = £${launch.toFixed(2)}` },
    adsSteady: { value: Math.round(launch * STEADY_SHARE * 100) / 100, why: `Launch £${launch.toFixed(2)} × ${STEADY_SHARE} = £${(Math.round(launch * STEADY_SHARE * 100) / 100).toFixed(2)}` },
  };
}

/** The fields with the derived ads defaults where you haven't typed a value (what the gates and score read). */
export function withAdsDefaults(f: Fields, cpc: number | null | undefined): Fields {
  if (cpc == null || !(cpc > 0)) return f;
  const d = adsDefaults(f, cpc);
  return {
    ...f,
    adsLaunch: f.adsLaunch != null && f.adsLaunch !== "" ? f.adsLaunch : String(d.adsLaunch.value),
    adsSteady: f.adsSteady != null && f.adsSteady !== "" ? f.adsSteady : String(d.adsSteady.value),
  };
}
