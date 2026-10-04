import "server-only";
import { referralCategoryFor } from "../fees/engine";
import { addDailyTokens, PL_KEEP_DAYS, type TokensByDay } from "../keepaLedger";
import { DEFAULT_BRAND_TERMS, parseBrandTerms } from "../pl/brandTerms";
import { nicheFlags, scoreNiche } from "../pl/nicheScore";
import { parseNichesCsv, type ParsedNiche } from "../pl/poeNiches";
import { activeRateCard, chunks, db, must } from "./db";
import { createCandidate } from "./pl";
import { termCheckPlan, termIncumbentCheck } from "./plHunt";

export type NicheStatus = "new" | "shortlisted" | "dismissed" | "candidate";
export const NICHE_STATUSES: NicheStatus[] = ["new", "shortlisted", "dismissed", "candidate"];

export interface NicheRow {
  id: string; import_id: string; customer_need: string; search_terms: string[]; top_clicked_products: number | null;
  sv_360: number | null; growth_180: number | null; sv_90: number | null; growth_90: number | null;
  units_360_min: number | null; units_360_max: number | null; units_per_product_min: number | null; units_per_product_max: number | null; units_per_product_mid: number | null;
  avg_price: number | null; min_price: number | null; max_price: number | null; return_rate: number | null;
  extra: { aliases?: string[]; incumbents?: unknown }; score: number | null; score_breakdown: unknown; flags: string[];
  shape: "open" | "contested" | "dominated" | null; status: NicheStatus; notes: string | null; candidate_id: string | null;
  created_at: string; updated_at: string;
  /** From its import. */
  category?: string;
}

const now = () => new Date().toISOString();
const NUMS = ["top_clicked_products", "sv_360", "growth_180", "sv_90", "growth_90", "units_360_min", "units_360_max", "units_per_product_min", "units_per_product_max", "units_per_product_mid", "avg_price", "min_price", "max_price", "return_rate", "score"] as const;
const toRow = (r: Record<string, unknown>): NicheRow => {
  const out = { ...r } as Record<string, unknown>;
  for (const k of NUMS) out[k] = r[k] == null ? null : Number(r[k]);
  return out as unknown as NicheRow;
};

/* ===================== the brand list ===================== */

export async function brandTerms(): Promise<string[]> {
  const r = await db().from("pl_niche_settings").select("value").eq("key", "brandTerms").maybeSingle();
  const v = (r.data as { value: string[] } | null)?.value;
  return Array.isArray(v) ? v : DEFAULT_BRAND_TERMS;
}

/** Save the BIG_BRAND list (null: back to the defaults), and re-flag every niche with it. */
export async function saveBrandTerms(text: string | string[] | null): Promise<{ terms: string[]; reflagged: number }> {
  const d = db();
  if (text == null) must(await d.from("pl_niche_settings").delete().eq("key", "brandTerms"), "reset brands");
  else must(await d.from("pl_niche_settings").upsert({ key: "brandTerms", value: parseBrandTerms(text), updated_at: now() }, { onConflict: "key" }), "save brands");
  return { terms: await brandTerms(), reflagged: await reflagNiches() };
}

/** Every niche's flags worked out again (after the brand list or the flag rules change). */
export async function reflagNiches(): Promise<number> {
  const d = db();
  const terms = await brandTerms();
  const rows = (must(await d.from("pl_niches").select("*"), "niches") as Record<string, unknown>[]).map(toRow);
  let reflagged = 0;
  for (const n of rows) {
    const flags = nicheFlags(n, terms);
    if (JSON.stringify(flags) !== JSON.stringify(n.flags)) { must(await d.from("pl_niches").update({ flags, updated_at: now() }).eq("id", n.id), "re-flag"); reflagged++; }
  }
  return reflagged;
}

/* ===================== import ===================== */

const scored = (n: ParsedNiche, brands: string[]) => {
  const s = scoreNiche(n);
  return { score: s.score, score_breakdown: s.breakdown, flags: nicheFlags(n, brands) };
};

/** What an import would bring in: the columns mapped and not, the first rows parsed and scored, and what it replaces. */
export async function previewNicheImport(text: string, category: string) {
  const p = parseNichesCsv(text);
  const brands = await brandTerms();
  const existing = await importsFor(category);
  const rowsThere = existing.length ? ((await db().from("pl_niches").select("id", { count: "exact", head: true }).in("import_id", existing.map((e) => e.id))).count ?? 0) : 0;
  return {
    headerLine: p.headerLine, mapped: p.mapped, unmapped: p.unmapped, warnings: p.warnings, rows: p.rows, niches: p.niches.length, duplicates: p.duplicates,
    sample: p.niches.slice(0, 5).map((n) => ({ ...n, raw_row: undefined, ...scored(n, brands) })),
    replaces: rowsThere,
  };
}

async function importsFor(category: string) {
  const all = must(await db().from("pl_niche_imports").select("id, category"), "imports") as { id: string; category: string }[];
  return all.filter((i) => i.category.trim().toLowerCase() === category.trim().toLowerCase());
}

/**
 * Import a category's download: its previous import is replaced, but a niche whose customer need
 * matches keeps its status, notes, shape, incumbent check, candidate and Keepa ledger.
 */
export async function importNiches(x: { text: string; category: string; filename?: string | null; marketplace?: string | null }) {
  const category = x.category?.trim();
  if (!category) throw new Error("Pick the category this download is for");
  const p = parseNichesCsv(x.text);
  if (!p.niches.length) throw new Error("No niches in the file");
  const d = db();
  const brands = await brandTerms();
  const old = await importsFor(category);
  const kept = new Map<string, Record<string, unknown>>();
  if (old.length) {
    const rows = must(await d.from("pl_niches").select("customer_need, status, notes, shape, candidate_id, extra, keepa_by_day").in("import_id", old.map((o) => o.id)), "old niches") as Record<string, unknown>[];
    for (const r of rows) kept.set(String(r.customer_need).toLowerCase(), r);
  }
  const imp = must(await d.from("pl_niche_imports").insert({
    category, marketplace: x.marketplace?.trim() || "UK", filename: x.filename ?? null, row_count: p.niches.length, unmapped: p.unmapped, duplicates: p.duplicates,
  }).select("id").single(), "import") as { id: string };
  let preserved = 0;
  const rows = p.niches.map((n) => {
    const k = kept.get(n.customer_need.toLowerCase());
    if (k) preserved++;
    const prevExtra = (k?.extra ?? {}) as Record<string, unknown>;
    return {
      import_id: imp.id, customer_need: n.customer_need, search_terms: n.search_terms, top_clicked_products: n.top_clicked_products,
      sv_360: n.sv_360, growth_180: n.growth_180, sv_90: n.sv_90, growth_90: n.growth_90, units_360_min: n.units_360_min, units_360_max: n.units_360_max,
      units_per_product_min: n.units_per_product_min, units_per_product_max: n.units_per_product_max, units_per_product_mid: n.units_per_product_mid,
      avg_price: n.avg_price, min_price: n.min_price, max_price: n.max_price, return_rate: n.return_rate,
      extra: { ...(prevExtra.incumbents ? { incumbents: prevExtra.incumbents } : {}), aliases: n.aliases }, raw_row: n.raw_row,
      ...scored(n, brands),
      status: (k?.status as string) ?? "new", notes: (k?.notes as string | null) ?? null, shape: (k?.shape as string | null) ?? null,
      candidate_id: (k?.candidate_id as string | null) ?? null, keepa_by_day: (k?.keepa_by_day as TokensByDay) ?? {},
    };
  });
  for (const c of chunks(rows, 200)) must(await d.from("pl_niches").insert(c), "save niches");
  if (old.length) must(await d.from("pl_niche_imports").delete().in("id", old.map((o) => o.id)), "replace the old import");
  return { importId: imp.id, category, niches: rows.length, duplicates: p.duplicates, preserved, replaced: old.length > 0, unmapped: p.unmapped };
}

/* ===================== reading and acting ===================== */

export async function listNiches() {
  const d = db();
  const [imports, niches] = await Promise.all([
    d.from("pl_niche_imports").select("id, category, marketplace, filename, imported_at, row_count, unmapped, duplicates").order("imported_at", { ascending: false }),
    d.from("pl_niches").select("id, import_id, customer_need, search_terms, top_clicked_products, sv_360, growth_180, sv_90, growth_90, units_360_min, units_360_max, units_per_product_min, units_per_product_max, units_per_product_mid, avg_price, min_price, max_price, return_rate, extra, score, score_breakdown, flags, shape, status, notes, candidate_id, created_at, updated_at").range(0, 9999),
  ]);
  const imps = must(imports, "imports") as { id: string; category: string; imported_at: string; row_count: number; filename: string | null; unmapped: string[]; duplicates: number; marketplace: string }[];
  const cat = new Map(imps.map((i) => [i.id, i.category]));
  return { imports: imps, niches: (must(niches, "niches") as Record<string, unknown>[]).map(toRow).map((n) => ({ ...n, category: cat.get(n.import_id) ?? "" })) };
}

export async function updateNiche(id: string, patch: { status?: string; notes?: string | null }) {
  const row: Record<string, unknown> = { updated_at: now() };
  if (patch.status !== undefined) {
    if (!NICHE_STATUSES.includes(patch.status as NicheStatus)) throw new Error("Status: new, shortlisted, dismissed or candidate");
    row.status = patch.status;
  }
  if (patch.notes !== undefined) row.notes = patch.notes?.trim().slice(0, 4000) || null;
  return toRow(must(await db().from("pl_niches").update(row).eq("id", id).select("*").single(), "update niche") as Record<string, unknown>);
}

export async function bulkNicheStatus(ids: string[], status: "shortlisted" | "dismissed" | "new") {
  if (!["shortlisted", "dismissed", "new"].includes(status)) throw new Error("Shortlist, dismiss or reset");
  for (const c of chunks([...new Set(ids)], 200)) must(await db().from("pl_niches").update({ status, updated_at: now() }).in("id", c).neq("status", "candidate"), "bulk status");
  return { updated: ids.length };
}

const pct = (g: number | null) => (g == null ? "—" : `${g >= 0 ? "+" : ""}${(g * 100).toFixed(1)}%`);

/**
 * A Private label candidate from a niche: named after the customer need, its first search term as
 * the niche keyword, and the import's category as its fee category (Opportunity Explorer's "DIY &
 * Tools" is the rate card's "Tools and Home Improvement"). The niche links to it.
 */
export async function nicheToCandidate(id: string) {
  const d = db();
  const n = toRow(must(await d.from("pl_niches").select("*").eq("id", id).single(), "niche") as Record<string, unknown>);
  if (n.candidate_id) {
    const still = (await d.from("pl_candidates").select("id").eq("id", n.candidate_id).maybeSingle()).data;
    if (still) return { candidateId: n.candidate_id, existed: true };
  }
  const imp = must(await d.from("pl_niche_imports").select("category").eq("id", n.import_id).single(), "import") as { category: string };
  const card = await activeRateCard();
  const category = referralCategoryFor(imp.category, card);
  const c = await createCandidate({ name: n.customer_need, niche_keyword: n.search_terms[0] ?? n.customer_need, category, asins: [] });
  const note = `From Opportunity Explorer (${imp.category}, Niche Import): search volume ${n.sv_360?.toLocaleString("en-GB") ?? "—"} a year, growth ${pct(n.growth_180)} over 180 days, average price £${n.avg_price?.toFixed(2) ?? "—"}, ${n.top_clicked_products ?? "—"} top-clicked products, ~${n.units_per_product_mid?.toLocaleString("en-GB") ?? "—"} units a product a year. Score ${n.score}${n.flags.length ? `, flags ${n.flags.join(", ")}` : ""}${n.shape ? `, incumbents ${n.shape}` : ""}. Search terms: ${n.search_terms.join(", ")}.`;
  must(await d.from("pl_candidates").update({ notes: note }).eq("id", c.id), "candidate notes");
  must(await d.from("pl_niches").update({ status: "candidate", candidate_id: c.id, updated_at: now() }).eq("id", id), "link candidate");
  return { candidateId: c.id, existed: false, category };
}

/** What an incumbent check on this niche's first search term would cost, and whether it can run now. */
export async function nicheCheckPlan(id: string) {
  const n = must(await db().from("pl_niches").select("search_terms, customer_need").eq("id", id).single(), "niche") as { search_terms: string[]; customer_need: string };
  return { term: n.search_terms[0] ?? n.customer_need, ...(await termCheckPlan()) };
}

/** Run the incumbent check on the niche's first search term; its shape and the incumbents go on the row. */
export async function checkNicheIncumbents(id: string) {
  const d = db();
  const n = must(await d.from("pl_niches").select("search_terms, customer_need, extra, keepa_by_day").eq("id", id).single(), "niche") as { search_terms: string[]; customer_need: string; extra: Record<string, unknown>; keepa_by_day: TokensByDay | null };
  const term = n.search_terms[0] ?? n.customer_need;
  const r = await termIncumbentCheck(term);
  must(await d.from("pl_niches").update({
    shape: r.shape, extra: { ...(n.extra ?? {}), incumbents: r }, keepa_by_day: addDailyTokens(n.keepa_by_day, r.tokensUsed, new Date(), PL_KEEP_DAYS), updated_at: now(),
  }).eq("id", id), "save the check");
  return r;
}

/** For Home and the page's strip. */
export async function nicheSummary() {
  const res = await db().from("pl_niches").select("status, shape, score, keepa_by_day");
  const rows = (res.error ? [] : res.data) as { status: string; shape: string | null; score: number | null; keepa_by_day: TokensByDay | null }[];
  return { total: rows.length, shortlisted: rows.filter((r) => r.status === "shortlisted").length, checked: rows.filter((r) => r.shape).length, scoring60: rows.filter((r) => Number(r.score) >= 60).length, ledgers: rows.map((r) => r.keepa_by_day) };
}
