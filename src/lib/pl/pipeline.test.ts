import { describe, expect, it } from "vitest";
import type { Status } from "./gatekeeper";
import { advancedStage, derivedStage, gateBar, gateBarLabel, isBackward, nextAction, stageOf, statusForMove, type ActionFacts, type StageFacts } from "./pipeline";

const P: Status = "pass", W: Status = "warn", F: Status = "fail", E: Status = "empty";
const facts = (p: Partial<StageFacts> = {}): StageFacts => ({ status: "researching", stored: null, gates: [E, E, E, E, E, E, E, E], stepsDone: [], quotes: [], contacted: 0, ...p });

describe("stage derivation", () => {
  it("Research until Gates 0–3 all pass, then Validate", () => {
    expect(derivedStage(facts())).toBe("research");
    expect(derivedStage(facts({ gates: [P, P, P, W, E, E, E, E] }))).toBe("research");
    expect(derivedStage(facts({ gates: [P, P, P, P, E, E, E, E] }))).toBe("validate");
  });
  it("a quote, a messaged supplier, samples status or a sourcing step → Sourcing, whatever the gates", () => {
    // Lens cleaning wipes: Gate 1 failed, one Alibaba supplier messaged.
    expect(derivedStage(facts({ gates: [P, F, W, E, E, E, E, E], contacted: 1 }))).toBe("sourcing");
    expect(derivedStage(facts({ quotes: ["requested"] }))).toBe("sourcing");
    expect(derivedStage(facts({ quotes: ["rejected"] }))).toBe("research");
    expect(derivedStage(facts({ status: "samples" }))).toBe("sourcing");
    expect(derivedStage(facts({ stepsDone: ["po_placed"] }))).toBe("sourcing");
  });
  it("inspection to ads launched → Launch; listing live or launched → Live", () => {
    expect(derivedStage(facts({ stepsDone: ["samples_ordered", "shipped"] }))).toBe("launch");
    expect(derivedStage(facts({ stepsDone: ["ads_launched"] }))).toBe("launch");
    expect(derivedStage(facts({ stepsDone: ["listing_live"] }))).toBe("live");
    expect(derivedStage(facts({ status: "launched" }))).toBe("live");
  });
  it("where you moved it wins over the data", () => {
    expect(stageOf(facts({ stored: "research", contacted: 3 }))).toBe("research");
    expect(stageOf(facts({ stored: null, contacted: 3 }))).toBe("sourcing");
  });
  it("new evidence moves a stored column forwards, never back", () => {
    expect(advancedStage(facts({ stored: "sourcing", stepsDone: ["shipped"] }))).toBe("launch");
    expect(advancedStage(facts({ stored: "launch", contacted: 2 }))).toBeNull();
    expect(advancedStage(facts({ stored: null, stepsDone: ["shipped"] }))).toBeNull();
  });
});

describe("the move action", () => {
  it("knows a backwards move (which asks first)", () => {
    expect(isBackward("sourcing", "research")).toBe(true);
    expect(isBackward("research", "validate")).toBe(false);
    expect(isBackward("live", "live")).toBe(false);
  });
  it("keeps the status in line with the column", () => {
    expect(statusForMove("researching", "sourcing")).toBe("samples");
    expect(statusForMove("samples", "launch")).toBeNull();
    expect(statusForMove("samples", "live")).toBe("launched");
    expect(statusForMove("launched", "validate")).toBe("researching");
    expect(statusForMove("draft", "research")).toBeNull();
    expect(statusForMove("parked", "live")).toBeNull();
    expect(statusForMove("dropped", "sourcing")).toBeNull();
  });
});

describe("gate bar", () => {
  const rows = (...s: Status[]) => s.map((status) => ({ status }));
  const segs = gateBar([
    { n: "0", title: "Pre-screen", status: P, rows: rows(P, P) },
    { n: "1", title: "Find the market", status: F, rows: rows(P, F) },
    { n: "2", title: "History", status: E, rows: rows(P, E) },
    { n: "3", title: "Demand", status: E, rows: rows(E, E) },
  ]);
  it("passed, in progress (answers or a fail), not started", () => {
    expect(segs.map((s) => s.seg)).toEqual(["passed", "progress", "progress", "todo"]);
  });
  it("reads out for screen readers", () => {
    expect(gateBarLabel(segs)).toBe("1 of 4 gates passed. Gate 1 failed; Gate 2 in progress; Gate 3 not started.");
  });
});

describe("next action", () => {
  const gates = ["Pre-screen", "Find the market", "History", "Demand", "Reviews", "Keywords", "Economics", "Budget"].map((title, i) => ({ n: String(i), title, status: E }));
  const base = (p: Partial<ActionFacts> = {}): ActionFacts => ({
    stage: "research", status: "researching", verdict: { cls: E, title: "9 of 10 scored" }, score: 0, answered: 9, gates, stepsDone: [], quotes: [], chosen: null,
    leads: { toContact: 0, best: null, awaiting: 0, oldestContacted: null }, listingAsin: null, today: "2026-10-20", ...p,
  });
  it("a failed gate in research: fix or drop it", () => {
    const g = gates.map((x) => (x.n === "1" ? { ...x, status: F } : x));
    expect(nextAction(base({ gates: g }))).toMatchObject({ label: "Fix or drop Gate 1", detail: "Find the market failed · 9 of 10 score lines in", tab: "gates", gate: "1" });
  });
  it("sourcing: chase a supplier messaged over a week ago, with the gate that failed", () => {
    const g = gates.map((x) => (x.n === "1" ? { ...x, status: F } : x));
    const a = nextAction(base({ stage: "sourcing", gates: g, leads: { toContact: 16, best: 90, awaiting: 1, oldestContacted: "2026-10-05T23:42:56Z" } }));
    expect(a).toMatchObject({ label: "Chase 1 supplier", detail: "Messaged 5 Oct (15 days ago) · no quote yet · Gate 1 failed", tab: "suppliers" });
  });
  it("sourcing: message the best suppliers when none has been", () => {
    expect(nextAction(base({ stage: "sourcing", leads: { toContact: 16, best: 90, awaiting: 0, oldestContacted: null } }))?.label).toBe("Message 16 suppliers");
  });
  it("samples on the way: the supplier's price and what's awaited", () => {
    const q = { supplier: "Ningbo Ing Tiger", status: "samples ordered", unitPrice: 2.25, currency: "USD", moq: 1000 };
    const a = nextAction(base({ stage: "sourcing", stepsDone: ["samples_ordered"], quotes: [q], chosen: null }));
    expect(a).toMatchObject({ label: "Mark samples received", detail: "Ningbo Ing Tiger agreed $2.25/unit · waiting for samples", step: "samples_received", tab: "launch" });
  });
  it("a pass with every gate clear: order samples (the button ticks the step)", () => {
    expect(nextAction(base({ verdict: { cls: P, title: "Order samples" }, score: 26 }))).toMatchObject({ label: "Mark samples ordered", step: "samples_ordered" });
  });
  it("live: waiting for the first review", () => {
    expect(nextAction(base({ stage: "live", status: "launched", stepsDone: ["listing_live"], listingAsin: "B0HM8FBX3T" }))).toMatchObject({ label: "Mark first review", detail: "Selling as B0HM8FBX3T · waiting for the first review" });
  });
  it("parked: the reason; dropped: nothing", () => {
    expect(nextAction(base({ status: "parked", parkReason: "hold — focusing on belt and pill box first" }))?.detail).toBe("hold — focusing on belt and pill box first");
    expect(nextAction(base({ status: "dropped" }))).toBeNull();
  });
});
