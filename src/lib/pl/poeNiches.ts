/**
 * Opportunity Explorer category downloads (Niche view → a category → Download): one row per niche,
 * up to 500. The header isn't on line 1 (a title and a blank line come first): it's the row whose
 * first cell is "Customer Need". Columns are matched by name with case, spaces and punctuation
 * ignored, so a renamed or reordered export still reads; any column not recognised is listed in the
 * preview and kept in each row's raw_row. Growth and return rate are fractions (0.0321 = +3.21%);
 * negatives come with a leading apostrophe ('-0.1239). Niches that are the same niche under two
 * names (identical search terms and search volume) are merged: the first kept, the others its aliases.
 * Pure.
 */
import { parseCsv } from "../ads/parse";

export interface ParsedNiche {
  customer_need: string; search_terms: string[]; top_clicked_products: number | null;
  sv_360: number | null; growth_180: number | null; sv_90: number | null; growth_90: number | null;
  units_360_min: number | null; units_360_max: number | null;
  units_per_product_min: number | null; units_per_product_max: number | null; units_per_product_mid: number | null;
  avg_price: number | null; min_price: number | null; max_price: number | null; return_rate: number | null;
  aliases: string[];
  raw_row: Record<string, string>;
}

export interface ParsedImport {
  headerLine: number;
  /** Each field the parser fills, and the column it came from (null: not found). */
  mapped: Record<string, string | null>;
  /** Columns in the file the parser didn't recognise. */
  unmapped: string[];
  /** Data rows read (before merging duplicates). */
  rows: number;
  niches: ParsedNiche[];
  duplicates: number;
  warnings: string[];
}

/** "Search Volume Growth (Past 180 days)" → "searchvolumegrowthpast180days". */
export const headerKey = (h: string) => h.replace(/^﻿/, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Each field, and the header keys it accepts (the exact export first, then variants seen or likely). */
const FIELDS: Record<string, { keys: string[]; test?: (k: string) => boolean }> = {
  customer_need: { keys: ["customerneed"], test: (k) => k.startsWith("customerneed") || k === "niche" || k === "nichename" },
  term1: { keys: ["topsearchterm1"], test: (k) => /topsearchterm1$/.test(k) },
  term2: { keys: ["topsearchterm2"], test: (k) => /topsearchterm2$/.test(k) },
  term3: { keys: ["topsearchterm3"], test: (k) => /topsearchterm3$/.test(k) },
  sv_360: { keys: ["searchvolumepast360days"], test: (k) => k.startsWith("searchvolume") && k.includes("360") && !k.includes("growth") },
  growth_180: { keys: ["searchvolumegrowthpast180days"], test: (k) => k.includes("growth") && k.includes("180") },
  sv_90: { keys: ["searchvolumepast90days"], test: (k) => k.startsWith("searchvolume") && k.includes("90") && !k.includes("growth") && !k.includes("180") && !k.includes("360") },
  growth_90: { keys: ["searchvolumegrowthpast90days"], test: (k) => k.includes("growth") && k.includes("90") && !k.includes("180") },
  units_360_min: { keys: ["unitssoldlowerboundpast360days"], test: (k) => k.startsWith("unitssold") && k.includes("lower") },
  units_360_max: { keys: ["unitssoldupperboundpast360days"], test: (k) => k.startsWith("unitssold") && k.includes("upper") },
  units_per_product_min: { keys: ["rangeofaverageunitssoldlowerboundpast360days"], test: (k) => k.includes("average") && k.includes("units") && k.includes("lower") },
  units_per_product_max: { keys: ["rangeofaverageunitssoldupperboundpast360days"], test: (k) => k.includes("average") && k.includes("units") && k.includes("upper") },
  top_clicked_products: { keys: ["nooftopclickedproducts"], test: (k) => k.includes("topclickedproducts") },
  avg_price: { keys: ["averagepricegbp"], test: (k) => k.startsWith("averageprice") },
  min_price: { keys: ["minimumpricepast360daysgbp"], test: (k) => k.startsWith("minimumprice") },
  max_price: { keys: ["maximumpricepast360daysgbp"], test: (k) => k.startsWith("maximumprice") },
  return_rate: { keys: ["returnratepast360days"], test: (k) => k.startsWith("returnrate") },
};

/** A number from the export: an apostrophe before a negative is dropped, as are £, commas and %. */
export function num(v: string | undefined | null): number | null {
  if (v == null) return null;
  const s = v.trim().replace(/^'/, "").replace(/[£,\s]/g, "").replace(/%$/, "");
  if (!s || s === "-" || /^n\/?a$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
const int = (v: string | undefined) => { const n = num(v); return n == null ? null : Math.round(n); };

export function parseNichesCsv(text: string): ParsedImport {
  const warnings: string[] = [];
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const headerLine = lines.findIndex((l) => headerKey(l.split(",")[0] ?? "") === "customerneed") + 1;
  const rows = parseCsv(text);
  const hi = rows.findIndex((r) => headerKey(r[0] ?? "") === "customerneed");
  if (hi < 0) throw new Error("No header row: looked for a row whose first cell is \"Customer Need\" (an Opportunity Explorer niche download)");
  const header = rows[hi];
  const keys = header.map(headerKey);
  const mapped: Record<string, string | null> = {};
  const col: Record<string, number> = {};
  const used = new Set<number>();
  for (const [field, def] of Object.entries(FIELDS)) {
    let i = keys.findIndex((k, j) => !used.has(j) && def.keys.includes(k));
    if (i < 0 && def.test) i = keys.findIndex((k, j) => !used.has(j) && def.test!(k));
    mapped[field] = i >= 0 ? header[i] : null;
    if (i >= 0) { col[field] = i; used.add(i); }
  }
  const unmapped = header.filter((_, i) => !used.has(i) && header[i].trim());
  const missing = Object.entries(mapped).filter(([, v]) => v == null).map(([k]) => k);
  if (missing.length) warnings.push(`Not found in the file: ${missing.join(", ")}`);
  if (col.customer_need == null) throw new Error("The \"Customer Need\" column is missing");

  const get = (r: string[], f: string) => (col[f] != null ? r[col[f]] : undefined);
  const data = rows.slice(hi + 1).filter((r) => (get(r, "customer_need") ?? "").trim());
  const out: ParsedNiche[] = [];
  const seen = new Map<string, ParsedNiche>();
  let duplicates = 0;
  for (const r of data) {
    const terms = ["term1", "term2", "term3"].map((f) => (get(r, f) ?? "").trim()).filter(Boolean);
    const lo = int(get(r, "units_per_product_min")), hiU = int(get(r, "units_per_product_max"));
    const n: ParsedNiche = {
      customer_need: (get(r, "customer_need") ?? "").trim(), search_terms: terms, top_clicked_products: int(get(r, "top_clicked_products")),
      sv_360: int(get(r, "sv_360")), growth_180: num(get(r, "growth_180")), sv_90: int(get(r, "sv_90")), growth_90: num(get(r, "growth_90")),
      units_360_min: int(get(r, "units_360_min")), units_360_max: int(get(r, "units_360_max")),
      units_per_product_min: lo, units_per_product_max: hiU,
      units_per_product_mid: lo != null && hiU != null ? Math.round((lo + hiU) / 2) : lo ?? hiU,
      avg_price: num(get(r, "avg_price")), min_price: num(get(r, "min_price")), max_price: num(get(r, "max_price")), return_rate: num(get(r, "return_rate")),
      aliases: [],
      raw_row: Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])),
    };
    // The same niche under another name: identical search terms (as a set) and search volume.
    const key = `${[...new Set(terms.map((t) => t.toLowerCase()))].sort().join("|")}#${n.sv_360}`;
    const first = terms.length ? seen.get(key) : undefined;
    if (first) { first.aliases.push(n.customer_need); duplicates++; continue; }
    if (terms.length) seen.set(key, n);
    out.push(n);
  }
  return { headerLine, mapped, unmapped, rows: data.length, niches: out, duplicates, warnings };
}
