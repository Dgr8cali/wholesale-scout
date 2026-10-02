import { describe, expect, it } from "vitest";
import { adsDefaults, withAdsDefaults } from "./adsDefaults";

describe("private label's ads defaults", () => {
  it("launch = CPC ÷ conversion (Gate 3's, else 7%); steady = launch × 0.4", () => {
    expect(adsDefaults({}, 0.6)).toMatchObject({ adsLaunch: { value: 8.57 }, adsSteady: { value: 3.43 } });
    expect(adsDefaults({ conv: "10.1" }, 0.56).adsLaunch).toEqual({ value: 5.54, why: "CPC £0.56 ÷ conversion 10.1% (Gate 3's search conversion) = £5.54" });
    expect(adsDefaults({}, 0.6).adsLaunch.why).toMatch(/7% \(no Gate 3 conversion yet\)/);
  });

  it("fills only what you haven't typed", () => {
    expect(withAdsDefaults({ conv: "10" }, 0.5)).toMatchObject({ adsLaunch: "5", adsSteady: "2" });
    expect(withAdsDefaults({ adsLaunch: "4", conv: "10" }, 0.5)).toMatchObject({ adsLaunch: "4", adsSteady: "2" });
    expect(withAdsDefaults({}, null)).toEqual({});
  });
});
