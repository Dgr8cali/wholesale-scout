import type { Status } from "./gatekeeper";
import { LAUNCH_STEPS, type PlStatus } from "./launch";

/**
 * The Private label pipeline board: five columns from research to selling. A candidate's column is
 * the one you moved it to (pl_candidates.pipeline_stage), else what its data says: the launch
 * checklist, its status, its quotes and messaged suppliers, then Gates 0–3. Pure.
 */

export const STAGES = ["research", "validate", "sourcing", "launch", "live"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = { research: "Research", validate: "Validate", sourcing: "Sourcing", launch: "Launch", live: "Live" };
export const STAGE_HINT: Record<Stage, string> = {
  research: "Gates 0–3", validate: "Gates 4–7", sourcing: "Quotes, samples, artwork, PO", launch: "Inbound, listing, first ads", live: "Selling",
};

/** Checklist steps by the column they belong to (everything before the PO is sourcing). */
const SOURCING_STEPS = ["samples_ordered", "samples_received", "sample_chosen", "trademark_filed", "po_placed"];
const LAUNCH_STEP_KEYS = ["inspection_booked", "inspection_passed", "shipped", "at_fba", "listing_written", "ads_launched"];
const LIVE_STEPS = ["listing_live", "first_review"];
/** Quote statuses that mean a supplier has answered or samples are on the way. */
const QUOTE_SOURCING = ["requested", "received", "samples ordered", "samples received", "chosen"];

export const isStage = (s: unknown): s is Stage => typeof s === "string" && (STAGES as readonly string[]).includes(s);
const idx = (s: Stage) => STAGES.indexOf(s);
export const isBackward = (from: Stage, to: Stage) => idx(to) < idx(from);

export interface StageFacts {
  status: PlStatus;
  /** pipeline_stage: where you moved it, or null to follow the data. */
  stored: Stage | null;
  /** The eight gates' results, Gate 0 first (waivers applied). */
  gates: Status[];
  stepsDone: string[];
  /** Quote statuses (rejected ones don't count). */
  quotes: string[];
  /** Alibaba leads messaged or quoted. */
  contacted: number;
}

/**
 * What the records prove beyond the gates: listing live → Live; inspection to ads launched → Launch;
 * samples, a quote or a messaged supplier → Sourcing. Null when only the gates speak.
 */
export function evidenceStage(f: Pick<StageFacts, "status" | "stepsDone" | "quotes" | "contacted">): Stage | null {
  const done = new Set(f.stepsDone);
  if (f.status === "launched" || LIVE_STEPS.some((s) => done.has(s))) return "live";
  if (LAUNCH_STEP_KEYS.some((s) => done.has(s))) return "launch";
  if (f.status === "samples" || SOURCING_STEPS.some((s) => done.has(s)) || f.quotes.some((q) => QUOTE_SOURCING.includes(q)) || f.contacted > 0) return "sourcing";
  return null;
}

/** The column the data implies: the evidence, else Validate once Gates 0–3 all pass, else Research. */
export function derivedStage(f: StageFacts): Stage {
  return evidenceStage(f) ?? (f.gates.length >= 4 && f.gates.slice(0, 4).every((g) => g === "pass") ? "validate" : "research");
}

/** The column the card sits in: where you moved it, else what the data implies. */
export const stageOf = (f: StageFacts): Stage => f.stored ?? derivedStage(f);

/**
 * After a launch step, a quote or a messaged supplier: the stored column moves forwards to what the
 * records now prove (never backwards: a column you moved it back to stays until something new happens).
 */
export function advancedStage(f: StageFacts): Stage | null {
  if (!f.stored) return null;
  const e = evidenceStage(f);
  return e && idx(e) > idx(f.stored) ? e : null;
}

/**
 * The status a move implies, so Today and the launch checklist agree with the board: Live is
 * launched, Sourcing and Launch are samples, Research and Validate researching (a draft stays a
 * draft). Null: no change. Parked and dropped candidates don't move.
 */
export function statusForMove(current: PlStatus, to: Stage): PlStatus | null {
  if (current === "parked" || current === "dropped") return null;
  const want: PlStatus = to === "live" ? "launched" : to === "sourcing" || to === "launch" ? "samples" : current === "draft" ? "draft" : "researching";
  return want === current ? null : want;
}

/* ---------- the gate bar ---------- */

export type Segment = "passed" | "progress" | "todo";
export interface GateSeg { n: string; title: string; seg: Segment; status: Status }

/** Eight segments: passed, in progress (some answers, or a check / fail), not started (no answers). */
export function gateBar(gates: { n: string; title: string; status: Status; rows: { status: Status }[] }[]): GateSeg[] {
  return gates.map((g) => ({
    n: g.n, title: g.title, status: g.status,
    seg: g.status === "pass" ? "passed" : g.status === "empty" && g.rows.every((r) => r.status === "empty") ? "todo" : "progress",
  }));
}

const RESULT: Record<Status, string> = { pass: "passed", warn: "to check", fail: "failed", empty: "in progress" };
/** "3 of 8 gates passed. Gate 1 failed; Gate 2 to check; Gates 4–7 not started." */
export function gateBarLabel(segs: GateSeg[]): string {
  const passed = segs.filter((s) => s.seg === "passed").length;
  const notes = segs.filter((s) => s.seg === "progress").map((s) => `Gate ${s.n} ${RESULT[s.status]}`);
  const todo = segs.filter((s) => s.seg === "todo").map((s) => s.n);
  if (todo.length) notes.push(`${todo.length === 1 ? "Gate" : "Gates"} ${todo.join(", ")} not started`);
  return `${passed} of ${segs.length} gates passed${notes.length ? `. ${notes.join("; ")}` : ""}.`;
}

/* ---------- the next action ---------- */

export type CandidateTab = "overview" | "gates" | "reviews" | "suppliers" | "listing" | "launch";

export interface NextAction {
  /** Short, for "Next: …" and the primary button. */
  label: string;
  /** One line with the real figures. */
  detail: string;
  /** Where it's done: a launch step the button ticks, or a tab (and gate) to open. */
  step?: string;
  tab: CandidateTab;
  gate?: string;
}

export interface QuoteFact { supplier: string; status: string; unitPrice: number | null; currency: string; moq: number | null }

export interface ActionFacts {
  stage: Stage;
  status: PlStatus;
  parkReason?: string | null;
  verdict: { cls: Status; title: string };
  score: number;
  answered: number;
  gates: { n: string; title: string; status: Status }[];
  stepsDone: string[];
  quotes: QuoteFact[];
  chosen: QuoteFact | null;
  leads: { toContact: number; best: number | null; awaiting: number; oldestContacted: string | null };
  listingAsin: string | null;
  today: string;
}

const CHASE_DAYS = 7;
const SYMBOL: Record<string, string> = { USD: "$", GBP: "£", EUR: "€", CNY: "¥" };
const price = (q: QuoteFact) => (q.unitPrice == null ? null : `${SYMBOL[q.currency] ?? `${q.currency} `}${q.unitPrice.toFixed(2)}`);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const days = (from: string, to: string) => Math.max(0, Math.round((Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / 86_400_000));
const short = (iso: string) => new Date(iso.slice(0, 10)).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** The launch checklist's own words as an action: "Samples received" → "Mark samples received". */
const markStep = (key: string) => `Mark ${(LAUNCH_STEPS.find((s) => s.key === key)?.label ?? key).replace(/^./, (c) => c.toLowerCase())}`;

/**
 * The one next thing for a candidate, by column: the launch checklist once it's under way; in
 * sourcing the quotes and suppliers; before that the gates. The detail carries the real figures
 * ("Ningbo agreed $2.25/unit · waiting for samples").
 */
export function nextAction(f: ActionFacts): NextAction | null {
  if (f.status === "dropped") return null;
  if (f.status === "parked") return { label: "Unpark when you're ready", detail: f.parkReason?.trim() || "Parked, no reason given", tab: "overview" };
  const done = new Set(f.stepsDone);
  const next = LAUNCH_STEPS.find((s) => !done.has(s.key)) ?? null;
  const failed = f.gates.find((g) => g.status === "fail");
  const failNote = failed ? ` · Gate ${failed.n} failed` : "";
  const samples = f.quotes.find((q) => q.status === "samples ordered") ?? (f.chosen && done.has("samples_ordered") ? f.chosen : null);

  if (f.stage === "live") {
    if (!done.has("first_review")) return { label: markStep("first_review"), detail: f.listingAsin ? `Selling as ${f.listingAsin} · waiting for the first review` : "Live · waiting for the first review", step: "first_review", tab: "launch" };
    return { label: "Watch the ads", detail: f.listingAsin ? `Selling as ${f.listingAsin}` : "Every launch step done", tab: "launch" };
  }
  // The checklist has started (or the column says it's past the gates): its next step.
  if (next && (done.size > 0 || f.stage === "launch")) {
    const detail = next.key === "samples_received" && samples
      ? `${samples.supplier} agreed ${price(samples) ?? "a price"}/unit · waiting for samples`
      : `${done.size} of ${LAUNCH_STEPS.length} launch steps done`;
    return { label: markStep(next.key), detail: detail + failNote, step: next.key, tab: "launch" };
  }
  if (f.stage === "sourcing") {
    if (f.chosen) return { label: markStep("samples_ordered"), detail: `${f.chosen.supplier} chosen at ${price(f.chosen) ?? "no price yet"}/unit · order samples${failNote}`, step: "samples_ordered", tab: "launch" };
    const received = f.quotes.filter((q) => q.status === "received");
    if (received.length) {
      const best = received.filter((q) => q.unitPrice != null).sort((a, b) => a.unitPrice! - b.unitPrice!)[0];
      return { label: "Choose a quote", detail: `${plural(received.length, "quote")} in${best ? ` · best ${best.supplier} ${price(best)}/unit` : ""}${failNote}`, tab: "suppliers" };
    }
    const { awaiting, oldestContacted } = f.leads;
    if (awaiting && oldestContacted && days(oldestContacted, f.today) >= CHASE_DAYS) {
      return { label: `Chase ${plural(awaiting, "supplier")}`, detail: `Messaged ${short(oldestContacted)} (${days(oldestContacted, f.today)} days ago) · no quote yet${failNote}`, tab: "suppliers" };
    }
    const requested = f.quotes.filter((q) => q.status === "requested").length;
    if (requested || awaiting) return { label: "Wait for quotes", detail: `${plural(requested + awaiting, "supplier")} asked${oldestContacted ? ` since ${short(oldestContacted)}` : ""}${failNote}`, tab: "suppliers" };
    if (f.leads.toContact) return { label: `Message ${plural(f.leads.toContact, "supplier")}`, detail: `${f.leads.toContact} score 60+${f.leads.best != null ? ` (best ${Math.round(f.leads.best)})` : ""} · not messaged yet${failNote}`, tab: "suppliers" };
    return { label: "Get quotes", detail: `No supplier messaged yet${failNote}`, tab: "suppliers" };
  }
  // Research and Validate: the gates.
  if (f.verdict.cls === "pass") return { label: markStep("samples_ordered"), detail: `${f.score}/30 with every gate clear · order samples from two suppliers`, step: "samples_ordered", tab: "launch" };
  if (failed) return { label: `Fix or drop Gate ${failed.n}`, detail: `${failed.title} failed · ${f.answered} of 10 score lines in`, tab: "gates", gate: failed.n };
  const range = f.stage === "validate" ? f.gates.slice(4) : f.gates;
  const open = range.find((g) => g.status !== "pass") ?? f.gates.find((g) => g.status !== "pass");
  if (open) return { label: `Finish Gate ${open.n}`, detail: `${open.title} · ${f.gates.filter((g) => g.status === "pass").length} of ${f.gates.length} gates passed`, tab: "gates", gate: open.n };
  return { label: "Decide", detail: `${f.score}/30: ${f.verdict.title}`, tab: "overview" };
}
