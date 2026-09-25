import { describe, expect, it } from "vitest";
import { estimateEta, etaLabel } from "./eta";

const NOW = Date.UTC(2026, 8, 25, 13, 0, 0);
const keepa = (tokensLeft: number, agoMin = 0) => ({ tokensLeft, refillRate: 21, refillInMs: 30_000, at: new Date(NOW - agoMin * 60_000).toISOString() });

describe("time remaining", () => {
  it("divides the Amazon queue by this run's measured rate", () => {
    const e = estimateEta({ amazon: 300, keepa: 0 }, { amazonPerMin: 60 }, null, NOW);
    expect(e.minutes).toBe(5);
    expect(etaLabel(e)).toBe("about 5 min left");
  });

  it("adds the Keepa queue at the current balance and refill rate", () => {
    // 100 rows × 3 tokens = 300 needed; 90 in hand; 210 more at 21/min = 10 min. Plus Amazon's 2 min.
    const e = estimateEta({ amazon: 120, keepa: 100 }, { amazonPerMin: 60, keepa: keepa(90) }, null, NOW);
    expect(e.minutes).toBeCloseTo(12, 5);
    expect(etaLabel(e)).toBe("about 12 min left");
  });

  it("counts tokens refilled since Keepa last reported", () => {
    const e = estimateEta({ amazon: 0, keepa: 100 }, { amazonPerMin: 60, keepa: keepa(90, 5) }, null, NOW);
    expect(e.minutes).toBeCloseTo((300 - (90 + 105)) / 21, 5); // 5 min × 21 refilled
  });

  it("says 'under a minute' at the end", () => {
    expect(etaLabel(estimateEta({ amazon: 20, keepa: 0 }, { amazonPerMin: 60 }, null, NOW))).toBe("under a minute");
  });

  it("says when it's only waiting on Keepa's refill, and when it resumes", () => {
    const e = estimateEta({ amazon: 0, keepa: 40 }, { amazonPerMin: 60, keepa: keepa(1) }, "2026-09-25T13:04:00Z", NOW);
    expect(e.refillBound).toBe(true);
    expect(etaLabel(e, "UTC")).toBe("waiting for Keepa tokens, resumes at 13:04");
  });

  it("estimates when there's nothing measured yet, and shows hours for long runs", () => {
    expect(etaLabel(estimateEta({ amazon: 50, keepa: 0 }, null, null, NOW))).toBe("estimating time left…");
    expect(etaLabel({ minutes: 65.2, refillBound: false, resumeAt: null })).toBe("about 1 h 6 min left");
  });
});
