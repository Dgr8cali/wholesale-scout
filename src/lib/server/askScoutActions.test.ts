/**
 * Ask Scout's actions, one test per rule: Scout only proposes (proposing writes nothing); only the
 * allowlist, checked again on Confirm; never the forbidden kinds, even if asked; each proposal says
 * what changes on which record; Confirm runs once, is logged with who and when, and Undo puts it back;
 * a request outside the allowlist gets a "can't" with the page to do it on.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __setAnthropicForTests } from "./adsAi";
import { askScout, cleanAnswer, withRefusal } from "./askScout";
import {
  ACTION_TYPES, PROPOSE_TOOL, confirmAction, declineAction, neverAllowed, resolveAction, undoAction, type ProposedAction, type Who,
} from "./askScoutActions";
import { __setDbForTests, activeRateCard } from "./db";
import { FakeDb } from "./fakeDb";
import { todaySteps } from "./nextSteps";

const NOW = new Date("2026-10-20T09:00:00Z");
const WHO: Who = { actor: "akin", ip: "203.0.113.5", user_agent: "test" };
const PROPOSAL = "11111111-1111-4111-8111-111111111111";
const LEAD = "22222222-2222-4222-8222-222222222222";
const CAND = "aed5a06e-1715-4197-9812-29aef4303174";
const RUN = "33333333-3333-4333-8333-333333333333";
const WRITES = ["insert", "upsert", "update", "delete"] as const;

/** A FakeDb that records every write. */
function recordingDb() {
  const db = new FakeDb();
  const writes: string[] = [];
  const from = db.from.bind(db);
  db.from = (table: string) => {
    const b = from(table) as unknown as Record<string, (...a: unknown[]) => unknown>;
    for (const w of WRITES) { const orig = b[w].bind(b); b[w] = (...a: unknown[]) => { writes.push(`${w} ${table}`); return orig(...a); }; }
    return b as never;
  };
  return { db, writes };
}

describe("Ask Scout actions", () => {
  let rec: ReturnType<typeof recordingDb>;
  let t: FakeDb["tables"];
  beforeEach(async () => {
    rec = recordingDb();
    __setDbForTests(rec.db);
    await activeRateCard();
    t = rec.db.tables;
    t.ads_proposals = [{ id: PROPOSAL, asin: "B0HM8FBX3T", rule: "bid_down", campaign_name: "Seat belt Auto", entity: { label: "close-match" }, current_value: "£0.45", proposed_value: "£0.36", reason: "12 clicks, no order", confidence: "medium", clicks: 12, orders: 0, status: "open", hold_until: null, decided_at: null, created_at: "2026-10-03T00:00:00Z" }];
    t.pl_candidates = [{ id: CAND, name: "Lens cleaning wipes", niche_keyword: "lens wipes", category: "Everything else", status: "samples", next_action_note: null, created_at: "2026-10-01", updated_at: "2026-10-13" }];
    t.pl_supplier_leads = [{ id: LEAD, candidate_id: CAND, supplier_name: "Xiamen Shinning", title: "Lens wipes", score: 69.5, status: "new", reject_reason: null, flags: [], updated_at: "2026-10-05T23:42:56Z", listing_url: "u" }];
    t.products = [{ id: "p1", ean: "5012345678900", asin: "B0PRODUCT1", title: "Muscle rub 100 ml", created_at: "2026-10-10T00:00:00Z" }];
    t.favourites = [];
    t.today_step_state = [];
    t.ask_scout_history = [];
    t.ask_scout_actions = [];
    rec.writes.length = 0;
  });
  afterEach(() => { __setDbForTests(null); __setAnthropicForTests(null); });

  /** Save proposals as an answer would, and return them. */
  const propose = async (...inputs: Record<string, unknown>[]): Promise<ProposedAction[]> => {
    const out: ProposedAction[] = [];
    for (const i of inputs) { const r = await resolveAction(i, NOW); if (!("ok" in r)) throw new Error(r.error); out.push(r.ok); }
    const run = t.ask_scout_history.find((h) => h.id === RUN);
    if (run) (run.actions as ProposedAction[]).push(...out);
    else t.ask_scout_history.push({ id: RUN, question: "q", answer: { answer: "a" }, actions: out, tools: [], created_at: NOW.toISOString() });
    rec.writes.length = 0;
    return out;
  };

  it("the allowlist is exactly the seven actions, in the tool's schema too", () => {
    expect(ACTION_TYPES).toEqual(["step_snooze", "step_dismiss", "proposal_dismiss", "shortlist_add", "lead_contacted", "candidate_note", "open_page"]);
    expect((PROPOSE_TOOL.input_schema.properties as { type: { enum: string[] } }).type.enum).toEqual(ACTION_TYPES);
  });

  it("proposing only reads: every allowed action resolves without a write", async () => {
    const step = (await todaySteps(NOW)).steps[0];
    rec.writes.length = 0;
    const inputs = [
      ...(step ? [{ type: "step_snooze", step_id: step.id }, { type: "step_dismiss", step_id: step.id }] : []),
      { type: "proposal_dismiss", proposal_id: PROPOSAL }, { type: "shortlist_add", asin: "B0PRODUCT1" }, { type: "lead_contacted", lead_id: LEAD },
      { type: "candidate_note", candidate_id: CAND, note: "Chase Tina for lead times" }, { type: "open_page", href: "/stock/reorder?status=due", label: "Reorder, due now" },
    ];
    for (const i of inputs) expect(await resolveAction(i, NOW)).toHaveProperty("ok");
    expect(step, "Today shows the open proposal as a step").toBeTruthy();
    expect(rec.writes).toEqual([]);
  });

  it("never allowed, even if proposed: Ads approvals or exports, Amazon, deletes, uploads, purchases, prices or costs, settings", async () => {
    for (const type of ["approve_proposal", "export_proposals", "pause_campaign", "delete_lead", "upload_file", "purchase_stock", "set_price", "update_settings", "update_landed_cost"]) {
      const r = await resolveAction({ type, proposal_id: PROPOSAL }, NOW);
      expect(r, type).toHaveProperty("error");
    }
    expect(await resolveAction({ type: "approve_proposal" }, NOW)).toMatchObject({ never: { href: "/ads/proposals?tab=review" } });
    expect(await resolveAction({ type: "open_page", href: "https://evil.example/x" }, NOW)).toHaveProperty("error");
    expect(rec.writes).toEqual([]);
  });

  it("each proposal says what will change and on which record", async () => {
    const [p, l, n, s] = await propose(
      { type: "proposal_dismiss", proposal_id: PROPOSAL }, { type: "lead_contacted", lead_id: LEAD },
      { type: "candidate_note", candidate_id: CAND, note: "Chase Tina for lead times" }, { type: "shortlist_add", asin: "B0PRODUCT1" },
    );
    expect(p.summary).toMatch(/Dismiss ".+" on Seat belt Auto · close-match \(£0\.45 → £0\.36\): skipped for 30 days\. Nothing changes on Amazon\./);
    expect(p.target).toMatchObject({ kind: "Ads proposal", id: PROPOSAL, href: "/ads/proposals?tab=review" });
    expect(l).toMatchObject({ summary: "Mark Xiamen Shinning, a lead for Lens cleaning wipes scoring 70, as contacted (it's new now).", target: { kind: "Supplier lead", href: `/pl/candidates/${CAND}?tab=suppliers` } });
    expect(n.summary).toBe(`Set the next-action note on Lens cleaning wipes to "Chase Tina for lead times".`);
    expect(s.target).toMatchObject({ kind: "Product", label: "Muscle rub 100 ml (B0PRODUCT1)", href: "/products/B0PRODUCT1" });
  });

  it("Confirm runs it once, logs who and when; a second Confirm changes nothing; Undo puts it back", async () => {
    const [a] = await propose({ type: "proposal_dismiss", proposal_id: PROPOSAL });
    const r1 = await confirmAction(RUN, a.id, WHO, NOW);
    expect(r1.already).toBe(false);
    expect(t.ads_proposals[0]).toMatchObject({ status: "skipped" });
    const decidedAt = t.ads_proposals[0].decided_at;
    expect(r1.log).toMatchObject({ status: "done", actor: "akin", ip: "203.0.113.5", type: "proposal_dismiss", before: { status: "open", hold_until: null } });
    expect(r1.log.done_at).toBeTruthy();
    const r2 = await confirmAction(RUN, a.id, WHO, NOW);
    expect(r2.already).toBe(true);
    expect(t.ask_scout_actions).toHaveLength(1);
    expect(t.ads_proposals[0].decided_at).toBe(decidedAt);
    await undoAction(r1.log.id, new Date(NOW.getTime() + 5_000));
    expect(t.ads_proposals[0]).toMatchObject({ status: "open", hold_until: null });
    expect(t.ask_scout_actions[0]).toMatchObject({ status: "undone" });
    // Undone: Confirm doesn't run it again.
    await expect(confirmAction(RUN, a.id, WHO, NOW)).rejects.toThrow(/undone/);
  });

  it("every allowed action confirms and undoes", async () => {
    const step = (await todaySteps(NOW)).steps[0];
    const acts = await propose(
      { type: "lead_contacted", lead_id: LEAD }, { type: "candidate_note", candidate_id: CAND, note: "Chase Tina" },
      { type: "shortlist_add", asin: "B0PRODUCT1" }, { type: "step_snooze", step_id: step.id }, { type: "open_page", href: "/stock/reorder", label: "Reorder" },
    );
    const logs = [];
    for (const a of acts) logs.push((await confirmAction(RUN, a.id, WHO, NOW)).log);
    expect(t.pl_supplier_leads[0].status).toBe("contacted");
    expect(t.pl_candidates[0].next_action_note).toBe("Chase Tina");
    expect(t.favourites).toHaveLength(1);
    expect(t.today_step_state[0]).toMatchObject({ step_id: step.id });
    expect(t.today_step_state[0].snoozed_until).toBeTruthy();
    const later = new Date(NOW.getTime() + 10_000);
    for (const l of logs.slice(0, 4)) await undoAction(l.id, later);
    expect(t.pl_supplier_leads[0].status).toBe("new");
    expect(t.pl_candidates[0].next_action_note).toBeNull();
    expect(t.favourites).toHaveLength(0);
    expect(t.today_step_state[0].snoozed_until).toBeNull();
    await expect(undoAction(logs[4].id, later)).rejects.toThrow(/can't be undone/);
    // Too late: Undo is for a couple of minutes after Confirm.
    const [n2] = await propose({ type: "candidate_note", candidate_id: CAND, note: "Order samples" });
    const l2 = (await confirmAction(RUN, n2.id, WHO, NOW)).log;
    await expect(undoAction(l2.id, new Date(NOW.getTime() + 10 * 60_000))).rejects.toThrow(/Too late/);
  });

  it("checked again on Confirm: a stored action outside the allowlist, or a record that changed, isn't run", async () => {
    t.ask_scout_history.push({ id: RUN, question: "q", actions: [{ id: "x1", type: "approve_proposal", params: { proposal_id: PROPOSAL }, target: { kind: "Ads proposal", id: PROPOSAL, label: "x", href: null }, summary: "Approve it" }], created_at: NOW.toISOString() });
    rec.writes.length = 0;
    await expect(confirmAction(RUN, "x1", WHO, NOW)).rejects.toThrow(/isn't an allowed action/);
    expect(t.ads_proposals[0].status).toBe("open");
    expect(rec.writes).toEqual([]);
    const [a] = await propose({ type: "proposal_dismiss", proposal_id: PROPOSAL });
    t.ads_proposals[0].status = "approved";
    await expect(confirmAction(RUN, a.id, WHO, NOW)).rejects.toThrow(/approved, not open/);
    expect(t.ads_proposals[0].status).toBe("approved");
  });

  it("No thanks is logged and the action can't then run by accident", async () => {
    const [a] = await propose({ type: "lead_contacted", lead_id: LEAD });
    const l = await declineAction(RUN, a.id, WHO, NOW);
    expect(l).toMatchObject({ status: "declined", actor: "akin" });
    expect(t.pl_supplier_leads[0].status).toBe("new");
  });

  it("a request outside the allowlist: Scout says it can't and links the page", () => {
    expect(neverAllowed("Approve the bid changes for the seat belt")).toMatchObject({ k: "ads", href: "/ads/proposals?tab=review" });
    expect(neverAllowed("please delete the Xiamen lead")).toMatchObject({ k: "delete" });
    expect(neverAllowed("Can you upload this bulk file")).toMatchObject({ k: "upload" });
    expect(neverAllowed("Order 500 more wipes from Tina")).toMatchObject({ k: "purchase", href: "/stock/purchases" });
    expect(neverAllowed("Change the price of the seat belt to £13.99")).toMatchObject({ k: "price" });
    expect(neverAllowed("Turn on VAT registration in settings")).toMatchObject({ k: "settings", href: "/settings" });
    expect(neverAllowed("Pause the seat belt campaign on Amazon")).toMatchObject({ k: "amazon" });
    // Questions about these things aren't requests to do them.
    for (const q of ["Which proposals should I approve?", "When should I reorder the pill box?", "Is the seat belt making money after ads?", "What did my last export contain?", "Order the candidates by score"]) expect(neverAllowed(q), q).toBeNull();
    const a = withRefusal(cleanAnswer({ answer: "I can't approve bid changes." }, new Set()), "Approve the bid changes");
    expect(a.cannot).toEqual([{ request: "approve or export Ads changes", href: "/ads/proposals?tab=review", page: "Ads → Proposals" }]);
    // The model's own "can't" (with an app page) is kept as it is.
    const own = withRefusal(cleanAnswer({ answer: "x", cannot: [{ request: "delete the lead", href: "/pl/suppliers", page: "Suppliers & quotes" }, { request: "y", href: "https://evil.example", page: "z" }] }, new Set()), "delete the lead");
    expect(own.cannot).toEqual([{ request: "delete the lead", href: "/pl/suppliers", page: "Suppliers & quotes" }]);
  });

  it("asking end to end: a proposal becomes a card and changes nothing; a forbidden type is refused to the model", async () => {
    process.env.ANTHROPIC_API_KEY = "test";
    const usage = { input_tokens: 1000, output_tokens: 100 };
    const turn = (calls: { name: string; input: unknown }[]) => ({ id: "m", type: "message", role: "assistant", model: "x", stop_reason: "tool_use", stop_sequence: null, usage, content: calls.map((c, i) => ({ type: "tool_use", id: `t${i}${c.name}`, name: c.name, input: c.input })) });
    const replies: unknown[] = [
      turn([{ name: "propose_action", input: { type: "lead_contacted", lead_id: LEAD } }, { name: "propose_action", input: { type: "approve_proposal", proposal_id: PROPOSAL } }]),
      { id: "m", type: "message", role: "assistant", model: "x", stop_reason: "end_turn", stop_sequence: null, usage, content: [{ type: "text", text: JSON.stringify({ answer: "I've suggested marking Xiamen contacted; I can't approve proposals.", figures: [], links: [], missing: [], cannot: [] }) }] },
    ];
    const sent: { messages: { content: unknown }[] }[] = [];
    __setAnthropicForTests({ messages: { create: async (b) => { sent.push(JSON.parse(JSON.stringify(b))); return replies.shift() as never; } } });
    rec.writes.length = 0;
    const r = await askScout("Mark the Xiamen lead contacted and approve the bid change", NOW);
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0]).toMatchObject({ type: "lead_contacted", target: { id: LEAD } });
    expect(t.pl_supplier_leads[0].status).toBe("new");
    expect(t.ads_proposals[0].status).toBe("open");
    // Only the log of the question itself was written.
    expect([...new Set(rec.writes)].sort()).toEqual(["delete ask_scout_history", "insert ads_ai_calls", "insert ask_scout_history"].filter((w) => rec.writes.includes(w)));
    expect(rec.writes.every((w) => /ads_ai_calls|ask_scout_history/.test(w))).toBe(true);
    const results = sent[1].messages[2].content as { is_error?: boolean; content: string }[];
    expect(results[1]).toMatchObject({ is_error: true });
    expect(results[1].content).toMatch(/isn't an action Scout can propose/);
    expect(r.answer!.cannot).toEqual([{ request: "approve or export Ads changes", href: "/ads/proposals?tab=review", page: "Ads → Proposals" }]);
  });

  it("the module never reaches Amazon, exports, uploads or deletes beyond its own undo", () => {
    const src = readFileSync(join(__dirname, "askScoutActions.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(src).not.toMatch(/\bfetch\(|spapi|adsOps|exportApproved|createBatch|bulk|\.rpc\(|\.delete\(/i);
    const imports = [...src.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort();
    expect(imports).toEqual(["../ads/rules", "./adsRules", "./db", "./favourites", "./nextSteps", "./plSuppliers", "@anthropic-ai/sdk", "node:crypto"].sort());
    expect(src).toMatch(/import \{ decide \} from "\.\/adsRules"/);
    // decide is only ever asked to skip (dismiss).
    expect([...src.matchAll(/decide\(\[[^\]]*\], "(\w+)"\)/g)].map((m) => m[1])).toEqual(["skip"]);
  });
});
