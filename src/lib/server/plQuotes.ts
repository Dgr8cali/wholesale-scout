import "server-only";
import { LAUNCH_STEPS, STEP_KEYS, statusFromSteps, type LaunchStep, type PlStatus } from "../pl/launch";
import type { Fill } from "../pl/fill";
import { CURRENCIES, QUOTE_SOURCES, QUOTE_STATUSES, landedCost, type LandedInputs, type Quote } from "../pl/quotes";
import { adsDashboard, saveAdsProduct } from "./ads";
import { ensureStockItemForAsin } from "./stock";
import { businessSettings } from "./business";
import { db, must } from "./db";
import { applyAuto } from "./pl";

const now = () => new Date().toISOString();
const isAsin = (s: unknown): s is string => typeof s === "string" && /^[A-Z0-9]{10}$/.test(s);
const numOrNull = (v: unknown) => (v === "" || v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/* ===================== quotes ===================== */

const QUOTE_COLS = "id, candidate_id, supplier_name, source, contact, unit_price, currency, moq, lead_time_days, sample_cost, sample_lead_days, notes, status, calc, created_at, updated_at";
const toQuote = (r: Record<string, unknown>): Quote => ({
  ...(r as unknown as Quote),
  unit_price: numOrNull(r.unit_price), moq: numOrNull(r.moq), lead_time_days: numOrNull(r.lead_time_days),
  sample_cost: numOrNull(r.sample_cost), sample_lead_days: numOrNull(r.sample_lead_days), calc: (r.calc as Quote["calc"]) ?? {},
});

export async function listQuotes(candidateId?: string): Promise<Quote[]> {
  let q = db().from("pl_quotes").select(QUOTE_COLS).order("created_at");
  if (candidateId) q = q.eq("candidate_id", candidateId);
  return (must(await q, "quotes") as Record<string, unknown>[]).map(toQuote);
}

/** A quote's fields as sent by the page, checked; only those present change. */
function quotePatch(x: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (x.supplier_name !== undefined) out.supplier_name = String(x.supplier_name ?? "").trim().slice(0, 120) || "Supplier";
  if (x.source !== undefined) { if (!QUOTE_SOURCES.includes(x.source as never)) throw new Error(`Source: ${QUOTE_SOURCES.join(", ")}`); out.source = x.source; }
  if (x.currency !== undefined) { if (!CURRENCIES.includes(x.currency as never)) throw new Error(`Currency: ${CURRENCIES.join(", ")}`); out.currency = x.currency; }
  if (x.status !== undefined) { if (!QUOTE_STATUSES.includes(x.status as never)) throw new Error(`Status: ${QUOTE_STATUSES.join(", ")}`); out.status = x.status; }
  for (const k of ["contact", "notes"] as const) if (x[k] !== undefined) out[k] = String(x[k] ?? "").trim().slice(0, 2000) || null;
  for (const k of ["unit_price", "sample_cost"] as const) if (x[k] !== undefined) { const v = numOrNull(x[k]); if (v != null && v < 0) throw new Error(`${k} can't be negative`); out[k] = v; }
  for (const k of ["moq", "lead_time_days", "sample_lead_days"] as const) if (x[k] !== undefined) { const v = numOrNull(x[k]); out[k] = v == null ? null : Math.max(0, Math.round(v)); }
  if (x.calc !== undefined) {
    const c = (x.calc ?? {}) as Record<string, unknown>;
    const calc: Partial<LandedInputs> = {};
    for (const k of ["units", "fx", "freight", "dutyPct", "inspection", "other"] as const) { const v = numOrNull(c[k]); if (v != null && v >= 0) calc[k] = v; }
    if (typeof c.vat === "boolean") calc.vat = c.vat;
    out.calc = calc;
  }
  return out;
}

export async function createQuote(candidateId: string, input: Record<string, unknown>): Promise<Quote> {
  const row = { candidate_id: candidateId, supplier_name: "Supplier", ...quotePatch(input) };
  return toQuote(must(await db().from("pl_quotes").insert(row).select(QUOTE_COLS).single(), "add quote") as Record<string, unknown>);
}

export async function updateQuote(id: string, input: Record<string, unknown>): Promise<Quote> {
  return toQuote(must(await db().from("pl_quotes").update({ ...quotePatch(input), updated_at: now() }).eq("id", id).select(QUOTE_COLS).single(), "save quote") as Record<string, unknown>);
}

export async function deleteQuote(id: string) {
  must(await db().from("pl_quotes").delete().eq("id", id), "delete quote");
}

async function quoteOrThrow(id: string): Promise<Quote> {
  const r = must(await db().from("pl_quotes").select(QUOTE_COLS).eq("id", id).maybeSingle(), "quote") as Record<string, unknown> | null;
  if (!r) throw new Error("No such quote");
  return toQuote(r);
}

const fmt = (v: number) => v.toFixed(2);

/**
 * Write a quote's figures into the candidate: Gate 0's landed cost per unit ("landed"), or Gate 7's
 * first order (units, with the landed cost, so its stock line is the quote's total cash). Written
 * with source "quote"; a value you typed yourself stays.
 */
export async function applyQuote(id: string, to: "gate0" | "gate7"): Promise<{ written: string[]; kept: string[]; perUnit: number; total: number; units: number }> {
  const q = await quoteOrThrow(id);
  const l = landedCost(q);
  if (!l) throw new Error("The quote needs a unit price, units and an FX rate");
  // VAT registered: the import VAT is reclaimed, so it isn't part of the landed cost (it's still cash on the day).
  const reg = (await businessSettings()).vatRegistered;
  const perUnit = reg ? l.perUnitExVat : l.perUnit;
  const why = `${q.supplier_name}: £${fmt(l.total)} for ${l.units} units${reg && l.vat ? `, less £${fmt(l.vat)} import VAT (reclaimed)` : ""}`;
  const fill: Fill = to === "gate0"
    ? { landed: { value: fmt(perUnit), why } }
    : { units: { value: String(l.units), why: `${q.supplier_name}'s first order` }, landed: { value: fmt(perUnit), why } };
  const written = await applyAuto(q.candidate_id, fill, "quote");
  return { written, kept: Object.keys(fill).filter((k) => !written.includes(k)), perUnit, total: l.total, units: l.units };
}

/** Choose a quote: it's "chosen", the others "rejected" (unless kept), and its landed cost is stored on the candidate. */
export async function chooseQuote(id: string, rejectOthers = true): Promise<{ chosenLanded: number | null }> {
  const q = await quoteOrThrow(id);
  const l = landedCost(q);
  const reg = (await businessSettings()).vatRegistered;
  const perUnit = l ? (reg ? l.perUnitExVat : l.perUnit) : null;
  const d = db();
  must(await d.from("pl_quotes").update({ status: "chosen", updated_at: now() }).eq("id", id), "choose quote");
  if (rejectOthers) must(await d.from("pl_quotes").update({ status: "rejected", updated_at: now() }).eq("candidate_id", q.candidate_id).neq("id", id), "reject others");
  else must(await d.from("pl_quotes").update({ status: "received", updated_at: now() }).eq("candidate_id", q.candidate_id).neq("id", id).eq("status", "chosen"), "unchoose");
  must(await d.from("pl_candidates").update({ chosen_quote: id, chosen_landed: perUnit, updated_at: now() }).eq("id", q.candidate_id), "store chosen landed");
  return { chosenLanded: perUnit };
}

/* ===================== launch ===================== */

export async function launchSteps(candidateId: string): Promise<LaunchStep[]> {
  const rows = must(await db().from("pl_launch_steps").select("step, done, done_on, note, spend").eq("candidate_id", candidateId), "launch steps") as LaunchStep[];
  return rows.map((r) => ({ ...r, spend: numOrNull(r.spend) }));
}

/** Tick, date, note or cost a step; the candidate's status follows the checklist forwards. */
export async function setLaunchStep(candidateId: string, step: string, patch: { done?: boolean; done_on?: string | null; note?: string | null; spend?: number | string | null }) {
  if (!STEP_KEYS.includes(step)) throw new Error(`No step "${step}"`);
  const d = db();
  const cur = (await launchSteps(candidateId)).find((s) => s.step === step);
  const done = patch.done ?? cur?.done ?? false;
  const dateOk = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const row = {
    candidate_id: candidateId, step, done,
    done_on: patch.done_on !== undefined ? (dateOk(patch.done_on) ? patch.done_on : null) : done && !cur?.done_on ? now().slice(0, 10) : cur?.done_on ?? null,
    note: patch.note !== undefined ? (String(patch.note ?? "").trim().slice(0, 500) || null) : cur?.note ?? null,
    spend: patch.spend !== undefined ? numOrNull(patch.spend) : cur?.spend ?? null,
    updated_at: now(),
  };
  must(await d.from("pl_launch_steps").upsert(row, { onConflict: "candidate_id,step" }), "save step");
  const steps = await launchSteps(candidateId);
  const c = must(await d.from("pl_candidates").select("status").eq("id", candidateId).single(), "candidate") as { status: PlStatus };
  const status = statusFromSteps(c.status, steps);
  if (status !== c.status) must(await d.from("pl_candidates").update({ status, updated_at: now() }).eq("id", candidateId), "status");
  return { steps, status };
}

/**
 * The candidate's own listing: set, it becomes (or joins) an Ads product carrying the candidate's
 * landed cost, so profit after ads shows on the candidate and on the Ads dashboard, and it shares
 * that ASIN's stock item (Stock), made if missing.
 */
export async function setListingAsin(candidateId: string, asin: string | null) {
  const a = asin?.trim().toUpperCase() || null;
  if (a && !isAsin(a)) throw new Error("An ASIN is 10 letters and digits");
  const d = db();
  const c = must(await d.from("pl_candidates").select("name, chosen_landed").eq("id", candidateId).single(), "candidate") as { name: string; chosen_landed: number | null };
  must(await d.from("pl_candidates").update({ listing_asin: a, updated_at: now() }).eq("id", candidateId), "listing ASIN");
  if (!a) return;
  const landedField = (must(await d.from("pl_candidate_fields").select("value").eq("candidate_id", candidateId).eq("key", "landed"), "landed") as { value: string }[])[0]?.value;
  const landed = c.chosen_landed != null ? Number(c.chosen_landed) : landedField ? Number(landedField) : null;
  const cur = (must(await d.from("ads_products").select("title, landed_cost").eq("asin", a), "ads product") as { title: string | null; landed_cost: number | null }[])[0];
  await saveAdsProduct(a, { ...(cur?.title ? {} : { title: c.name }), ...(cur?.landed_cost != null || landed == null ? {} : { landed_cost: landed }) });
  must(await d.from("ads_products").update({ pl_candidate_id: candidateId }).eq("asin", a), "link ads product");
  // The same stock item as the Ads product (by ASIN), made now if there isn't one.
  await ensureStockItemForAsin(a, { name: c.name, unitCost: landed });
}

/** The listing's ads figures from the Ads dashboard (empty until campaigns for it are imported). */
export async function adsSummary(asin: string | null) {
  if (!asin) return null;
  const dash = await adsDashboard([asin]);
  const a = dash.asins.find((x) => x.asin === asin);
  if (!a) return { asin, campaigns: 0, spend: null, sales: null, acos: null, breakEvenAcos: null, profitAfterAds: null };
  return { asin, campaigns: a.campaigns, spend: a.totals.cost, sales: a.totals.sales, acos: a.ratios.acos, breakEvenAcos: a.economics.breakEvenAcos, profitAfterAds: a.profitAfterAds };
}

/** Everything the Quotes and Launch sections show for a candidate. */
export async function candidateExtras(candidateId: string) {
  const d = db();
  const [quotes, steps, c] = await Promise.all([
    listQuotes(candidateId), launchSteps(candidateId),
    d.from("pl_candidates").select("listing_asin, chosen_quote, chosen_landed, status").eq("id", candidateId).single(),
  ]);
  const cand = must(c, "candidate") as { listing_asin: string | null; chosen_quote: string | null; chosen_landed: number | null; status: PlStatus };
  return { quotes, steps, stepDefs: LAUNCH_STEPS, listingAsin: cand.listing_asin, chosenQuote: cand.chosen_quote, chosenLanded: numOrNull(cand.chosen_landed), ads: await adsSummary(cand.listing_asin) };
}

/** Per candidate, for the lists: quotes, the chosen landed cost, the next launch step. */
export async function candidatesOverview() {
  const d = db();
  const [cands, quotes, steps] = await Promise.all([
    d.from("pl_candidates").select("id, name, status, listing_asin, chosen_landed").order("created_at", { ascending: false }),
    d.from("pl_quotes").select("candidate_id, status"),
    d.from("pl_launch_steps").select("candidate_id, step, done, done_on, note, spend"),
  ]);
  const q = must(quotes, "quotes") as { candidate_id: string; status: string }[];
  const s = must(steps, "steps") as (LaunchStep & { candidate_id: string })[];
  return (must(cands, "candidates") as { id: string; name: string; status: PlStatus; listing_asin: string | null; chosen_landed: number | null }[]).map((c) => {
    const mine = s.filter((x) => x.candidate_id === c.id);
    const done = new Set(mine.filter((x) => x.done).map((x) => x.step));
    const next = LAUNCH_STEPS.find((x) => !done.has(x.key)) ?? null;
    return { ...c, chosen_landed: numOrNull(c.chosen_landed), quotes: q.filter((x) => x.candidate_id === c.id).length, stepsDone: done.size, nextStep: next?.label ?? null };
  });
}
