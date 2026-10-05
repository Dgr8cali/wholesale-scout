/**
 * One niche, one row: the same niche downloaded in two categories (identical search terms, as a
 * set, and identical search volume) is merged into the row kept, which records every category it
 * appeared in. Pure.
 */
import type { TokensByDay } from "../keepaLedger";

/** Identical search terms (any order, any case) and search volume. Null when it has no terms. */
export function nicheKey(terms: string[], sv: number | null): string | null {
  const set = [...new Set(terms.map((t) => t.trim().toLowerCase()).filter(Boolean))].sort();
  return set.length ? `${set.join("|")}#${sv ?? ""}` : null;
}

export interface MergeRow {
  id: string; customer_need: string; categories: string[]; status: string; notes: string | null; shape: string | null;
  candidate_id: string | null; extra: { aliases?: string[]; incumbents?: unknown; poe?: unknown } | null; keepa_by_day: TokensByDay | null; created_at: string;
}

/** How far along a status is: a candidate outranks a shortlist, which outranks new, then dismissed. */
const STATUS_RANK: Record<string, number> = { candidate: 3, shortlisted: 2, new: 1, dismissed: 0 };

/**
 * Which row to keep, and what it becomes: the one with a candidate, else the furthest-along
 * status, else the oldest. Categories and aliases joined; the furthest status; notes joined; the
 * shape (and its incumbent check) of a row that has one; the Keepa ledgers added up.
 */
export function mergeGroup(rows: MergeRow[]): { keep: MergeRow; drop: string[]; patch: Partial<MergeRow> } {
  const sorted = [...rows].sort((a, b) => Number(!!b.candidate_id) - Number(!!a.candidate_id) || (STATUS_RANK[b.status] ?? 1) - (STATUS_RANK[a.status] ?? 1) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const keep = sorted[0];
  const others = sorted.slice(1);
  const categories = [...new Set(sorted.flatMap((r) => r.categories))];
  const names = new Set([keep.customer_need.toLowerCase()]);
  const aliases: string[] = [];
  for (const r of sorted) for (const a of [r.customer_need, ...(r.extra?.aliases ?? [])]) {
    if (!names.has(a.toLowerCase())) { names.add(a.toLowerCase()); aliases.push(a); }
  }
  const notes = [...new Set(sorted.map((r) => r.notes?.trim()).filter((x): x is string => !!x))];
  const withShape = sorted.find((r) => r.shape);
  const ledger: TokensByDay = {};
  for (const r of sorted) for (const [day, t] of Object.entries(r.keepa_by_day ?? {})) ledger[day] = (ledger[day] ?? 0) + t;
  return {
    keep, drop: others.map((r) => r.id),
    patch: {
      categories, status: sorted[0].status, notes: notes.length ? notes.join("\n\n") : null, shape: withShape?.shape ?? null,
      candidate_id: sorted.find((r) => r.candidate_id)?.candidate_id ?? null,
      extra: { ...(keep.extra ?? {}), aliases, ...(withShape?.extra?.incumbents ? { incumbents: withShape.extra.incumbents } : {}) },
      keepa_by_day: ledger,
    },
  };
}
