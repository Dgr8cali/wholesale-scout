import "server-only";
import type { Cell } from "../ingest/mapping";
import { parseDgReport, type DgLookup, type DgLookupStatus, type ParsedDgReport } from "../dg/report";
import { chunks, db, must } from "./db";

export interface DgImport extends Omit<ParsedDgReport, "entries"> {
  /** ASINs in the file, and how many of them are products the app knows. */
  asins: number;
  saved: number;
  notInApp: number;
  byStatus: Partial<Record<DgLookupStatus, number>>;
}

/** Save each ASIN's DG lookup status on its products (every product with that ASIN). */
export async function importDgReport(rows: Cell[][], file: string | null): Promise<DgImport> {
  const parsed = parseDgReport(rows);
  const { entries, ...rest } = parsed;
  const out: DgImport = { ...rest, asins: entries.length, saved: 0, notInApp: 0, byStatus: {} };
  if (parsed.error) return out;
  const d = db();
  const at = new Date().toISOString();
  const known = new Set<string>();
  for (const c of chunks(entries.map((e) => e.asin))) {
    for (const p of must(await d.from("products").select("asin").in("asin", c), "products") as { asin: string }[]) known.add(p.asin);
  }
  // One update per status/programme/text group keeps it to a handful of calls.
  const groups = new Map<string, { lookup: DgLookup; asins: string[] }>();
  for (const e of entries) {
    if (!known.has(e.asin)) { out.notInApp++; continue; }
    out.byStatus[e.status] = (out.byStatus[e.status] ?? 0) + 1;
    const key = JSON.stringify([e.status, e.text, e.programme]);
    const g = groups.get(key) ?? { lookup: { status: e.status, text: e.text, programme: e.programme, at, file }, asins: [] };
    g.asins.push(e.asin);
    groups.set(key, g);
  }
  for (const g of groups.values()) {
    for (const c of chunks(g.asins)) must(await d.from("products").update({ dg_lookup: g.lookup }).in("asin", c), "save DG lookup");
    out.saved += g.asins.length;
  }
  return out;
}

/** A run's ASINs, once each, for pasting into Seller Central's Dangerous Goods lookup. */
export async function runAsins(runId: string): Promise<string[]> {
  const d = db();
  const ids = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const page = must(await d.from("results").select("product_id").eq("run_id", runId).range(from, from + 999), "results") as { product_id: string }[];
    for (const r of page) ids.add(r.product_id);
    if (page.length < 1000) break;
  }
  const asins = new Set<string>();
  for (const c of chunks([...ids])) {
    for (const p of must(await d.from("products").select("asin").in("id", c), "products") as { asin: string | null }[]) if (p.asin) asins.add(p.asin);
  }
  return [...asins].sort();
}
