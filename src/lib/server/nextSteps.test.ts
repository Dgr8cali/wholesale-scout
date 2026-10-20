import { afterEach, describe, expect, it } from "vitest";
import { __setDbForTests } from "./db";
import { FakeDb } from "./fakeDb";
import { buildSteps, isHidden, milestones, nextScheduled, rankSteps, setStepState, shortName, type NextStep, type TodayFacts } from "./nextSteps";

const NOW = new Date("2026-10-20T09:00:00Z");

function facts(over: { [K in keyof TodayFacts]?: Partial<TodayFacts[K]> } = {}): TodayFacts {
  const base: TodayFacts = {
    system: { cron: { lastAt: "2026-10-20T01:00:00Z", error: null }, keepa: { available: true, tokensLeft: 1200, refillRate: 20 }, spapi: { configured: true, lastSyncAt: "2026-10-19T10:05:00Z", error: null } },
    ads: { lastBulkImport: "2026-10-18T08:00:00Z", products: [], launches: [], proposals: [] },
    stock: { missingCosts: [], reorders: [] },
    pl: { candidates: [], leads: [] },
    wholesale: { applied: [], toChase: [], shortlist: { outdated: 0, total: 0, oldest: null } },
  };
  return {
    system: { ...base.system, ...over.system }, ads: { ...base.ads, ...over.ads }, stock: { ...base.stock, ...over.stock },
    pl: { ...base.pl, ...over.pl }, wholesale: { ...base.wholesale, ...over.wholesale },
  };
}
const ids = (s: NextStep[]) => s.map((x) => x.id);
const one = (f: TodayFacts, id: string) => { const s = buildSteps(f, NOW).find((x) => x.id === id); expect(s, id).toBeDefined(); return s!; };

const BELT = { asin: "B0HM8FBX3T", title: "Dog Seat Belt for Car, 2 Pack, Adjustable Pet Safety Restraint", startDate: "2026-10-19", plan: [
  { from: "2026-10-19", title: "Weeks 1–2: harvest only", detail: "Let the campaigns gather data." },
  { from: "2026-11-02", title: "Week 3: first bid-downs", detail: "Bid-down proposals start: keywords with 10+ clicks far over target come down." },
  { from: "2026-11-16", title: "Week 5: lower the target", detail: "Lower the launch target ACoS by 5 points, to 25%." },
  { from: "2026-12-07", title: "Week 8: steady state", detail: "Switch the product's phase to steady." },
] };

describe("Next steps: nothing to do", () => {
  it("healthy, empty facts give no steps", () => {
    expect(buildSteps(facts(), NOW)).toEqual([]);
  });
});

describe("System rules", () => {
  it("a failed nightly cron comes first, with the error", () => {
    const f = facts({ system: { cron: { lastAt: "2026-10-20T01:00:00Z", error: "Qogita login refused" } }, ads: { proposals: [{ asin: null, title: null, rule: "bid_down", createdAt: "2026-10-03T00:00:00Z" }] } });
    const ranked = rankSteps(buildSteps(f, NOW), [], NOW);
    expect(ranked[0].id).toBe("system:cron");
    expect(ranked[0].why).toContain("Qogita login refused");
    expect(ranked[0].priority).toBe(0);
  });
  it("a cron that missed a night", () => {
    expect(one(facts({ system: { cron: { lastAt: "2026-10-18T03:00:00Z", error: null } } }), "system:cron").title).toBe("The nightly cron missed a night");
  });
  it("no cron recorded at all", () => {
    expect(one(facts({ system: { cron: null } }), "system:cron").title).toBe("Check the nightly cron");
  });
  it("Keepa tokens low: how many and how long to wait", () => {
    const s = one(facts({ system: { keepa: { available: true, tokensLeft: 40, refillRate: 20 } } }), "system:keepa");
    expect(s.why).toBe("40 tokens left, refilling 20 a minute. Hold big runs for about 3 minutes.");
  });
  it("Keepa not configured isn't a low-token step", () => {
    expect(ids(buildSteps(facts({ system: { keepa: { available: false, tokensLeft: null, refillRate: null } } }), NOW))).not.toContain("system:keepa");
  });
  it("SP-API: unset, failed or stale", () => {
    expect(one(facts({ system: { spapi: { configured: false, lastSyncAt: null, error: null } } }), "system:spapi").title).toBe("Reconnect SP-API");
    expect(one(facts({ system: { spapi: { configured: true, lastSyncAt: "2026-10-19T10:05:00Z", error: "403 Unauthorized" } } }), "system:spapi").why).toContain("403 Unauthorized");
    expect(one(facts({ system: { spapi: { configured: true, lastSyncAt: "2026-10-15T10:05:00Z", error: null } } }), "system:spapi").title).toBe("The Amazon sync has stopped");
  });
});

describe("Ads rules", () => {
  it("campaigns started after the last bulk import: import for that product", () => {
    const f = facts({ ads: { lastBulkImport: "2026-10-02T13:04:10Z", launches: [BELT], products: [{ asin: BELT.asin, title: BELT.title, enabled: true }] } });
    const s = one(f, "ads:import");
    expect(s.title).toBe("Import a fresh bulk file for Dog Seat Belt for Car");
    expect(s.why).toBe("Its campaigns started on 19 Oct and no bulk file has been imported since (the last one is from 2 Oct, 18 days ago). Until then the dashboard and the rules can't see them.");
    expect(s.cta.href).toBe("/ads/dashboard?import=1");
  });
  it("the import comes before the proposals it would refresh", () => {
    const f = facts({ ads: { lastBulkImport: "2026-10-02T13:04:10Z", launches: [BELT], products: [{ asin: BELT.asin, title: BELT.title, enabled: true }],
      proposals: [{ asin: "B0H9ZKYYHZ", title: "Pill box", rule: "bid_down", createdAt: "2026-10-03T22:03:41Z" }] } });
    expect(ids(rankSteps(buildSteps(f, NOW), [], NOW))).toEqual(["ads:import", "ads:proposals"]);
  });
  it("last bulk import over 7 days old", () => {
    const f = facts({ ads: { lastBulkImport: "2026-10-02T13:04:10Z", products: [{ asin: "B0H9ZKYYHZ", title: "Weekly Pill Organiser Box | 7 Day", enabled: false }] } });
    const s = one(f, "ads:import");
    expect(s.title).toBe("Import a fresh bulk file for Weekly Pill Organiser Box");
    expect(s.why).toContain("2 Oct, 18 days ago");
  });
  it("a recent import and no new launch: no import step", () => {
    const f = facts({ ads: { lastBulkImport: "2026-10-19T20:00:00Z", launches: [BELT], products: [{ asin: BELT.asin, title: BELT.title, enabled: true }] } });
    expect(ids(buildSteps(f, NOW))).not.toContain("ads:import");
  });
  it("open proposals: how many, which rules, for which product, since when", () => {
    const f = facts({ ads: { proposals: [
      { asin: "B0H9ZKYYHZ", title: "Weekly Pill Organiser Box | 7 Day", rule: "bid_down", createdAt: "2026-10-03T22:03:41Z" },
      { asin: "B0H9ZKYYHZ", title: "Weekly Pill Organiser Box | 7 Day", rule: "negative", createdAt: "2026-10-05T10:00:00Z" },
    ] } });
    const s = one(f, "ads:proposals");
    expect(s.title).toBe("Review 2 proposals");
    expect(s.why).toMatch(/^1 bid-down, 1 negative for Weekly Pill Organiser Box, waiting since 3 Oct\./);
    expect(s.cta.href).toBe("/ads/proposals?tab=review");
  });
  it("launch milestones: the week-1 review shows from day 7 until the bid changes start", () => {
    const f = (d: string) => buildSteps(facts({ ads: { launches: [BELT] } }), new Date(`${d}T09:00:00Z`)).map((s) => s.id);
    expect(f("2026-10-25")).not.toContain(`ads:milestone:${BELT.asin}:week1`);
    expect(f("2026-10-26")).toContain(`ads:milestone:${BELT.asin}:week1`);
    expect(f("2026-11-01")).toContain(`ads:milestone:${BELT.asin}:week1`);
    expect(f("2026-11-02")).toEqual(expect.arrayContaining([`ads:milestone:${BELT.asin}:bids`]));
    expect(f("2026-11-02")).not.toContain(`ads:milestone:${BELT.asin}:week1`);
  });
  it("milestones follow the plan's own dates, and the next one is the empty state's 'coming up'", () => {
    expect(milestones(BELT).map((m) => m.date)).toEqual(["2026-10-26", "2026-11-02", "2026-11-16", "2026-12-07"]);
    expect(nextScheduled(facts({ ads: { launches: [BELT] } }), NOW)).toEqual({ date: "2026-10-26", title: "Week-1 review for Dog Seat Belt for Car" });
  });
});

describe("Stock rules", () => {
  it("a purchase with no supplier price: add costs", () => {
    const f = facts({ stock: { missingCosts: [{ purchaseId: "p1", name: "Lifeproof Ceramic Coating Spray Kit - Shine, Seal", asin: "B08Y5WCL4H", supplier: "Lifeproofhome", units: 30, orderedOn: "2026-10-03", landed: 17, unitCost: null }] } });
    const s = one(f, "stock:costs");
    expect(s.title).toBe("Add costs for Lifeproof Ceramic Coating Spray Kit");
    expect(s.why).toBe("The order of 30 units from Lifeproofhome on 3 Oct has a landed cost (£17.00 a unit) but no supplier price.");
  });
  it("several orders missing costs are one step, oldest first", () => {
    const c = { supplier: null, units: 20, unitCost: null };
    const f = facts({ stock: { missingCosts: [
      { ...c, purchaseId: "a", name: "Tetra AlguMin", asin: "B000LXUWU4", orderedOn: "2026-10-08", landed: 9.1 },
      { ...c, purchaseId: "b", name: "Biotene Mouth Spray, Gentle Mint", asin: "B00IC4XC6K", orderedOn: "2026-09-30", landed: 23.5 },
    ] } });
    const s = buildSteps(f, NOW).filter((x) => x.id.startsWith("stock:costs"));
    expect(s).toHaveLength(1);
    expect(s[0].title).toBe("Add costs for Biotene Mouth Spray and 1 more product");
    expect(s[0].why).toBe("2 open orders have a landed cost but no supplier price: Biotene Mouth Spray (30 Sept, landed £23.50), Tetra AlguMin (8 Oct, landed £9.10).");
  });
  it("reorder due is high priority, soon is medium; the numbers are in the why", () => {
    const base = { name: "7-Day Pill Organiser", total: 40, perDay: 3.2, reorderPoint: 224, suggestedQty: 300, leadTimeDays: 60 };
    const f = facts({ stock: { reorders: [{ ...base, itemId: "i1", status: "due", daysToReorder: 0 }, { ...base, itemId: "i2", name: "Dog Car Seat Belt Harness", total: 120, reorderPoint: 100, status: "soon", daysToReorder: 5 }] } });
    const due = one(f, "stock:reorder:i1"), soon = one(f, "stock:reorder:i2");
    expect(due.priority).toBe(1);
    expect(due.why).toBe("40 units left, selling about 3.2 a day: at or under the reorder point of 224. Suggested order 300 units (lead time 60 days).");
    expect(soon.priority).toBe(2);
    expect(soon.why).toContain("about 5 days away");
  });
});

describe("Private label rules", () => {
  const gates = (statuses: ("pass" | "warn" | "fail" | "empty")[]) => statuses.map((status, i) => ({ n: String(i), title: `Gate title ${i}`, status }));
  const cand = { id: "c1", name: "Lens cleaning wipes", status: "researching" as const, updatedAt: "2026-10-13T15:07:17Z", verdict: { cls: "empty" as const, title: "7 of 10 scored" }, score: 15, answered: 7, nextLaunchStep: "samples_ordered", launchDone: 0 };
  it("the first gate without answers is next", () => {
    const s = one(facts({ pl: { candidates: [{ ...cand, gates: gates(["pass", "pass", "warn", "empty", "empty", "pass", "pass", "pass"]) }] } }), "pl:c1");
    expect(s.title).toBe("Finish Gate 3 (Gate title 3) for Lens cleaning wipes");
    expect(s.why).toBe("6 of 8 gates have answers and 7 of 10 score lines are in; the verdict means something once all ten are.");
    expect(s.cta.href).toBe("/pl/candidates?c=c1");
  });
  it("a failed gate: fix or drop", () => {
    const s = one(facts({ pl: { candidates: [{ ...cand, answered: 10, score: 17, gates: gates(["pass", "fail", "pass", "pass", "pass", "pass", "pass", "pass"]) }] } }), "pl:c1");
    expect(s.title).toBe("Fix or drop Lens cleaning wipes");
    expect(s.why).toBe("Gate 1 (Gate title 1) failed and it scores 17/30. A failed gate isn't overridden by the score.");
  });
  it("a passing verdict: order samples", () => {
    const s = one(facts({ pl: { candidates: [{ ...cand, verdict: { cls: "pass", title: "Order samples" }, answered: 10, score: 25, gates: gates(Array(8).fill("pass")) }] } }), "pl:c1");
    expect(s.title).toBe("Order samples for Lens cleaning wipes");
    expect(s.why).toContain("25/30");
  });
  it("in samples: the next launch checklist step", () => {
    const s = one(facts({ pl: { candidates: [{ ...cand, status: "samples", nextLaunchStep: "samples_received", launchDone: 1, gates: gates(Array(8).fill("pass")) }] } }), "pl:c1");
    expect(s.title).toBe("Chase the samples for Lens cleaning wipes");
    expect(s.why).toBe("1 launch step of 13 done; this one is next on the checklist.");
  });
  it("suppliers scoring 60+ not messaged, and messaged ones with no quote after a week", () => {
    const f = facts({ pl: { leads: [{ candidateId: "c1", candidate: "Lens cleaning wipes", toContact: 16, best: 90, awaiting: 1, oldestContacted: "2026-10-05T23:42:56Z" }] } });
    const msg = one(f, "pl:suppliers:c1");
    expect(msg.title).toBe("Message 16 suppliers for Lens cleaning wipes");
    expect(msg.why).toBe("16 Alibaba listings score 60 or more (best 90) and haven't been messaged yet.");
    expect(msg.cta.href).toBe("/pl/suppliers?candidate=c1");
    expect(one(f, "pl:chase:c1").why).toBe("Messaged on 5 Oct (15 days ago) with no quote back yet.");
  });
  it("a supplier messaged yesterday isn't chased yet", () => {
    const f = facts({ pl: { leads: [{ candidateId: "c1", candidate: "Lens", toContact: 0, best: null, awaiting: 1, oldestContacted: "2026-10-19T10:00:00Z" }] } });
    expect(buildSteps(f, NOW)).toEqual([]);
  });
});

describe("Wholesale rules", () => {
  it("brands to apply for: one at a time, the next shows once the first is dismissed", () => {
    const f = facts({ wholesale: { toChase: [
      { key: "maybelline", brand: "Maybelline", pass: 12, warn: 4, avgSellers: 6.5 },
      { key: "loreal", brand: "L'Oréal", pass: 3, warn: 1, avgSellers: null },
    ] } });
    const all = buildSteps(f, NOW);
    expect(all.find((s) => s.id === "wholesale:apply:maybelline")!.why).toBe("12 Buy products and 4 Check products are held back by brand gating, with 6.5 FBA sellers on average.");
    expect(ids(rankSteps(all, [], NOW))).toEqual(["wholesale:apply:maybelline"]);
    const dismissed = [{ step_id: "wholesale:apply:maybelline", fingerprint: "12:4", snoozed_until: null, dismissed_at: NOW.toISOString() }];
    expect(ids(rankSteps(all, dismissed, NOW))).toEqual(["wholesale:apply:loreal"]);
  });
  it("a brand with no Buy product isn't worth applying for yet", () => {
    expect(buildSteps(facts({ wholesale: { toChase: [{ key: "bihui", brand: "Bihui", pass: 0, warn: 2, avgSellers: 8 }] } }), NOW)).toEqual([]);
  });
  it("an approval applied for over a week ago: chase it", () => {
    const s = one(facts({ wholesale: { applied: [{ key: "emtrix", brand: "Emtrix", since: "2026-10-01", held: 5 }] } }), "wholesale:approval:emtrix");
    expect(s.why).toBe("You applied on 1 Oct (19 days ago) and it's still pending; 5 Buy or Check products wait on it.");
  });
  it("shortlist items needing a refresh", () => {
    const s = one(facts({ wholesale: { shortlist: { outdated: 3, total: 4, oldest: "2026-10-02T10:00:00Z" } } }), "wholesale:shortlist");
    expect(s.title).toBe("Re-screen 3 shortlisted products");
    expect(s.why).toBe("3 of 4 were last screened over a week ago (the oldest on 2 Oct); prices and sellers move.");
  });
});

describe("Ranking, Later and Done", () => {
  const f = facts({
    system: { keepa: { available: true, tokensLeft: 10, refillRate: 5 } },
    ads: { proposals: [{ asin: null, title: null, rule: "bid_down", createdAt: "2026-10-03T00:00:00Z" }], lastBulkImport: "2026-10-02T00:00:00Z", products: [{ asin: "A", title: "Pill box", enabled: true }] },
    wholesale: { shortlist: { outdated: 1, total: 1, oldest: "2026-09-01T00:00:00Z" } },
  });
  it("priority first, then the oldest", () => {
    expect(ids(rankSteps(buildSteps(f, NOW), [], NOW))).toEqual(["system:keepa", "ads:import", "ads:proposals", "wholesale:shortlist"]);
  });
  it("Later hides a step until the snooze ends", () => {
    const s = buildSteps(f, NOW).find((x) => x.id === "ads:proposals")!;
    const state = { step_id: s.id, fingerprint: s.fingerprint, snoozed_until: "2026-10-21T09:00:00Z", dismissed_at: null };
    expect(isHidden(s, state, NOW)).toBe(true);
    expect(isHidden(s, state, new Date("2026-10-21T09:00:01Z"))).toBe(false);
  });
  it("Done hides a step until its condition changes", () => {
    const s = buildSteps(f, NOW).find((x) => x.id === "ads:proposals")!;
    const state = { step_id: s.id, fingerprint: s.fingerprint, snoozed_until: null, dismissed_at: NOW.toISOString() };
    expect(isHidden(s, state, new Date("2026-12-01T00:00:00Z"))).toBe(true);
    const more = buildSteps(facts({ ads: { proposals: [...f.ads.proposals, { asin: null, title: null, rule: "harvest", createdAt: "2026-10-19T00:00:00Z" }] } }), NOW).find((x) => x.id === "ads:proposals")!;
    expect(isHidden(more, state, NOW)).toBe(false);
  });
  it("Later and Done are saved per step (FakeDb)", async () => {
    const db = new FakeDb();
    __setDbForTests(db);
    await setStepState("ads:proposals", "snooze", "1:x", NOW);
    expect(db.tables.today_step_state).toEqual([expect.objectContaining({ step_id: "ads:proposals", snoozed_until: "2026-10-21T09:00:00.000Z", dismissed_at: null })]);
    await setStepState("ads:proposals", "dismiss", "1:x", NOW);
    expect(db.tables.today_step_state).toHaveLength(1);
    expect(db.tables.today_step_state[0]).toMatchObject({ dismissed_at: NOW.toISOString(), snoozed_until: null, fingerprint: "1:x" });
  });
  afterEach(() => __setDbForTests(null));
});

describe("shortName", () => {
  it("cuts a listing title to its product name", () => {
    expect(shortName("Dog Seat Belt for Car, 2 Pack, Adjustable", "x")).toBe("Dog Seat Belt for Car");
    expect(shortName("Weekly Pill Organiser Box | 7 Day 3 Times a Day", "x")).toBe("Weekly Pill Organiser Box");
    expect(shortName(null, "B0HM8FBX3T")).toBe("B0HM8FBX3T");
  });
});
