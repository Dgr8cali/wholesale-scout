import "server-only";
import type { RateCard } from "../fees/rateCard";
import { withAdsDefaults } from "../pl/adsDefaults";
import { evaluate, type Status } from "../pl/gatekeeper";
import type { PlStatus } from "../pl/launch";
import {
  advancedStage, derivedStage, gateBar, gateBarLabel, isStage, nextAction, stageOf, statusForMove,
  type GateSeg, type NextAction, type QuoteFact, type Stage, type StageFacts,
} from "../pl/pipeline";
import { db, must, selectAll } from "./db";
import { listCandidates } from "./pl";

/**
 * The pipeline board (Private label's home): every candidate in its column with its gate bar and
 * next action, and the products already selling (Ads products not linked to a candidate) in Live.
 */

export interface PipelineCard {
  id: string;
  kind: "candidate" | "product";
  name: string;
  stage: Stage;
  /** Where the data alone would put it (the board says when you moved it elsewhere). */
  derived: Stage;
  moved: boolean;
  status: PlStatus | null;
  parked: boolean;
  verdict: { cls: Status; title: string } | null;
  gates: GateSeg[];
  gatesPassed: number;
  gateLabel: string;
  next: NextAction | null;
  /** The one-line detail under the name. */
  detail: string;
  asin: string | null;
  href: string;
  links: { label: string; href: string }[];
  updatedAt: string;
}

const today = (now: Date) => now.toISOString().slice(0, 10);

interface Raw {
  steps: { candidate_id: string; step: string; done: boolean }[];
  quotes: { candidate_id: string; supplier_name: string; status: string; unit_price: number | null; currency: string; moq: number | null; id: string }[];
  leads: { candidate_id: string; status: string; score: number | null; flags: string[] | null; updated_at: string }[];
  ads: { asin: string; title: string | null; phase: string | null; pl_candidate_id: string | null; updated_at: string | null }[];
  stock: { id: string; asin: string | null; name: string; archived_at: string | null }[];
}

async function raw(candidateId?: string): Promise<Raw> {
  const d = db();
  const [steps, quotes, leads, ads, stock] = await Promise.all([
    candidateId ? d.from("pl_launch_steps").select("candidate_id, step, done").eq("candidate_id", candidateId) : d.from("pl_launch_steps").select("candidate_id, step, done"),
    candidateId ? d.from("pl_quotes").select("id, candidate_id, supplier_name, status, unit_price, currency, moq").eq("candidate_id", candidateId) : d.from("pl_quotes").select("id, candidate_id, supplier_name, status, unit_price, currency, moq"),
    selectAll<Raw["leads"][number]>("pl_supplier_leads", "candidate_id, status, score, flags, updated_at", ["id"], (q) => (candidateId ? q.eq("candidate_id", candidateId) : q).in("status", ["new", "contacted", "quoted"])),
    d.from("ads_products").select("asin, title, phase, pl_candidate_id, updated_at"),
    d.from("stock_items").select("id, asin, name, archived_at"),
  ]);
  return {
    steps: must(steps, "launch steps") as Raw["steps"],
    quotes: must(quotes, "quotes") as Raw["quotes"],
    leads,
    ads: must(ads, "ads products") as Raw["ads"],
    stock: must(stock, "stock items") as Raw["stock"],
  };
}

function leadFacts(leads: Raw["leads"]) {
  let toContact = 0, best: number | null = null, awaiting = 0, contacted = 0;
  let oldestContacted: string | null = null;
  for (const l of leads) {
    const score = l.score == null ? null : Number(l.score);
    if (l.status === "new" && (score ?? 0) >= 60 && !(l.flags ?? []).includes("OFF_PRODUCT")) { toContact++; best = Math.max(best ?? 0, score ?? 0); }
    if (l.status === "contacted" || l.status === "quoted") contacted++;
    if (l.status === "contacted") { awaiting++; if (!oldestContacted || l.updated_at < oldestContacted) oldestContacted = l.updated_at; }
  }
  return { toContact, best, awaiting, oldestContacted, contacted };
}

const productLinks = (asin: string | null, stock: Raw["stock"]) => {
  if (!asin) return [];
  const item = stock.find((s) => s.asin === asin && !s.archived_at);
  return [{ label: "Ads", href: `/ads/dashboard?asin=${asin}` }, ...(item ? [{ label: "Stock", href: `/stock/levels?item=${item.id}` }] : [])];
};

/** Every candidate as a card, and the products selling without one; or just one candidate's card. */
export async function pipelineBoard(now = new Date(), only?: string): Promise<{ cards: PipelineCard[]; card: RateCard }> {
  const [{ candidates, settings, card, adsCpc }, r] = await Promise.all([listCandidates(), raw(only)]);
  const cards: PipelineCard[] = [];
  for (const c of candidates) {
    if (only && c.id !== only) continue;
    const fields = Object.fromEntries(Object.entries(c.fields).map(([k, v]) => [k, v.value]));
    const ev = evaluate(withAdsDefaults(fields, adsCpc), c.category, settings, card, now, c.waivers);
    const stepsDone = r.steps.filter((s) => s.candidate_id === c.id && s.done).map((s) => s.step);
    const quotes = r.quotes.filter((q) => q.candidate_id === c.id);
    const lf = leadFacts(r.leads.filter((l) => l.candidate_id === c.id));
    const stored = isStage(c.pipeline_stage) ? c.pipeline_stage : null;
    const sf: StageFacts = { status: c.status as PlStatus, stored, gates: ev.gates.map((g) => g.status), stepsDone, quotes: quotes.map((q) => q.status), contacted: lf.contacted };
    const stage = stageOf(sf);
    const qf = (q: Raw["quotes"][number]): QuoteFact => ({ supplier: q.supplier_name, status: q.status, unitPrice: q.unit_price == null ? null : Number(q.unit_price), currency: q.currency, moq: q.moq });
    const chosenRow = quotes.find((q) => q.id === c.chosen_quote) ?? quotes.find((q) => q.status === "chosen") ?? null;
    const next = nextAction({
      stage, status: c.status as PlStatus, parkReason: c.park_reason, verdict: { cls: ev.v.cls, title: ev.v.title }, score: ev.sc.total, answered: ev.sc.answered,
      gates: ev.gates.map((g) => ({ n: g.g.n, title: g.g.title, status: g.status })), stepsDone,
      quotes: quotes.filter((q) => q.status !== "rejected").map(qf), chosen: chosenRow ? qf(chosenRow) : null,
      leads: lf, listingAsin: c.listing_asin ?? null, today: today(now),
    });
    const segs = gateBar(ev.gates.map((g) => ({ n: g.g.n, title: g.g.title, status: g.status, rows: g.rows })));
    cards.push({
      id: c.id, kind: "candidate", name: c.name, stage, derived: derivedStage({ ...sf, stored: null }), moved: stored != null && stored !== derivedStage({ ...sf, stored: null }),
      status: c.status as PlStatus, parked: c.status === "parked" || c.status === "dropped",
      verdict: { cls: ev.v.cls, title: ev.v.title }, gates: segs, gatesPassed: ev.passed, gateLabel: gateBarLabel(segs),
      next, detail: next?.detail ?? (c.status === "dropped" ? "Dropped" : ""), asin: c.listing_asin ?? null,
      href: `/pl/candidates?c=${c.id}`, links: stage === "live" ? productLinks(c.listing_asin ?? null, r.stock) : [], updatedAt: c.updated_at,
    });
  }
  if (!only) {
    // Products already selling without a candidate (launched before Private label was in the app).
    const linked = new Set(candidates.map((c) => c.listing_asin).filter(Boolean));
    for (const p of r.ads) {
      if (p.pl_candidate_id || linked.has(p.asin)) continue;
      const item = r.stock.find((s) => s.asin === p.asin && !s.archived_at);
      cards.push({
        id: `asin:${p.asin}`, kind: "product", name: p.title || item?.name || p.asin, stage: "live", derived: "live", moved: false, status: null, parked: false,
        verdict: null, gates: [], gatesPassed: 0, gateLabel: "", next: null,
        detail: `${p.asin} · ${p.phase === "launch" ? "ads in their launch phase" : p.phase === "steady" ? "ads steady" : "in Ads"}`,
        asin: p.asin, href: `/ads/dashboard?asin=${p.asin}`, links: productLinks(p.asin, r.stock), updatedAt: p.updated_at ?? "",
      });
    }
  }
  return { cards, card };
}

export async function pipelineCard(id: string, now = new Date()): Promise<PipelineCard | null> {
  return (await pipelineBoard(now, id)).cards[0] ?? null;
}

/** Move a card to a column (a backwards move is confirmed on the page). The status follows the column. */
export async function moveStage(id: string, to: string): Promise<PipelineCard | null> {
  if (!isStage(to)) throw new Error("Stage must be research, validate, sourcing, launch or live");
  const d = db();
  const c = must(await d.from("pl_candidates").select("status").eq("id", id).maybeSingle(), "candidate") as { status: PlStatus } | null;
  if (!c) throw new Error("No such candidate");
  if (c.status === "parked" || c.status === "dropped") throw new Error(`It's ${c.status}: unpark it first`);
  const status = statusForMove(c.status, to);
  must(await d.from("pl_candidates").update({ pipeline_stage: to, ...(status ? { status } : {}), updated_at: new Date().toISOString() }).eq("id", id), "move");
  return pipelineCard(id);
}

/**
 * After a launch step, a quote, a messaged supplier or a status change: a column you set moves
 * forwards to what the records now prove. Never fails the save that called it.
 */
export async function advanceStage(id: string): Promise<void> {
  try {
    const d = db();
    const c = must(await d.from("pl_candidates").select("status, pipeline_stage").eq("id", id).maybeSingle(), "candidate") as { status: PlStatus; pipeline_stage: string | null } | null;
    if (!c || !isStage(c.pipeline_stage)) return;
    const r = await raw(id);
    const to = advancedStage({
      status: c.status, stored: c.pipeline_stage, gates: [], stepsDone: r.steps.filter((s) => s.done).map((s) => s.step),
      quotes: r.quotes.map((q) => q.status), contacted: leadFacts(r.leads).contacted,
    });
    if (to) must(await d.from("pl_candidates").update({ pipeline_stage: to }).eq("id", id), "advance");
  } catch {
    // The board works it out again next time.
  }
}
