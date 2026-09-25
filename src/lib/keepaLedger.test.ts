import { describe, expect, it } from "vitest";
import { addDailyTokens, tokensOnDay, ukDay } from "./keepaLedger";

describe("Keepa daily ledger", () => {
  it("uses the UK calendar day, including across midnight in summer time", () => {
    expect(ukDay(new Date("2026-09-25T22:30:00Z"))).toBe("2026-09-25");
    expect(ukDay(new Date("2026-09-25T23:30:00Z"))).toBe("2026-09-26"); // 00:30 BST
    expect(ukDay(new Date("2026-12-31T23:30:00Z"))).toBe("2026-12-31"); // GMT
  });

  it("adds to the day's total and drops days past the window", () => {
    let l = addDailyTokens(null, 9, new Date("2026-09-01T10:00:00Z"));
    l = addDailyTokens(l, 6, new Date("2026-09-25T09:00:00Z"));
    l = addDailyTokens(l, 3, new Date("2026-09-25T15:00:00Z"));
    expect(l).toEqual({ "2026-09-25": 9 });
    expect(addDailyTokens(l, 0, new Date("2026-09-25T16:00:00Z"))).toEqual({ "2026-09-25": 9 });
  });

  it("sums a day across runs", () => {
    expect(tokensOnDay([{ "2026-09-25": 9, "2026-09-24": 100 }, null, { "2026-09-25": 30 }], "2026-09-25")).toBe(39);
  });
});
