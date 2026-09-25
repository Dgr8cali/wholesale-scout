/** Grouping results that share an EAN: one product line, best ASIN first. */

export interface Rankable {
  status: string;
  verdict: "pass" | "warn" | "fail" | null;
  score: number | null;
  profit: number | null;
}

const VERDICT_RANK = { pass: 0, warn: 1, fail: 2 } as const;

/** Negative when `a` is the better listing: screened over error, then verdict, score, profit. */
export function compareBest(a: Rankable, b: Rankable): number {
  const err = Number(a.status === "error") - Number(b.status === "error");
  if (err) return err;
  const v = VERDICT_RANK[a.verdict ?? "fail"] - VERDICT_RANK[b.verdict ?? "fail"];
  if (v) return v;
  const desc = (x: number | null, y: number | null) => (x == null && y == null ? 0 : x == null ? 1 : y == null ? -1 : y - x);
  return desc(a.score, b.score) || desc(a.profit, b.profit);
}

export interface Group<T> {
  key: string;
  lead: T;
  others: T[];
}

/**
 * Group rows by key (the EAN), best row as the lead, the rest best-first. Groups keep the
 * order of the input, placed where their lead would sit, so a sorted list stays sorted.
 */
export function groupRows<T extends Rankable>(rows: T[], keyOf: (r: T) => string, order: (a: T, b: T) => number): Group<T>[] {
  const byKey = new Map<string, T[]>();
  for (const r of rows) {
    const k = keyOf(r);
    byKey.set(k, [...(byKey.get(k) ?? []), r]);
  }
  const groups = [...byKey.entries()].map(([key, list]) => {
    const [lead, ...others] = [...list].sort(compareBest);
    return { key, lead, others };
  });
  return groups.sort((a, b) => order(a.lead, b.lead));
}
