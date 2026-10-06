import "server-only";
import { feeCategoryFor, keepaRootsFor, matchPoeCategory } from "../pl/poeCategories";
import { DEFAULT_OFF_NICHE, parseWordList } from "../pl/offNiche";
import { bestTermConversion, termSignal, type ConvTerm, type TermSignal } from "../pl/termConversion";
import { addDailyTokens, PL_KEEP_DAYS, type TokensByDay } from "../keepaLedger";
import { DEFAULT_BRAND_TERMS, parseBrandTerms } from "../pl/brandTerms";
import { nicheFlags, scoreNiche } from "../pl/nicheScore";
import { parseNichesCsv, type ParsedNiche } from "../pl/poeNiches";
import { mergeGroup, nicheKey, type MergeRow } from "../pl/nicheMerge";
import { activeRateCard, allRows, chunks, db, must } from "./db";
import { applyAuto, createCandidate } from "./pl";
import { reclassifyCandidates, reusable, termCheckPlan, termIncumbentCheck } from "./plHunt";

export type NicheStatus = "new" | "shortlisted" | "dismissed" | "candidate";
export const NICHE_STATUSES: NicheStatus[] = ["new", "shortlisted", "dismissed", "candidate"];

export interface NicheRow {
  id: string; import_id: string; customer_need: string; search_terms: string[]; top_clicked_products: number | null;
  sv_360: number | null; growth_180: number | null; sv_90: number | null; growth_90: number | null;
  units_360_min: number | null; units_360_max: number | null; units_per_product_min: number | null; units_per_product_max: number | null; units_per_product_mid: number | null;
  avg_price: number | null; min_price: number | null; max_price: number | null; return_rate: number | null;
  extra: { aliases?: string[]; incumbents?: unknown; poe?: NichePoe }; score: number | null; score_breakdown: unknown; flags: string[];
  shape: "open" | "contested" | "dominated" | null; status: NicheStatus; notes: string | null; candidate_id: string | null;
  /** Every category whose download had it (the same niche in two categories is one row). */
  categories: string[];
  /** Its best search term's conversion (%), from an Opportunity Explorer capture; and the signal it gives. */
  best_term_conversion: number | null; term_signal: TermSignal | null;
  created_at: string; updated_at: string;
  /** From its import. */
  category?: string;
}

/** The Opportunity Explorer capture linked to a niche: its search terms with their conversion. */
export interface NichePoe { snapshotId: string; capturedAt: string; terms: ConvTerm[] }

const now = () => new Date().toISOString();
const NUMS = ["best_term_conversion", "top_clicked_products", "sv_360", "growth_180", "sv_90", "growth_90", "units_360_min", "units_360_max", "units_per_product_min", "units_per_product_max", "units_per_product_mid", "avg_price", "min_price", "max_price", "return_rate", "score"] as const;
/**
 * The columns the page filters and sorts by in SQL, worked out from the niche: its words for the
 * search, its first search term, how many flags, and the shape's rank (open first).
 */
export function derivedCols(n: { customer_need: string; search_terms: string[]; flags: string[]; shape?: string | null; extra?: { aliases?: string[] } | null }) {
  return {
    search_text: [n.customer_need, ...n.search_terms, ...(n.extra?.aliases ?? [])].join(" ").toLowerCase(),
    first_term: n.search_terms[0] ?? null,
    flag_count: n.flags.length,
    shape_rank: n.shape === "open" ? 0 : n.shape === "contested" ? 1 : n.shape === "dominated" ? 2 : null,
  };
}

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

/* ===================== the off-niche words (the incumbent check) ===================== */

export async function offNicheWords(): Promise<string[]> {
  const r = await db().from("pl_niche_settings").select("value").eq("key", "offNiche").maybeSingle();
  const v = (r.data as { value: string[] } | null)?.value;
  return Array.isArray(v) ? v : DEFAULT_OFF_NICHE;
}

/** Save the off-niche words (null: back to the defaults). The next check uses them. */
export async function saveOffNicheWords(text: string | string[] | null): Promise<{ words: string[] }> {
  const d = db();
  if (text == null) must(await d.from("pl_niche_settings").delete().eq("key", "offNiche"), "reset off-niche words");
  else must(await d.from("pl_niche_settings").upsert({ key: "offNiche", value: parseWordList(text), updated_at: now() }, { onConflict: "key" }), "save off-niche words");
  return { words: await offNicheWords() };
}

/** Every niche's flags worked out again (after the brand list or the flag rules change). */
export async function reflagNiches(): Promise<number> {
  const d = db();
  const terms = await brandTerms();
  // Every niche, a page at a time (one select returns at most 1,000).
  const rows = (await allRows<Record<string, unknown>>((a, b) => d.from("pl_niches").select("*").order("id").range(a, b), "niches")).map(toRow);
  let reflagged = 0;
  for (const n of rows) {
    const flags = nicheFlags(n, terms);
    if (JSON.stringify(flags) !== JSON.stringify(n.flags)) { must(await d.from("pl_niches").update({ flags, flag_count: flags.length, updated_at: now() }).eq("id", n.id), "re-flag"); reflagged++; }
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
    /** The rate card category a candidate from this category gets. */
    feeCategory: feeCategoryFor(category, await activeRateCard()),
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
  const oldIds = old.map((o) => o.id);
  const sameCat = (c: string) => c.trim().toLowerCase() === category.toLowerCase();
  // Every niche listing this category: owned by its old import, or merged into another category's row.
  const listing = await allRows<Record<string, unknown>>((a, b) => d.from("pl_niches").select("id, import_id, customer_need, categories, status, notes, shape, candidate_id, extra, keepa_by_day").order("id").range(a, b), "niches in the category")
    .then((rows) => rows.filter((r) => ((r.categories as string[]) ?? []).some(sameCat) || oldIds.includes(r.import_id as string)));
  const kept = new Map<string, Record<string, unknown>>();
  for (const r of listing) kept.set(String(r.customer_need).toLowerCase(), r);
  // A niche also in other categories stays: it leaves this category (back if the new file has it)
  // and, if this category's old import owned it, moves to another category's import.
  const ownerOf = new Map((await allRows<{ id: string; category: string }>((a, b) => d.from("pl_niche_imports").select("id, category").order("id").range(a, b), "imports"))
    .filter((i) => !oldIds.includes(i.id)).map((i) => [i.category.trim().toLowerCase(), i.id]));
  for (const r of listing) {
    const others = ((r.categories as string[]) ?? []).filter((c) => !sameCat(c));
    if (!others.length) continue;
    const owner = oldIds.includes(r.import_id as string) ? others.map((c) => ownerOf.get(c.trim().toLowerCase())).find(Boolean) : (r.import_id as string);
    if (!owner) continue;
    must(await d.from("pl_niches").update({ categories: others, import_id: owner, updated_at: now() }).eq("id", r.id), "keep a niche in its other categories");
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
      import_id: imp.id, categories: [category], customer_need: n.customer_need, search_terms: n.search_terms, top_clicked_products: n.top_clicked_products,
      sv_360: n.sv_360, growth_180: n.growth_180, sv_90: n.sv_90, growth_90: n.growth_90, units_360_min: n.units_360_min, units_360_max: n.units_360_max,
      units_per_product_min: n.units_per_product_min, units_per_product_max: n.units_per_product_max, units_per_product_mid: n.units_per_product_mid,
      avg_price: n.avg_price, min_price: n.min_price, max_price: n.max_price, return_rate: n.return_rate,
      extra: { ...(prevExtra.incumbents ? { incumbents: prevExtra.incumbents } : {}), aliases: n.aliases }, raw_row: n.raw_row,
      ...scored(n, brands),
      status: (k?.status as string) ?? "new", notes: (k?.notes as string | null) ?? null, shape: (k?.shape as string | null) ?? null,
      ...derivedCols({ ...n, flags: scored(n, brands).flags, shape: (k?.shape as string | null) ?? null, extra: { aliases: n.aliases } }),
      candidate_id: (k?.candidate_id as string | null) ?? null, keepa_by_day: (k?.keepa_by_day as TokensByDay) ?? {},
    };
  });
  for (const c of chunks(rows, 200)) must(await d.from("pl_niches").insert(c), "save niches");
  if (old.length) must(await d.from("pl_niche_imports").delete().in("id", oldIds), "replace the old import");
  // The same niche downloaded in another category: one row, every category on it.
  const merged = await mergeDuplicateNiches();
  await linkPoeCaptures();
  return { importId: imp.id, category, niches: rows.length, duplicates: p.duplicates, preserved, replaced: old.length > 0, unmapped: p.unmapped, mergedAcrossCategories: merged.merged };
}

/**
 * Merge niches that are the same niche in different categories (identical search terms and search
 * volume): one row kept, with every category, the furthest status, the notes, the shape and the
 * Keepa ledgers of all of them. After every import, and once for the rows already there.
 */
export async function mergeDuplicateNiches(): Promise<{ groups: number; merged: number }> {
  const d = db();
  const rows = await allRows<Record<string, unknown>>((a, b) => d.from("pl_niches").select("id, customer_need, search_terms, sv_360, categories, status, notes, shape, candidate_id, extra, keepa_by_day, created_at, flags").order("id").range(a, b), "niches to merge");
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) {
    const k = nicheKey(r.search_terms as string[], r.sv_360 == null ? null : Number(r.sv_360));
    if (k) groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  let g = 0, merged = 0;
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    g++;
    const m = mergeGroup(list as unknown as MergeRow[]);
    const keepRow = list.find((r) => r.id === m.keep.id)!;
    must(await d.from("pl_niches").update({
      ...m.patch, updated_at: now(),
      ...derivedCols({ customer_need: m.keep.customer_need, search_terms: keepRow.search_terms as string[], flags: keepRow.flags as string[], shape: m.patch.shape, extra: m.patch.extra }),
    }).eq("id", m.keep.id), "merge niches");
    for (const c of chunks(m.drop, 200)) must(await d.from("pl_niches").delete().in("id", c), "drop merged niches");
    merged += m.drop.length;
  }
  return { groups: g, merged };
}

/* ===================== reading and acting ===================== */

/** The imports, each with the Opportunity Explorer category it matches and the fee category candidates from it use. */
export async function listImports() {
  const card = await activeRateCard();
  const imps = must(await db().from("pl_niche_imports").select("id, category, marketplace, filename, imported_at, row_count, unmapped, duplicates").order("imported_at", { ascending: false }), "imports") as
    { id: string; category: string; imported_at: string; row_count: number; filename: string | null; unmapped: string[]; duplicates: number; marketplace: string }[];
  return { imports: imps.map((i) => ({ ...i, poeCategory: matchPoeCategory(i.category), feeCategory: feeCategoryFor(i.category, card) })), feeCategories: card.referral.categories.map((c) => c.name) };
}

export const NICHE_SORTS = {
  need: "customer_need", terms: "first_term", score: "score", sv: "sv_360", g180: "growth_180", g90: "growth_90", price: "avg_price", range: "max_price",
  clicked: "top_clicked_products", conv: "best_term_conversion", units: "units_per_product_mid", returns: "return_rate", flags: "flag_count", shape: "shape_rank", status: "status",
} as const;
export type NicheSort = keyof typeof NICHE_SORTS;
/** Average price bands: £15–40, £10–60, under £10, over £60. */
export const PRICE_BANDS = { core: { gte: 15, lte: 40 }, mid: { gte: 10, lte: 60 }, low: { lt: 10 }, high: { gt: 60 } } as const;

export interface NicheQuery {
  category?: string | null; minScore?: number | null; price?: keyof typeof PRICE_BANDS | "" | null; status?: string | null; q?: string | null;
  hideFlags?: string[]; sort?: NicheSort; dir?: "asc" | "desc"; page?: number; pageSize?: number;
}

const COLS = "id, import_id, categories, customer_need, search_terms, top_clicked_products, sv_360, growth_180, sv_90, growth_90, units_360_min, units_360_max, units_per_product_min, units_per_product_max, units_per_product_mid, avg_price, min_price, max_price, return_rate, extra, score, score_breakdown, flags, shape, status, notes, candidate_id, best_term_conversion, term_signal, created_at, updated_at";

/** The niches matching the filters, sorted and paged in SQL, with the total that match. */
export async function nichePage(x: NicheQuery) {
  const d = db();
  const { imports } = await listImports();
  const cat = new Map(imports.map((i) => [i.id, i.category]));
  void imports;
  const pageSize = Math.min(500, Math.max(10, Math.round(Number(x.pageSize) || 100)));
  const page = Math.max(1, Math.round(Number(x.page) || 1));
  let q = d.from("pl_niches").select(COLS, { count: "exact" });
  // A niche in several categories shows under each.
  if (x.category) q = q.contains("categories", [x.category]);
  if (x.minScore != null && Number.isFinite(Number(x.minScore)) && Number(x.minScore) > 0) q = q.gte("score", Number(x.minScore));
  const band = x.price ? (PRICE_BANDS[x.price] as { gte?: number; lte?: number; lt?: number; gt?: number }) : null;
  if (band?.gte != null) q = q.gte("avg_price", band.gte);
  if (band?.lte != null) q = q.lte("avg_price", band.lte);
  if (band?.lt != null) q = q.lt("avg_price", band.lt);
  if (band?.gt != null) q = q.gt("avg_price", band.gt);
  if (!x.status || x.status === "active") q = q.neq("status", "dismissed");
  else if (x.status !== "all") q = q.eq("status", x.status);
  const hide = (x.hideFlags ?? []).filter((f) => /^[A-Z_]+$/.test(f));
  if (hide.length) q = q.not("flags", "ov", `{${hide.join(",")}}`);
  const text = x.q?.trim().toLowerCase().replace(/[%_*,()]/g, " ").trim();
  if (text) q = q.ilike("search_text", `%${text}%`);
  const col = NICHE_SORTS[x.sort ?? "score"] ?? "score";
  const asc = x.dir === "asc";
  const from = (page - 1) * pageSize;
  const res = await q.order(col, { ascending: asc, nullsFirst: false }).order("id", { ascending: true }).range(from, from + pageSize - 1);
  const rows = (must(res, "niches") as Record<string, unknown>[]).map(toRow).map((n) => ({ ...n, category: cat.get(n.import_id) ?? "" }));
  return { rows, total: res.count ?? rows.length, page, pageSize };
}

/**
 * The summary strip, over every niche in scope (the category picked, else all), counted in SQL:
 * imported, scoring 60+, hidden by the flags hidden now, shortlisted and incumbent-checked.
 */
export async function nicheStats(x: { category?: string | null; hideFlags?: string[] }) {
  const d = db();
  const scope = () => {
    const q = d.from("pl_niches").select("id", { count: "exact", head: true });
    return x.category ? q.contains("categories", [x.category]) : q;
  };
  const hide = (x.hideFlags ?? []).filter((f) => /^[A-Z_]+$/.test(f));
  const [total, scoring60, hidden, shortlisted, checked] = await Promise.all([
    scope(), scope().gte("score", 60), hide.length ? scope().overlaps("flags", hide) : Promise.resolve({ count: 0, error: null }),
    scope().eq("status", "shortlisted"), scope().not("shape", "is", null),
  ]);
  return { total: total.count ?? 0, scoring60: scoring60.count ?? 0, hiddenByFlags: hidden.count ?? 0, shortlisted: shortlisted.count ?? 0, checked: checked.count ?? 0 };
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
  const category = feeCategoryFor(imp.category, card);
  const seed = candidateSeed(n);
  const c = await createCandidate({ name: n.customer_need, niche_keyword: seed.keyword, category, asins: seed.asins });
  // The niche's average price as Gate 0's sell price until Keepa's Buy Box (or you) says otherwise.
  if (n.avg_price != null) await applyAuto(c.id, { sell: { value: n.avg_price.toFixed(2), why: "The niche's average price (Opportunity Explorer)" } }, "poe");
  const note = `From Opportunity Explorer (${imp.category}, Niche Import): search volume ${n.sv_360?.toLocaleString("en-GB") ?? "—"} a year, growth ${pct(n.growth_180)} over 180 days, average price £${n.avg_price?.toFixed(2) ?? "—"}, ${n.top_clicked_products ?? "—"} top-clicked products, ~${n.units_per_product_mid?.toLocaleString("en-GB") ?? "—"} units a product a year. Score ${n.score}${n.flags.length ? `, flags ${n.flags.join(", ")}` : ""}${n.shape ? `, incumbents ${n.shape}` : ""}. Search terms: ${n.search_terms.join(", ")}.${seed.asins.length ? ` Page-one ASINs: the incumbent check's ${seed.asins.length} on-niche best sellers.` : ""} Niche keyword: "${seed.keyword}" (${seed.keywordFrom === "conversion" ? "the captured search term converting best" : "the first search term"}).`;
  must(await d.from("pl_candidates").update({ notes: note }).eq("id", c.id), "candidate notes");
  must(await d.from("pl_niches").update({ status: "candidate", candidate_id: c.id, updated_at: now() }).eq("id", id), "link candidate");
  return { candidateId: c.id, existed: false, category, asins: seed.asins.length, keyword: seed.keyword, keywordFrom: seed.keywordFrom, sell: n.avg_price };
}

/**
 * What a niche hands its candidate: the incumbent check's on-niche ASINs (its top 10 by sales) as
 * Gate 0's page-one ASINs, and as niche keyword the captured search term converting best (an
 * Opportunity Explorer capture), else the first search term.
 */
export function candidateSeed(n: Pick<NicheRow, "search_terms" | "customer_need" | "extra">) {
  const inc = n.extra?.incumbents as { incumbents?: { asin: string }[] } | undefined;
  const asins = [...new Set((inc?.incumbents ?? []).map((x) => x.asin.toUpperCase()))].slice(0, 10);
  const best = bestTermConversion(n.extra?.poe?.terms);
  return best
    ? { asins, keyword: best.term, keywordFrom: "conversion" as const }
    : { asins, keyword: n.search_terms[0] ?? n.customer_need, keywordFrom: "first term" as const };
}

type CheckNiche = { search_terms: string[]; customer_need: string; categories: string[] | null; extra: Record<string, unknown> | null; keepa_by_day: TokensByDay | null };
const PET_TERM = /\b(cat|cats|kitten|dog|dogs|puppy|pet|pets)\b/i;

/** What the check on a niche runs on: its search terms, its categories' Keepa roots, pet or not, and a rerun's finder list. */
function checkInputs(n: CheckNiche, rerun: boolean) {
  const terms = n.search_terms.length ? n.search_terms : [n.customer_need];
  const cats = n.categories ?? [];
  const reuse = rerun ? reusable(n.extra?.incumbents as Parameters<typeof reusable>[0], terms) : null;
  return {
    term: terms[0], terms, reuse, rootCategoryIds: keepaRootsFor(cats), rootNames: cats.filter((c) => keepaRootsFor([c]).length),
    pet: cats.some((c) => matchPoeCategory(c) === "Pet Supplies") || terms.some((t) => PET_TERM.test(t)),
    kids: cats.some((c) => ["Baby Products", "Toys & Games"].includes(matchPoeCategory(c) ?? "")),
    toys: cats.some((c) => matchPoeCategory(c) === "Toys & Games"),
    baby: cats.some((c) => matchPoeCategory(c) === "Baby Products"),
    notOnNiche: (n.extra?.notOnNiche as string[] | undefined) ?? [],
  };
}
const CHECK_COLS = "search_terms, customer_need, categories, extra, keepa_by_day";

/** What an incumbent check (or a rerun) on this niche's search terms would cost, and whether it can run now. */
export async function nicheCheckPlan(id: string, rerun = false) {
  const n = must(await db().from("pl_niches").select(CHECK_COLS).eq("id", id).single(), "niche") as CheckNiche;
  const i = checkInputs(n, rerun);
  return { term: i.term, terms: i.terms, categories: i.rootNames, ...(await termCheckPlan(i.reuse, i.terms, i.rootCategoryIds.length > 0)) };
}

/**
 * Run the incumbent check on the niche's search terms (a title matching any of them), in its categories, on-niche titles only;
 * the shape and the 10 best-selling incumbents go on the row. A rerun reuses the last check's finder
 * list (within 7 days) and the 7-day snapshots.
 */
export async function checkNicheIncumbents(id: string, rerun = false) {
  const d = db();
  const n = must(await d.from("pl_niches").select(CHECK_COLS).eq("id", id).single(), "niche") as CheckNiche;
  const i = checkInputs(n, rerun);
  const r = await termIncumbentCheck(i.terms, { rootCategoryIds: i.rootCategoryIds, rootNames: i.rootNames, pet: i.pet, kids: i.kids, toys: i.toys, baby: i.baby, notOnNiche: i.notOnNiche, offNiche: await offNicheWords(), reuse: i.reuse });
  must(await d.from("pl_niches").update({
    shape: r.shape, shape_rank: derivedCols({ customer_need: "", search_terms: [], flags: [], shape: r.shape }).shape_rank,
    extra: { ...(n.extra ?? {}), incumbents: r }, keepa_by_day: addDailyTokens(n.keepa_by_day, r.tokensUsed, new Date(), PL_KEEP_DAYS), updated_at: now(),
  }).eq("id", id), "save the check");
  return r;
}

/**
 * Mark a product of the niche's incumbent check "Not on-niche" (or undo it): kept on the niche, so
 * every rerun leaves it out, and the shape worked out again from the check's products (no Keepa).
 */
export async function setNotOnNiche(id: string, asin: string, out: boolean) {
  const d = db();
  const n = must(await d.from("pl_niches").select(CHECK_COLS).eq("id", id).single(), "niche") as CheckNiche;
  const a = asin.trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(a)) throw new Error("Not an ASIN");
  const prev = (n.extra?.notOnNiche as string[] | undefined) ?? [];
  const notOnNiche = out ? [...new Set([...prev, a])] : prev.filter((x) => x !== a);
  const extra: Record<string, unknown> = { ...(n.extra ?? {}), notOnNiche };
  const inc = n.extra?.incumbents as ({ candidates?: string[]; shape?: string | null } & Record<string, unknown>) | undefined;
  let shape: string | null | undefined;
  if (inc?.candidates?.length) {
    const i = checkInputs({ ...n, extra }, false);
    const c = await reclassifyCandidates(inc.candidates, i.terms, { pet: i.pet, kids: i.kids, toys: i.toys, baby: i.baby, words: await offNicheWords(), notOnNiche });
    extra.incumbents = { ...inc, ...c, reclassifiedAt: now() };
    shape = c.shape;
  }
  must(await d.from("pl_niches").update({
    extra, ...(shape !== undefined ? { shape, shape_rank: derivedCols({ customer_need: "", search_terms: [], flags: [], shape }).shape_rank } : {}), updated_at: now(),
  }).eq("id", id), "save the override");
  return { notOnNiche, incumbents: extra.incumbents ?? null, shape: shape ?? null };
}

/* ===================== Opportunity Explorer captures ===================== */

const likeSafe = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Link Opportunity Explorer captures (the extension's "Send to Private label") to the niches they're
 * for: the latest capture with search terms whose niche title is a niche's customer need or one of
 * its aliases (any case). Each gets its best term conversion, the BUYING / BROWSE_ONLY signal and the
 * terms. One capture (after it arrives) or every capture (after an import, a merge or a re-read).
 */
export async function linkPoeCaptures(snapshotId?: string): Promise<{ linked: number; niches: { id: string; customer_need: string; best: number; term: string; signal: TermSignal | null }[]; noConversion: boolean; newerKept: string[] }> {
  const d = db();
  let q = d.from("pl_poe_snapshots").select("id, niche_title, captured_at, search_terms").not("niche_title", "is", null).order("captured_at", { ascending: false });
  if (snapshotId) q = q.eq("id", snapshotId);
  const caps = must(await q, "captures") as { id: string; niche_title: string; captured_at: string; search_terms: ConvTerm[] | null }[];
  const latest = new Map<string, (typeof caps)[number]>();
  for (const c of caps) {
    const k = c.niche_title.trim().toLowerCase();
    if (k && (c.search_terms?.length ?? 0) > 0 && !latest.has(k)) latest.set(k, c);
  }
  let linked = 0;
  const newerKept: string[] = [];
  const niches: { id: string; customer_need: string; best: number; term: string; signal: TermSignal | null }[] = [];
  // One capture asked for, with no term conversion to give: nothing to link.
  const noConversion = !!snapshotId && caps.length > 0 && ![...latest.values()].some((c) => bestTermConversion(c.search_terms));
  for (const [title, c] of latest) {
    const best = bestTermConversion(c.search_terms);
    if (!best) continue;
    // Its name or an alias holds the title (a short title can match many: every page read).
    const near = await allRows<{ id: string; customer_need: string; extra: Record<string, unknown> | null }>((a, b) =>
      d.from("pl_niches").select("id, customer_need, extra").ilike("search_text", `%${likeSafe(title)}%`).order("id").range(a, b), "niches for a capture");
    for (const n of near) {
      const names = [n.customer_need, ...(((n.extra?.aliases as string[] | undefined) ?? []))].map((x) => x.trim().toLowerCase());
      if (!names.includes(title)) continue;
      const prev = n.extra?.poe as NichePoe | undefined;
      // A single capture never replaces a newer one already on the niche.
      if (prev && prev.snapshotId !== c.id && prev.capturedAt > c.captured_at) { newerKept.push(n.customer_need); continue; }
      const poe: NichePoe = { snapshotId: c.id, capturedAt: c.captured_at, terms: (c.search_terms ?? []).map((t) => ({ term: t.term, volume: t.volume ?? null, conversion: t.conversion })) };
      must(await d.from("pl_niches").update({
        best_term_conversion: best.conversion, term_signal: termSignal(best.conversion), extra: { ...(n.extra ?? {}), poe }, updated_at: now(),
      }).eq("id", n.id), "link a capture");
      linked++;
      niches.push({ id: n.id, customer_need: n.customer_need, best: best.conversion, term: best.term, signal: termSignal(best.conversion) });
    }
  }
  return { linked, niches, noConversion, newerKept };
}

/** For Home: counted in SQL, so every niche counts (not the first 1,000). */
export async function nicheSummary() {
  const s = await nicheStats({});
  return { total: s.total, shortlisted: s.shortlisted, checked: s.checked, scoring60: s.scoring60 };
}

/** The Keepa ledgers of the niches that have spent tokens (incumbent checks), for Private label's monthly total. */
export async function nicheLedgers(): Promise<TokensByDay[]> {
  const d = db();
  const rows = await allRows<{ keepa_by_day: TokensByDay | null }>((a, b) => d.from("pl_niches").select("id, keepa_by_day").not("shape", "is", null).order("id").range(a, b), "niche ledgers");
  return rows.map((r) => r.keepa_by_day ?? {});
}
