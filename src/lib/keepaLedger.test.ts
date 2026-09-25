import { describe, expect, it } from "vitest";
import { addDailyTokens, dailySpend, tokensOnDay, ukDay } from "./keepaLedger";

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

  it("counts each run's recorded total on its start day, moving later days' ledger spend to those days", () => {
    const now = new Date("2026-09-25T15:00:00Z");
    const days = dailySpend([
      // Today, before the ledger existed: its whole total counts today.
      { startedAt: "2026-09-25T08:24:00Z", tokenCost: 3927 },
      // Today, with a ledger (it matches the total): no double counting.
      { startedAt: "2026-09-25T10:34:00Z", tokenCost: 1038, keepaByDay: { "2026-09-25": 42 } },
      // Two days ago, re-screened today for 345 tokens.
      { startedAt: "2026-09-23T11:00:00Z", tokenCost: 1259, keepaByDay: { "2026-09-25": 345 } },
      // Out of the window.
      { startedAt: "2026-09-10T11:00:00Z", tokenCost: 999 },
    ], 7, now);
    expect(days.map((d) => d.day)).toEqual(["2026-09-19", "2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25"]);
    expect(days.at(-1)!.tokens).toBe(3927 + 1038 + 345);
    expect(days.find((d) => d.day === "2026-09-23")!.tokens).toBe(1259 - 345);
    expect(days.reduce((a, d) => a + d.tokens, 0)).toBe(3927 + 1038 + 1259);
  });
});
