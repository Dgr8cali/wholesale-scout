import "server-only";
import { randomUUID } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import { RULE_LABEL, type RuleId } from "../ads/rules";
import { decide } from "./adsRules";
import { db, must } from "./db";
import { addFavourite, removeFavourite } from "./favourites";
import { setStepState, todaySteps } from "./nextSteps";
import { updateLead } from "./plSuppliers";

/**
 * Ask Scout's actions. Scout itself stays read-only: it can only PROPOSE one of the actions in
 * ALLOWED (`resolveAction` reads the record and writes nothing). Nothing changes until you press
 * Confirm on that action: `confirmAction` checks it against the allowlist and the record again, runs
 * it once (a second Confirm returns the first result), and logs who, when and what in
 * ask_scout_actions, with the record's state before so Undo can put it back.
 * Never allowed, even if asked (NEVER): approving or exporting Ads changes, anything on Amazon,
 * deleting, uploads, purchases, editing prices or costs, settings. Scout says so and links the page.
 */

export const ALLOWED = {
  step_snooze: "Snooze a Today step for 24 hours (Later)",
  step_dismiss: "Dismiss a Today step (Done)",
  proposal_dismiss: "Dismiss an open Ads proposal (skipped for 30 days; nothing goes to Amazon)",
  shortlist_add: "Add a wholesale product to Shortlist",
  lead_contacted: "Mark a new Alibaba supplier lead contacted",
  candidate_note: "Set a Private label candidate's next-action note",
  open_page: "Open a page in the app, pre-filtered",
} as const;
export type ActionType = keyof typeof ALLOWED;
export const ACTION_TYPES = Object.keys(ALLOWED) as ActionType[];
export const isAllowed = (t: unknown): t is ActionType => typeof t === "string" && Object.hasOwn(ALLOWED, t);

/** At most this many proposals with one answer. */
export const MAX_PROPOSALS = 3;
/** Undo works this long after Confirm (the toast offers it for 10 seconds). */
export const UNDO_MS = 2 * 60_000;

/** A request Scout must turn down, with the page where you can do it yourself. */
export interface Never { k: string; what: string; href: string; page: string }

// An instruction, not a question about it: at the start, or after "please", "can you"…
const ASK = String.raw`(?:^|\b(?:please|can you|could you|would you|will you|go ahead and|i want you to|i'd like you to|you should|scout,?|and|then|also)\s+)`;
const NEVER_RULES: (Never & { re: RegExp })[] = [
  { k: "ads", what: "approve or export Ads changes", href: "/ads/proposals?tab=review", page: "Ads → Proposals",
    re: new RegExp(`${ASK}(?:approve|export|apply|accept|push)\\b`, "i") },
  { k: "amazon", what: "change anything on Amazon", href: "/ads/dashboard", page: "Ads → Dashboard (then Amazon itself)",
    re: new RegExp(`${ASK}(?:pause|enable|launch|start|stop|create|archive)\\b.*\\b(?:campaign|ad group|keyword|listing|on amazon)`, "i") },
  { k: "delete", what: "delete anything", href: "/", page: "the page the record is on",
    re: new RegExp(`${ASK}(?:delete|remove|erase|clear|get rid of|archive)\\b`, "i") },
  { k: "upload", what: "upload files", href: "/ads/dashboard?tab=imports&import=1", page: "Ads → Dashboard → Import (or New run → Upload file)",
    re: new RegExp(`${ASK}(?:upload|import)\\b`, "i") },
  { k: "purchase", what: "make purchases or place orders", href: "/stock/purchases", page: "Stock → Purchases",
    re: new RegExp(`${ASK}(?:buy|purchase|place (?:an |the )?order|order (?:\\d+|more|some|another|samples|stock|units)|reorder)\\b`, "i") },
  { k: "price", what: "edit prices or costs", href: "/stock/purchases", page: "where the price or cost is kept (Stock → Purchases, an Ads product, the candidate's gates)",
    re: new RegExp(`${ASK}(?:set|change|edit|update|lower|raise|increase|decrease|reduce|cut)\\b.*\\b(?:price|cost|landed|fee|bid|budget|margin)s?\\b`, "i") },
  { k: "settings", what: "change settings", href: "/settings", page: "Settings",
    re: new RegExp(`${ASK}(?:set|change|edit|update|turn on|turn off|switch|enable|disable)\\b.*\\bsettings?\\b`, "i") },
];

/** The never-allowed request in a question, if it asks for one. */
export function neverAllowed(question: string): Never | null {
  const q = question.trim();
  const hit = NEVER_RULES.find((r) => r.re.test(q));
  return hit ? { k: hit.k, what: hit.what, href: hit.href, page: hit.page } : null;
}

export interface ProposedAction {
  id: string;
  type: ActionType;
  params: Record<string, string>;
  /** The record it changes: what kind, its id, a name you'd recognise and its page. */
  target: { kind: string; id: string; label: string; href: string | null };
  /** What will change, in a sentence. */
  summary: string;
}

/** The tool Scout proposes with. It reads only; the card it makes waits for your Confirm. */
export const PROPOSE_TOOL: Anthropic.Tool = {
  name: "propose_action",
  description: `Propose ONE action for the seller to confirm with a tap; nothing happens unless they confirm it. Only these types: ${ACTION_TYPES.map((t) => `${t} (${ALLOWED[t]})`).join("; ")}. Parameters: step_snooze / step_dismiss need step_id (from today_steps); proposal_dismiss needs proposal_id (from proposals); shortlist_add needs asin (a wholesale product from find_products); lead_contacted needs lead_id (a lead with status new, from suppliers); candidate_note needs candidate_id (from candidates) and note (under 300 characters); open_page needs href (an app page from a tool, with filters in its query) and label. Propose only what the seller asked for or clearly wants, at most ${MAX_PROPOSALS} per answer. Anything else (approving or exporting Ads changes, anything on Amazon, deleting, uploads, purchases, prices or costs, settings) can't be proposed.`,
  input_schema: {
    type: "object",
    properties: {
      type: { type: "string", enum: ACTION_TYPES },
      step_id: { type: "string" }, proposal_id: { type: "string" }, asin: { type: "string" }, lead_id: { type: "string" },
      candidate_id: { type: "string" }, note: { type: "string" }, href: { type: "string" }, label: { type: "string" },
    },
    required: ["type"],
    additionalProperties: false,
  } as Anthropic.Tool.InputSchema,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (x: unknown) => (typeof x === "string" ? x.trim() : "");
/** Only the app's own pages: Today, or one of its sections. */
const APP_PATH = /^\/(?:$|\?|(?:ads|stock|pl|products|suppliers|brands|runs|shortlist|new-run|plan|sellers|settings|help)(?:\/|\?|$))/;
export const appHref = (h: string) => h.startsWith("/") && !h.startsWith("//") && !/[\s\\<>"]/.test(h) && h.length <= 300 && APP_PATH.test(h);

type Resolved = { ok: ProposedAction } | { error: string; never?: Never };

/**
 * Check a proposed action and describe it from the record as it is now. Reads only. Used when
 * Scout proposes it and again when you confirm it.
 */
export async function resolveAction(input: Record<string, unknown>, now = new Date(), id: string = randomUUID().slice(0, 8)): Promise<Resolved> {
  const type = input.type;
  if (!isAllowed(type)) {
    const never = neverAllowed(`please ${String(type ?? "").replace(/_/g, " ")}`);
    return { error: `"${String(type)}" isn't an action Scout can propose. Allowed: ${ACTION_TYPES.join(", ")}.`, ...(never ? { never } : {}) };
  }
  const d = db();
  const make = (params: Record<string, string>, target: ProposedAction["target"], summary: string): Resolved => ({ ok: { id, type, params, target, summary } });
  switch (type) {
    case "step_snooze":
    case "step_dismiss": {
      const stepId = str(input.step_id);
      if (!stepId || stepId.length > 200) return { error: "step_id is needed (from today_steps)" };
      const step = (await todaySteps(now)).steps.find((s) => s.id === stepId);
      if (!step) return { error: `No step "${stepId}" is showing on Today now` };
      return make({ step_id: stepId }, { kind: "Today step", id: stepId, label: step.title, href: "/" },
        type === "step_snooze" ? `Snooze "${step.title}" on Today for 24 hours (Later).` : `Mark "${step.title}" done on Today: it stays hidden until something behind it changes.`);
    }
    case "proposal_dismiss": {
      const pid = str(input.proposal_id);
      if (!UUID.test(pid)) return { error: "proposal_id is needed (from proposals)" };
      const p = must(await d.from("ads_proposals").select("id, asin, rule, campaign_name, entity, current_value, proposed_value, status").eq("id", pid).maybeSingle(), "proposal") as
        { id: string; asin: string | null; rule: string; campaign_name: string | null; entity: { label?: string } | null; current_value: string | null; proposed_value: string | null; status: string } | null;
      if (!p) return { error: "No such proposal" };
      if (p.status !== "open") return { error: `That proposal is ${p.status}, not open` };
      const rule = RULE_LABEL[p.rule as RuleId] ?? p.rule;
      const what = [p.campaign_name, p.entity?.label].filter(Boolean).join(" · ");
      return make({ proposal_id: pid }, { kind: "Ads proposal", id: pid, label: `${rule}${p.asin ? ` for ${p.asin}` : ""}`, href: "/ads/proposals?tab=review" },
        `Dismiss "${rule}"${what ? ` on ${what}` : ""}${p.current_value || p.proposed_value ? ` (${p.current_value ?? "—"} → ${p.proposed_value ?? "—"})` : ""}: skipped for 30 days. Nothing changes on Amazon.`);
    }
    case "shortlist_add": {
      const asin = str(input.asin).toUpperCase();
      if (!/^[A-Z0-9]{10}$/.test(asin)) return { error: "asin is needed (10 letters and digits)" };
      const p = (must(await d.from("products").select("ean, asin, title").eq("asin", asin).order("created_at", { ascending: false }).limit(1), "product") as { ean: string; asin: string; title: string | null }[])[0];
      if (!p) return { error: `${asin} isn't one of your screened wholesale products` };
      const fav = must(await d.from("favourites").select("id").eq("ean", p.ean).eq("asin", asin).limit(1), "shortlist") as { id: string }[];
      if (fav.length) return { error: `${p.title ?? asin} is already on Shortlist` };
      const name = p.title ? `${p.title.slice(0, 80)} (${asin})` : asin;
      return make({ asin }, { kind: "Product", id: asin, label: name, href: `/products/${asin}` }, `Add ${name} to Shortlist → Products.`);
    }
    case "lead_contacted": {
      const lid = str(input.lead_id);
      if (!UUID.test(lid)) return { error: "lead_id is needed (from suppliers)" };
      const l = must(await d.from("pl_supplier_leads").select("id, candidate_id, supplier_name, title, score, status").eq("id", lid).maybeSingle(), "lead") as
        { id: string; candidate_id: string; supplier_name: string | null; title: string | null; score: number | null; status: string } | null;
      if (!l) return { error: "No such supplier lead" };
      if (l.status !== "new") return { error: `That lead is already ${l.status}` };
      const c = must(await d.from("pl_candidates").select("name").eq("id", l.candidate_id).maybeSingle(), "candidate") as { name: string } | null;
      const name = l.supplier_name ?? l.title?.slice(0, 60) ?? "the supplier";
      return make({ lead_id: lid }, { kind: "Supplier lead", id: lid, label: `${name}${c ? ` (${c.name})` : ""}`, href: `/pl/candidates/${l.candidate_id}?tab=suppliers` },
        `Mark ${name}${c ? `, a lead for ${c.name}` : ""}${l.score != null ? ` scoring ${Math.round(Number(l.score))}` : ""}, as contacted (it's new now).`);
    }
    case "candidate_note": {
      const cid = str(input.candidate_id);
      const note = str(input.note);
      if (!UUID.test(cid)) return { error: "candidate_id is needed (from candidates)" };
      if (!note) return { error: "note is needed" };
      if (note.length > 300) return { error: "Keep the note under 300 characters" };
      const c = must(await d.from("pl_candidates").select("id, name, next_action_note").eq("id", cid).maybeSingle(), "candidate") as { id: string; name: string; next_action_note: string | null } | null;
      if (!c) return { error: "No such candidate" };
      if (c.next_action_note === note) return { error: "That's already the note" };
      return make({ candidate_id: cid, note }, { kind: "Candidate", id: cid, label: c.name, href: `/pl/candidates/${cid}` },
        `Set the next-action note on ${c.name} to "${note}"${c.next_action_note ? ` (replacing "${c.next_action_note}")` : ""}.`);
    }
    case "open_page": {
      const href = str(input.href);
      const label = str(input.label).slice(0, 60) || href;
      if (!appHref(href)) return { error: "href must be one of the app's own pages" };
      return make({ href, label }, { kind: "Page", id: href, label, href }, `Open ${label}.`);
    }
  }
}

/** Who confirmed it: the name typed at the browser's sign-in (never the password), the address and the browser. */
export interface Who { actor: string; ip: string | null; user_agent: string | null }

export interface ActionLog {
  id: string; run_id: string; action_id: string; type: string; target: ProposedAction["target"]; summary: string;
  status: "running" | "done" | "failed" | "declined" | "undone";
  before: unknown; after: unknown; error: string | null; actor: string; ip: string | null; user_agent: string | null;
  created_at: string; done_at: string | null; undone_at: string | null;
}

async function proposedIn(runId: string, actionId: string): Promise<ProposedAction> {
  if (!UUID.test(runId)) throw new Error("No such answer");
  const row = must(await db().from("ask_scout_history").select("actions").eq("id", runId).maybeSingle(), "answer") as { actions: ProposedAction[] | null } | null;
  const a = row?.actions?.find((x) => x.id === actionId);
  if (!a) throw new Error("No such action (it may be from an answer no longer kept)");
  return a;
}

async function logOf(runId: string, actionId: string): Promise<ActionLog | null> {
  return (must(await db().from("ask_scout_actions").select("*").eq("run_id", runId).eq("action_id", actionId).limit(1), "action log") as ActionLog[])[0] ?? null;
}

/** Run one allowed action against the record; returns its state before and after. */
async function execute(a: ProposedAction, now: Date): Promise<{ before: unknown; after: unknown }> {
  const d = db();
  const p = a.params;
  switch (a.type) {
    case "step_snooze":
    case "step_dismiss": {
      const before = (must(await d.from("today_step_state").select("step_id, fingerprint, snoozed_until, dismissed_at, updated_at").eq("step_id", p.step_id).limit(1), "step state") as unknown[])[0] ?? null;
      const step = (await todaySteps(now)).steps.find((s) => s.id === p.step_id);
      const after = await setStepState(p.step_id, a.type === "step_snooze" ? "snooze" : "dismiss", step?.fingerprint ?? null, now);
      return { before, after };
    }
    case "proposal_dismiss": {
      const before = must(await d.from("ads_proposals").select("status, hold_until, decided_at").eq("id", p.proposal_id).single(), "proposal");
      await decide([p.proposal_id], "skip");
      return { before, after: must(await d.from("ads_proposals").select("status, hold_until, decided_at").eq("id", p.proposal_id).single(), "proposal") };
    }
    case "shortlist_add": {
      const prod = (must(await d.from("products").select("ean, asin").eq("asin", p.asin).order("created_at", { ascending: false }).limit(1), "product") as { ean: string; asin: string }[])[0];
      const fav = await addFavourite(prod.ean, prod.asin);
      return { before: null, after: { favourite_id: fav.id, ean: prod.ean, asin: prod.asin } };
    }
    case "lead_contacted": {
      const before = must(await d.from("pl_supplier_leads").select("status, reject_reason").eq("id", p.lead_id).single(), "lead");
      const l = await updateLead(p.lead_id, { status: "contacted" });
      return { before, after: { status: l.status } };
    }
    case "candidate_note": {
      const before = must(await d.from("pl_candidates").select("next_action_note").eq("id", p.candidate_id).single(), "candidate");
      must(await d.from("pl_candidates").update({ next_action_note: p.note, updated_at: now.toISOString() }).eq("id", p.candidate_id), "note");
      return { before, after: { next_action_note: p.note } };
    }
    case "open_page":
      return { before: null, after: { href: p.href } };
  }
}

/**
 * Confirm one proposed action: checked against the allowlist and the record again, run once (a
 * repeat Confirm returns the first run), logged with who and when.
 */
export async function confirmAction(runId: string, actionId: string, who: Who, now = new Date()): Promise<{ log: ActionLog; already: boolean; href: string | null }> {
  const a = await proposedIn(runId, actionId);
  const done = await logOf(runId, actionId);
  if (done?.status === "done") return { log: done, already: true, href: a.type === "open_page" ? a.params.href : null };
  if (done?.status === "running") throw new Error("It's already running");
  if (done?.status === "undone") throw new Error("That action was undone: ask again to propose it afresh");
  // Validated again, as if it were new: the allowlist, and the record as it is now.
  if (!isAllowed(a.type)) throw new Error(`"${a.type}" isn't an allowed action`);
  const fresh = await resolveAction({ type: a.type, ...a.params }, now, a.id);
  if ("error" in fresh) throw new Error(fresh.error);
  const d = db();
  const base = { run_id: runId, action_id: actionId, type: a.type, target: fresh.ok.target, summary: fresh.ok.summary, status: "running", error: null, ...who, created_at: now.toISOString() };
  // Claim it: the unique (run, action) stops a second Confirm running it twice.
  const claim = done
    ? await d.from("ask_scout_actions").update(base).eq("id", done.id).in("status", ["failed", "declined"]).select("*")
    : await d.from("ask_scout_actions").insert(base).select("*");
  const claimed = (claim.data as ActionLog[] | null)?.[0];
  if (claim.error || !claimed) {
    const again = await logOf(runId, actionId);
    if (again?.status === "done") return { log: again, already: true, href: a.type === "open_page" ? a.params.href : null };
    throw new Error("It's already running");
  }
  try {
    const { before, after } = await execute(fresh.ok, now);
    const log = must(await d.from("ask_scout_actions").update({ status: "done", before, after, done_at: now.toISOString() }).eq("id", claimed.id).select("*").single(), "log action") as ActionLog;
    return { log, already: false, href: a.type === "open_page" ? a.params.href : null };
  } catch (e) {
    must(await d.from("ask_scout_actions").update({ status: "failed", error: (e as Error).message.slice(0, 500) }).eq("id", claimed.id), "log failure");
    throw e;
  }
}

/** "No thanks": logged, and the card goes. A done action can't be declined. */
export async function declineAction(runId: string, actionId: string, who: Who, now = new Date()): Promise<ActionLog> {
  const a = await proposedIn(runId, actionId);
  const cur = await logOf(runId, actionId);
  if (cur && cur.status !== "failed") return cur;
  const row = { run_id: runId, action_id: actionId, type: a.type, target: a.target, summary: a.summary, status: "declined", ...who, created_at: now.toISOString() };
  return must(cur
    ? await db().from("ask_scout_actions").update(row).eq("id", cur.id).select("*").single()
    : await db().from("ask_scout_actions").insert(row).select("*").single(), "decline") as ActionLog;
}

/** Undo a confirmed action (within UNDO_MS): the record goes back to how it was before. */
export async function undoAction(logId: string, now = new Date()): Promise<ActionLog> {
  const d = db();
  if (!UUID.test(logId)) throw new Error("No such action");
  const log = must(await d.from("ask_scout_actions").select("*").eq("id", logId).maybeSingle(), "action") as ActionLog | null;
  if (!log) throw new Error("No such action");
  if (log.status === "undone") return log;
  if (log.status !== "done") throw new Error("Only a confirmed action can be undone");
  if (log.type === "open_page") throw new Error("Opening a page can't be undone");
  if (log.done_at && now.getTime() - new Date(log.done_at).getTime() > UNDO_MS) throw new Error("Too late to undo: change it on its page");
  const b = (log.before ?? null) as Record<string, unknown> | null;
  const id = log.target.id;
  switch (log.type as ActionType) {
    case "step_snooze":
    case "step_dismiss":
      if (b) must(await d.from("today_step_state").upsert(b, { onConflict: "step_id" }), "restore step");
      // There was no state before: the step simply shows again.
      else must(await d.from("today_step_state").update({ snoozed_until: null, dismissed_at: null, updated_at: now.toISOString() }).eq("step_id", id), "restore step");
      break;
    case "proposal_dismiss":
      must(await d.from("ads_proposals").update({ ...b, updated_at: now.toISOString() }).eq("id", id).eq("status", "skipped"), "restore proposal");
      break;
    case "shortlist_add": {
      const fav = (log.after as { favourite_id?: string } | null)?.favourite_id;
      if (fav) await removeFavourite(fav);
      break;
    }
    case "lead_contacted":
      must(await d.from("pl_supplier_leads").update({ ...b, updated_at: now.toISOString() }).eq("id", id).eq("status", "contacted"), "restore lead");
      break;
    case "candidate_note":
      must(await d.from("pl_candidates").update({ next_action_note: (b?.next_action_note as string | null) ?? null, updated_at: now.toISOString() }).eq("id", id), "restore note");
      break;
    default:
      throw new Error(`"${log.type}" can't be undone`);
  }
  return must(await d.from("ask_scout_actions").update({ status: "undone", undone_at: now.toISOString() }).eq("id", logId).select("*").single(), "log undo") as ActionLog;
}

/** The action log, newest first. */
export async function actionLog(limit = 50): Promise<ActionLog[]> {
  const r = await db().from("ask_scout_actions").select("*").order("created_at", { ascending: false }).limit(limit);
  return r.error ? [] : (r.data as ActionLog[]);
}
