import "server-only";
import type { FilterRow, FilterSet, RangeKey } from "../filters";
import { RANGE_KEYS } from "../filters";
import { toFilterRow, type ResultLike } from "../ui/resultRows";
import { allRows, chunks, db, must } from "./db";

/**
 * Products' filters in one query: `product_filter_facts` keeps what the results filters read of each
 * product's latest result (the same toFilterRow() the tables use), and the `product_list` view joins
 * it to the brand map, one row per ASIN, with `facts_fresh` false when the result has moved on since.
 */

/** What the filters read of a result (lean: no fees, sellers or Qogita offers). */
const LEAN_RESULT = "id, updated_at, status, verdict, band, failed_gate, sell_price, profit, roi, margin, why, error, gate_outcomes, market:inputs->market, restriction:inputs->restriction, product:products(ean, asin, title, brand), offer:offers(title, supplier:suppliers(name))";

/** A stored result's facts row. */
export function factsOf(r: Record<string, unknown>): Record<string, unknown> {
  const fr = toFilterRow({ ...(r as never as ResultLike), inputs: { market: r.market as never, restriction: r.restriction as never } }, new Set());
  return {
    result_id: r.id, result_updated_at: r.updated_at, is_error: fr.verdict === "error",
    band: fr.band, failed_gate: fr.failedGate, amazon: fr.amazon, approval: fr.approval, waived: fr.waived, dormant: fr.dormant,
    ...Object.fromEntries(RANGE_KEYS.map((k) => [k, fr.values[k]])),
  };
}

/** A product_list row back into what matches() reads (verdict: the brand map's, when priced). */
export function filterRowOf(r: Record<string, unknown>, favourite: boolean): FilterRow {
  const n = (v: unknown) => (v == null ? null : Number(v));
  return {
    verdict: r.priced ? ((r.verdict as FilterRow["verdict"]) ?? null) : null,
    band: (r.band as string) ?? null,
    failedGate: (r.failed_gate as string) ?? null,
    brand: (r.brand as string) ?? null,
    supplier: null,
    amazon: (r.amazon as FilterRow["amazon"]) ?? null,
    approval: (r.approval as FilterRow["approval"]) ?? null,
    favourite,
    waived: !!r.waived,
    dormant: !!r.dormant,
    values: Object.fromEntries(RANGE_KEYS.map((k) => [k, n(r[k])])) as Record<RangeKey, number | null>,
    text: "",
  };
}

/**
 * The filters the database can narrow on, as [method, column, value] for the PostgREST builder.
 * matches() still checks every row after, so this only has to keep every row that could match.
 */
export function factsFilters(f: FilterSet): [string, string, unknown][] {
  const out: [string, string, unknown][] = [];
  for (const k of RANGE_KEYS) {
    const r = f.ranges[k];
    if (r?.min != null) out.push(["gte", k, r.min]);
    if (r?.max != null) out.push(["lte", k, r.max]);
  }
  if (f.gated === "yes") out.push(["in", "approval", ["approval_required", "blocked"]]);
  if (f.gated === "no") out.push(["eq", "approval", "open"]);
  if (f.approval.length) out.push(["in", "approval", f.approval]);
  if (f.amazon !== "any") out.push(["eq", "amazon", f.amazon]);
  if (f.bands.length) out.push(["in", "band", f.bands]);
  if (f.gates.length) out.push(["in", "failed_gate", f.gates]);
  if (f.waivedOnly) out.push(["eq", "waived", true]);
  if (f.verdicts.length && f.verdicts.every((v) => v === "dormant")) out.push(["eq", "dormant", true]);
  return out;
}

/** Bring every listed product's facts up to date with its latest result; how many were written. */
export async function refreshProductFacts(): Promise<number> {
  const d = db();
  const stale = await allRows<{ result_id: string }>(
    (a, b) => d.from("product_list").select("result_id").eq("facts_fresh", false).not("result_id", "is", null).order("product_id").range(a, b),
    "product_list",
  );
  let written = 0;
  for (const c of chunks([...new Set(stale.map((s) => s.result_id))], 200)) {
    const rows = must(await d.from("results").select(LEAN_RESULT).in("id", c), "results") as Record<string, unknown>[];
    if (!rows.length) continue;
    must(await d.from("product_filter_facts").upsert(rows.map(factsOf), { onConflict: "result_id" }), "product_filter_facts");
    written += rows.length;
  }
  return written;
}
