import { describe, expect, it } from "vitest";
import { dormancy } from "./summarize";
import type { Point } from "./types";

const DAY = 86_400_000;
const now = Date.UTC(2026, 8, 25);
const at = (daysAgo: number) => now - daysAgo * DAY;

describe("dormancy from the Keepa history", () => {
  it("finds the last Buy Box in the year, when it ended, the year's rank drops and days without an offer", () => {
    const buyBox: Point[] = [[at(400), 20], [at(300), 18.5], [at(206), NaN]];
    const offerCount: Point[] = [[at(400), 3], [at(250), 1], [at(206), 0]];
    // A rank that improves (a sale) three times in the year, then stops.
    const rank: Point[] = [[at(360), 9000], [at(340), 8000], [at(300), 9500], [at(280), 7000], [at(260), 12000], [at(240), 6000], [at(206), NaN]];
    const d = dormancy({ rank, buyBox, offerCount }, now);
    expect(d.lastBuyBox12m).toBe(18.5);
    expect(d.lastBuyBoxAt).toBe(new Date(at(206)).toISOString());
    expect(d.rankDrops12m).toBe(3);
    expect(d.lastOfferDaysAgo).toBe(206);
    expect(d.avgRank12m).toBeGreaterThan(6000);
  });

  it("ignores a Buy Box that ended over a year ago, and says never for no offers at all", () => {
    const d = dormancy({ rank: [], buyBox: [[at(500), 20], [at(420), NaN]], offerCount: [] }, now);
    expect(d.lastBuyBox12m).toBeNull();
    expect(d.lastOfferDaysAgo).toBe(420);
    expect(dormancy({ rank: [], buyBox: [], offerCount: [] }, now)).toEqual({ lastBuyBox12m: null, lastBuyBoxAt: null, rankDrops12m: null, avgRank12m: null, lastOfferDaysAgo: null });
  });

  it("reports 0 days while an offer is live", () => {
    expect(dormancy({ rank: [], buyBox: [[at(10), 15]], offerCount: [[at(10), 2]] }, now).lastOfferDaysAgo).toBe(0);
  });
});
