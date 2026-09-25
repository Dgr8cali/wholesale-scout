import { describe, expect, it } from "vitest";
import { conditionLabel, conditionMet, suggestCondition, type SuggestFrom, type WatchFacts } from "./watch";

const r = (over: Partial<SuggestFrom> & { detail?: Record<string, string> } = {}): SuggestFrom => ({
  failed_gate: null,
  gate_outcomes: Object.entries(over.detail ?? {}).map(([gate, detail]) => ({ gate, status: gate === over.failed_gate ? "fail" : "warn", detail })),
  hurdle_price: null, landed_cost: 6, inputs: { maxLandedGbp: 8.43 }, offer: { stock: 10, cost_known: true },
  ...over,
});

describe("suggesting a flip condition from what blocked it", () => {
  it("fee miss: the Buy Box that clears the floors; with no cost, the max landed cost", () => {
    expect(suggestCondition(r({ failed_gate: "fees", hurdle_price: 24.41 }))).toEqual({ kind: "buyBox", value: 24.45 });
    expect(suggestCondition(r({ failed_gate: "fees", landed_cost: null, offer: { cost_known: false } }))).toEqual({ kind: "landed", value: 8.4 });
  });
  it("price band, approval, sellers, Amazon", () => {
    expect(suggestCondition(r({ failed_gate: "priceBand", detail: { priceBand: "Sells at £9.99, under the £12.00 floor" } }))).toEqual({ kind: "buyBox", value: 12 });
    expect(suggestCondition(r({ failed_gate: "gating" }))).toEqual({ kind: "brandApproved" });
    expect(suggestCondition(r({ failed_gate: "competition", detail: { competition: "14 sellers, over 8" } }))).toEqual({ kind: "sellers", value: 8 });
    expect(suggestCondition(r({ failed_gate: "amazonPresence" }))).toEqual({ kind: "amazonGone" });
  });
  it("a warn: approval if that's what warned; out of stock; else re-check weekly", () => {
    expect(suggestCondition(r({ detail: { gating: "Brand approval needed" }, inputs: { restriction: { status: "approval_required" } } }))).toEqual({ kind: "brandApproved" });
    expect(suggestCondition(r({ failed_gate: "demand", offer: { stock: 0 } }))).toEqual({ kind: "backInStock" });
    expect(suggestCondition(r({ failed_gate: "demand" }))).toBeNull();
    expect(conditionLabel(null)).toBe("Re-check weekly");
    expect(conditionLabel({ kind: "buyBox", value: 24.45 })).toBe("Buy Box ≥ £24.45");
  });
});

const facts = (over: Partial<WatchFacts> = {}): WatchFacts => ({
  verdict: "warn", buyBox: 22, maxLanded: 8, landed: 9, sellers: 6, hasHistory: true, amazonNow: false, amazonLastSeenDays: null,
  brandApproved: false, gatingOpen: false, stock: 0, ...over,
});

describe("checking a condition", () => {
  it("prices and counts", () => {
    expect(conditionMet({ kind: "buyBox", value: 24 }, facts())).toEqual({ met: false, detail: "Buy Box £22.00" });
    expect(conditionMet({ kind: "buyBox", value: 24 }, facts({ buyBox: 24.5 })).met).toBe(true);
    expect(conditionMet({ kind: "landed", value: 8.4 }, facts({ landed: 8.4 })).met).toBe(true);
    expect(conditionMet({ kind: "landed", value: 8.4 }, facts({ landed: null }))).toEqual({ met: false, detail: "no costed offer yet" });
    expect(conditionMet({ kind: "sellers", value: 8 }, facts({ sellers: 9 })).met).toBe(false);
  });
  it("approval, Amazon and stock", () => {
    expect(conditionMet({ kind: "brandApproved" }, facts({ brandApproved: true })).met).toBe(true);
    expect(conditionMet({ kind: "brandApproved" }, facts({ gatingOpen: true })).met).toBe(true);
    expect(conditionMet({ kind: "amazonGone" }, facts({ amazonLastSeenDays: 45 })).met).toBe(true);
    expect(conditionMet({ kind: "amazonGone" }, facts({ amazonLastSeenDays: 10 })).met).toBe(false);
    expect(conditionMet({ kind: "amazonGone" }, facts({ amazonNow: true })).met).toBe(false);
    expect(conditionMet({ kind: "amazonGone" }, facts({ hasHistory: false })).met).toBe(false);
    expect(conditionMet({ kind: "backInStock" }, facts({ stock: 24 })).met).toBe(true);
  });
});
