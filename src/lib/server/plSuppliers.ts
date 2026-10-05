import "server-only";
import { DEFAULT_RFQ_TEMPLATE, renderRfq, rfqVars } from "../pl/rfqTemplate";
import { maxMoqOf, productUnitOf, productWords, scoreSupplier, targetExworks, type LeadInput, type SupplierFlag, type SupplierTargets } from "../pl/supplierScore";
import { allRows, chunks, db, must } from "./db";
import { createQuote } from "./plQuotes";

export type LeadStatus = "new" | "contacted" | "quoted" | "rejected";
export const LEAD_STATUSES: LeadStatus[] = ["new", "contacted", "quoted", "rejected"];

export interface SupplierLead {
  id: string; candidate_id: string; source: string; listing_url: string; store_url: string | null; title: string | null;
  price_min: number | null; price_max: number | null; currency: string | null; price_unit: string | null;
  moq: number | null; moq_unit: string | null; supplier_name: string | null; supplier_years: number | null; country: string | null;
  rating: number | null; review_count: number | null; badges: string[]; sold_count: number | null; delivery_estimate: string | null;
  captured_at: string; score: number | null;
  score_breakdown: { parts: ReturnType<typeof scoreSupplier>["breakdown"]; perUnit: number | null; moqOurs: number | null; unit: string } | null;
  flags: SupplierFlag[]; status: LeadStatus; notes: string | null; reject_reason: string | null; created_at: string; updated_at: string;
}

/** A card as the extension's parser reads it (extension/alibaba-parse.js). */
export interface CapturedCard {
  listingUrl: string; title: string; priceMin: number | null; priceMax: number | null; currency: string | null;
  priceUnit: string | null; priceUnitFrom?: string | null; moq: number | null; moqUnit: string | null;
  supplierName: string | null; storeUrl: string | null; supplierYears: number | null; country: string | null;
  rating: number | null; reviewCount: number | null; supplierStars?: number | null; badges: string[]; soldCount: number | null; delivery: string | null; productId?: string | null;
}

const COLS = "id, candidate_id, source, listing_url, store_url, title, price_min, price_max, currency, price_unit, moq, moq_unit, supplier_name, supplier_years, country, rating, review_count, badges, sold_count, delivery_estimate, captured_at, score, score_breakdown, flags, status, notes, reject_reason, created_at, updated_at";
const NUMS = ["price_min", "price_max", "rating", "score"] as const;
const now = () => new Date().toISOString();
const toLead = (r: Record<string, unknown>): SupplierLead => {
  const o = { ...r } as Record<string, unknown>;
  for (const k of NUMS) o[k] = r[k] == null ? null : Number(r[k]);
  return o as unknown as SupplierLead;
};

/* ===================== targets and scores ===================== */

/** What a candidate's listings are scored against: Gate 6's targets and its product words. */
export async function targetsFor(candidateId: string): Promise<SupplierTargets & { exworksDerived: boolean }> {
  const d = db();
  const c = must(await d.from("pl_candidates").select("name, niche_keyword").eq("id", candidateId).single(), "candidate") as { name: string; niche_keyword: string | null };
  const rows = must(await d.from("pl_candidate_fields").select("key, value").eq("candidate_id", candidateId).in("key", ["landed", "targetExworks", "maxMoq", "productUnit"]), "fields") as { key: string; value: string }[];
  const f = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const t = targetExworks(f);
  return { exworks: t.value, exworksDerived: t.derived, maxMoq: maxMoqOf(f), unit: productUnitOf(f), words: productWords(c.name, c.niche_keyword) };
}

const inputOf = (r: { title: string | null; price_min: number | null; price_max: number | null; currency: string | null; price_unit: string | null; moq: number | null; moq_unit: string | null; supplier_name: string | null; supplier_years: number | null; rating: number | null; review_count: number | null; badges: string[] | null }): LeadInput => ({
  title: r.title, priceMin: r.price_min == null ? null : Number(r.price_min), priceMax: r.price_max == null ? null : Number(r.price_max), currency: r.currency,
  priceUnit: r.price_unit, moq: r.moq, moqUnit: r.moq_unit, supplierName: r.supplier_name, supplierYears: r.supplier_years,
  rating: r.rating == null ? null : Number(r.rating), reviewCount: r.review_count, badges: r.badges ?? [],
});

function scored(input: LeadInput, t: SupplierTargets) {
  const s = scoreSupplier(input, t);
  return { score: s.score, score_breakdown: { parts: s.breakdown, perUnit: s.perUnit, moqOurs: s.moqOurs, unit: t.unit }, flags: s.flags };
}

/** Every listing of the candidate scored again (after its targets or product words change). */
export async function rescoreLeads(candidateId: string): Promise<number> {
  const d = db();
  const t = await targetsFor(candidateId);
  const rows = await allRows<SupplierLead>((a, b) => d.from("pl_supplier_leads").select(COLS).eq("candidate_id", candidateId).order("id").range(a, b), "supplier leads");
  for (const r of rows) must(await d.from("pl_supplier_leads").update({ ...scored(inputOf(r), t), updated_at: now() }).eq("id", r.id), "rescore");
  return rows.length;
}

/* ===================== capture ===================== */

const str = (v: unknown, max = 500) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const n = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const int = (v: unknown) => { const x = n(v); return x == null ? null : Math.round(x); };

/** A card checked: an Alibaba listing URL and a title, the rest as read (or null). */
export function cleanCard(x: unknown): CapturedCard | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const url = str(o.listingUrl, 1000);
  if (!url || !/^https:\/\/([a-z0-9-]+\.)*alibaba\.com\//i.test(url)) return null;
  const title = str(o.title, 500);
  if (!title) return null;
  const store = str(o.storeUrl, 1000);
  return {
    listingUrl: url, title, priceMin: n(o.priceMin), priceMax: n(o.priceMax), currency: str(o.currency, 8), priceUnit: str(o.priceUnit, 30), priceUnitFrom: str(o.priceUnitFrom, 10),
    moq: int(o.moq), moqUnit: str(o.moqUnit, 30), supplierName: str(o.supplierName, 200), storeUrl: store && /^https:\/\/([a-z0-9-]+\.)*alibaba\.com\//i.test(store) ? store : null,
    supplierYears: int(o.supplierYears), country: str(o.country, 4), rating: n(o.rating), reviewCount: int(o.reviewCount), supplierStars: int(o.supplierStars),
    badges: Array.isArray(o.badges) ? o.badges.filter((b): b is string => typeof b === "string").slice(0, 10) : [], soldCount: int(o.soldCount), delivery: str(o.delivery, 100), productId: str(o.productId, 40),
  };
}

/**
 * Cards sent from an Alibaba results page into the candidate's leads: one per listing URL. A
 * listing already captured gets its price, MOQ, sold count and the rest updated and keeps your
 * status and notes; a new one is added. Everything is scored against the candidate's targets.
 */
export async function saveCapturedLeads(candidateId: string, input: unknown[]): Promise<{ added: number; updated: number; skipped: number; total: number }> {
  const d = db();
  const cards = new Map<string, CapturedCard>();
  let skipped = 0;
  for (const x of input.slice(0, 500)) {
    const c = cleanCard(x);
    if (c) cards.set(c.listingUrl, c); else skipped++;
  }
  if (!cards.size) throw new Error("No supplier listings in the capture");
  const t = await targetsFor(candidateId);
  const existing = new Map<string, string>();
  for (const c of chunks([...cards.keys()])) {
    const rows = must(await d.from("pl_supplier_leads").select("id, listing_url").eq("candidate_id", candidateId).in("listing_url", c), "existing leads") as { id: string; listing_url: string }[];
    for (const r of rows) existing.set(r.listing_url, r.id);
  }
  let added = 0, updated = 0;
  const at = now();
  const inserts: Record<string, unknown>[] = [];
  for (const c of cards.values()) {
    const row = {
      title: c.title, store_url: c.storeUrl, price_min: c.priceMin, price_max: c.priceMax, currency: c.currency, price_unit: c.priceUnit,
      moq: c.moq, moq_unit: c.moqUnit, supplier_name: c.supplierName, supplier_years: c.supplierYears, country: c.country,
      rating: c.rating, review_count: c.reviewCount, badges: c.badges, sold_count: c.soldCount, delivery_estimate: c.delivery,
      captured_at: at, raw: c, updated_at: at,
    };
    const s = scored(inputOf(row), t);
    const id = existing.get(c.listingUrl);
    if (id) {
      must(await d.from("pl_supplier_leads").update({ ...row, ...s }).eq("id", id), "update lead");
      updated++;
    } else {
      inserts.push({ candidate_id: candidateId, source: "alibaba", listing_url: c.listingUrl, ...row, ...s });
      added++;
    }
  }
  for (const c of chunks(inserts, 200)) must(await d.from("pl_supplier_leads").insert(c), "add leads");
  const total = (await d.from("pl_supplier_leads").select("id", { count: "exact", head: true }).eq("candidate_id", candidateId)).count ?? added + updated;
  return { added, updated, skipped, total };
}

/* ===================== reading and acting ===================== */

/** Leads, best first: one candidate's, or every candidate's (with the candidate's name). */
export async function listLeads(candidateId?: string | null): Promise<(SupplierLead & { candidate_name?: string })[]> {
  const d = db();
  const rows = await allRows<Record<string, unknown>>((a, b) => {
    let q = d.from("pl_supplier_leads").select(COLS);
    if (candidateId) q = q.eq("candidate_id", candidateId);
    return q.order("score", { ascending: false, nullsFirst: false }).order("id").range(a, b);
  }, "supplier leads");
  const leads = rows.map(toLead);
  if (candidateId) return leads;
  const names = new Map((must(await d.from("pl_candidates").select("id, name"), "candidates") as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  return leads.map((l) => ({ ...l, candidate_name: names.get(l.candidate_id) ?? "" }));
}

/** The strip: captured, scoring 60+, contacted, quoted, and the ones to contact (new, 60+, on the product). */
export function leadSummary(leads: Pick<SupplierLead, "score" | "status" | "flags">[]) {
  return {
    captured: leads.length,
    scoring60: leads.filter((l) => (l.score ?? 0) >= 60).length,
    contacted: leads.filter((l) => l.status === "contacted").length,
    quoted: leads.filter((l) => l.status === "quoted").length,
    toContact: leads.filter((l) => l.status === "new" && (l.score ?? 0) >= 60 && !l.flags.includes("OFF_PRODUCT")).length,
  };
}

/** For Home: the leads to contact across every candidate (counted from the scores and statuses). */
export async function supplierSummary() {
  const d = db();
  const rows = await allRows<{ score: number | null; status: LeadStatus; flags: SupplierFlag[] }>((a, b) => d.from("pl_supplier_leads").select("id, score, status, flags").order("id").range(a, b), "lead summary");
  return leadSummary(rows.map((r) => ({ ...r, score: r.score == null ? null : Number(r.score) })));
}

/** Status, notes, or a rejection with its reason. */
export async function updateLead(id: string, patch: { status?: LeadStatus; notes?: string | null; reject_reason?: string | null }) {
  const upd: Record<string, unknown> = { updated_at: now() };
  if (patch.status != null) {
    if (!LEAD_STATUSES.includes(patch.status)) throw new Error(`Status must be one of ${LEAD_STATUSES.join(", ")}`);
    upd.status = patch.status;
    if (patch.status === "rejected") {
      const why = patch.reject_reason?.trim();
      if (!why) throw new Error("Give a reason to reject it");
      upd.reject_reason = why.slice(0, 500);
    } else upd.reject_reason = null;
  }
  if (patch.notes !== undefined) upd.notes = patch.notes?.trim() ? patch.notes.slice(0, 4000) : null;
  return toLead(must(await db().from("pl_supplier_leads").update(upd).eq("id", id).select(COLS).single(), "update lead") as Record<string, unknown>);
}

/**
 * A quote started from a lead, in the candidate's Quotes: the supplier, the price per unit of our
 * product (in £ when it converts, else the listing's own) and the MOQ, with the links in its notes.
 * The lead becomes "quoted".
 */
export async function quoteFromLead(id: string) {
  const l = toLead(must(await db().from("pl_supplier_leads").select(COLS).eq("id", id).single(), "lead") as Record<string, unknown>);
  const b = l.score_breakdown;
  const perUnit = b?.perUnit ?? null;
  const q = await createQuote(l.candidate_id, {
    supplier_name: l.supplier_name ?? "Alibaba supplier", source: "Alibaba", contact: l.store_url, status: "requested",
    unit_price: perUnit ?? l.price_max ?? l.price_min, currency: perUnit != null ? "GBP" : l.currency && ["USD", "GBP", "CNY", "EUR"].includes(l.currency) ? l.currency : "GBP",
    moq: b?.moqOurs ?? l.moq,
    notes: [`From Supplier Scout: ${l.title ?? ""}`, l.listing_url, perUnit == null ? `Listed at ${l.price_min ?? "?"}–${l.price_max ?? "?"} ${l.currency ?? ""} per ${l.price_unit ?? "?"}: check the unit` : null].filter(Boolean).join("\n"),
  });
  await updateLead(id, { status: "quoted" });
  return q;
}

/* ===================== the RFQ ===================== */

export async function rfqTemplate(): Promise<string> {
  const r = (await db().from("pl_text_settings").select("value").eq("key", "rfqTemplate").maybeSingle()).data as { value: string } | null;
  return r?.value?.trim() ? r.value : DEFAULT_RFQ_TEMPLATE;
}

/** Save the RFQ template (null: back to the default). */
export async function saveRfqTemplate(text: string | null): Promise<string> {
  const d = db();
  if (text == null || !text.trim()) must(await d.from("pl_text_settings").delete().eq("key", "rfqTemplate"), "reset RFQ template");
  else must(await d.from("pl_text_settings").upsert({ key: "rfqTemplate", value: text.slice(0, 10000), updated_at: now() }, { onConflict: "key" }), "save RFQ template");
  return rfqTemplate();
}

/** The candidate's RFQ, from the template. */
export async function rfqFor(candidateId: string): Promise<{ text: string; missing: string[] }> {
  const d = db();
  const c = must(await d.from("pl_candidates").select("name, niche_keyword").eq("id", candidateId).single(), "candidate") as { name: string; niche_keyword: string | null };
  const rows = must(await d.from("pl_candidate_fields").select("key, value").eq("candidate_id", candidateId).in("key", ["sixWordsText", "spec", "landed", "targetExworks", "maxMoq", "productUnit"]), "fields") as { key: string; value: string }[];
  const f = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const t = targetExworks(f);
  const text = renderRfq(await rfqTemplate(), rfqVars(c, f, t.value, maxMoqOf(f), productUnitOf(f)));
  const missing = [!f.sixWordsText && "Gate 4's six words", t.value == null && "a target ex-works price (Gate 6, or Gate 0's landed cost)", !f.spec && "the spec (Gate 6)"].filter((x): x is string => !!x);
  return { text, missing };
}

/** Which Gate fields change the scores. */
export const SCORING_KEYS = new Set(["landed", "targetExworks", "maxMoq", "productUnit"]);

/** The candidates leads can be sent to (not dropped), newest first, for the extension's picker. */
export async function leadCandidates() {
  return (must(await db().from("pl_candidates").select("id, name, niche_keyword, status").neq("status", "dropped").order("updated_at", { ascending: false }), "candidates") as { id: string; name: string; niche_keyword: string | null; status: string }[])
    .map((c) => ({ id: c.id, name: c.name, niche_keyword: c.niche_keyword }));
}
