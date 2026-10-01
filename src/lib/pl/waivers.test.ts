import { describe, expect, it } from "vitest";
import { UK_RATE_CARD_2026_07 } from "../fees/rateCard";
import { checkKey, DEFAULT_SETTINGS, evaluate, type Fields, type Waiver } from "./gatekeeper";

const card = UK_RATE_CARD_2026_07;
const JULY = new Date(Date.UTC(2026, 6, 15));
const w = (gate_id: Waiver["gate_id"], check_label: string | null, reason = "because"): Waiver => ({ id: `${gate_id}:${check_label}`, gate_id, check_label, reason, created_at: "2026-10-01T00:00:00Z" });

/** Gate 0 with a £42 sell price (fails £18–35) and an avoid category; everything else passes. */
const G0: Fields = { sell: "42", landed: "8", weight: "300", dimL: "20", dimW: "15", dimH: "4", seasonal: "no", excluded: "yes", simple: "yes", differentiable: "yes" };

describe("Private label waivers", () => {
  it("counts a waived check as a pass for its gate, keeping the row's own status", () => {
    const before = evaluate(G0, "Home Products", DEFAULT_SETTINGS, card, JULY).gates[0];
    expect(before.status).toBe("fail");

    const one = evaluate(G0, "Home Products", DEFAULT_SETTINGS, card, JULY, [w("g0", "Not in an avoid category", "Compliance docs held")]);
    const g0 = one.gates[0];
    expect(g0.status).toBe("fail"); // the price still fails
    expect(g0.rows.find((r) => r.label === "Not in an avoid category")).toMatchObject({ status: "fail", waiver: { reason: "Compliance docs held" } });
    expect(one.waivedLine).toBe("1 check waived: Not in an avoid category");

    const both = evaluate(G0, "Home Products", DEFAULT_SETTINGS, card, JULY, [w("g0", "Not in an avoid category"), w("g0", "Sell price £18–35")]);
    expect(both.gates[0]).toMatchObject({ status: "pass", rawStatus: "fail" });
    expect(both.waived.map((x) => [x.label, x.status])).toEqual([["Sell price £18–35", "fail"], ["Not in an avoid category", "fail"]]);
    expect(both.waivedLine).toBe("2 checks waived: Sell price £18–35, Not in an avoid category");
  });

  it("waives a whole gate, and says so even when nothing under it fails", () => {
    const e = evaluate(G0, "Home Products", DEFAULT_SETTINGS, card, JULY, [w("g0", null), w("g4", null)]);
    expect(e.gates[0]).toMatchObject({ status: "pass", rawStatus: "fail", waiver: { check_label: null } });
    expect(e.gates[4]).toMatchObject({ status: "pass", rawStatus: "empty" });
    expect(e.waivedLine).toBe("2 checks waived: Sell price £18–35, Not in an avoid category, Gate 4 (whole gate)");
  });

  it("leaves passing checks alone and survives a threshold change", () => {
    const e = evaluate({ ...G0, excluded: "no" }, "Home Products", DEFAULT_SETTINGS, card, JULY, [w("g0", "Not in an avoid category")]);
    expect(e.waived).toEqual([]);
    expect(e.waivedLine).toBeNull();
    expect(checkKey("Sell ÷ landed ≥ 3.5×")).toBe(checkKey("Sell ÷ landed ≥ 4×"));
    expect(checkKey("Steady profit ≥ £6.00 / unit")).toBe(checkKey("Steady profit ≥ £8.50 / unit"));
    expect(checkKey("Sell price £18–35")).not.toBe(checkKey("Packed weight under 500 g"));
  });

  it("feeds the verdict's every-gate-clear rule, and never the scorecard", () => {
    const f: Fields = { ...G0, reviewsBand: "3", rankDrops: "250", rankTrend: "3", sv360: "40000", fixable: "yes", fixCostPct: "5", sixWords: "yes", longtail: "20", landed: "8", adsLaunch: "2", adsSteady: "1", units: "100", amazonBrand: "no", amazonSeller: "no", offerTrend: "steady", bbTrend: "holds", top3Share: "30" };
    const plain = evaluate(f, "Home Products", DEFAULT_SETTINGS, card, JULY);
    const waived = evaluate(f, "Home Products", DEFAULT_SETTINGS, card, JULY, plain.gates.filter((x) => x.status === "fail" || x.status === "warn").map((x) => w(x.g.id, null)));
    expect(waived.sc).toEqual(plain.sc);
    expect(waived.gates.every((x) => x.status === "pass" || x.status === "empty")).toBe(true);
    expect(plain.sc.answered).toBe(10);
    expect(plain.sc.total).toBeGreaterThanOrEqual(24);
    expect(plain.v.title).toBe("Strong score, but a gate failed");
    expect(waived.v.title).toBe("Order samples");
  });
});
