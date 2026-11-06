/** The products the supplier search spike is graded on. */

export type ProductKind = "branded" | "generic" | "manufacturer";
export interface TestItem { id: string; query: string; kind: ProductKind; note?: string }

const KINDS: ProductKind[] = ["branded", "generic", "manufacturer"];

export function parseTestSet(raw: unknown): TestItem[] {
  if (!Array.isArray(raw)) throw new Error("The test set must be a list");
  const seen = new Set<string>();
  return raw.map((entry, i) => {
    const e = (entry ?? {}) as Record<string, unknown>;
    const name = typeof e.id === "string" && e.id ? e.id : `entry ${i + 1}`;
    if (typeof e.id !== "string" || !e.id) throw new Error(`${name}: id is required`);
    if (seen.has(e.id)) throw new Error(`${name}: id is repeated`);
    seen.add(e.id);
    if (typeof e.query !== "string" || !e.query.trim()) throw new Error(`${name}: query is required`);
    if (!KINDS.includes(e.kind as ProductKind)) throw new Error(`${name}: kind must be ${KINDS.join(", ")}`);
    return { id: e.id, query: e.query, kind: e.kind as ProductKind, ...(typeof e.note === "string" ? { note: e.note } : {}) };
  });
}
