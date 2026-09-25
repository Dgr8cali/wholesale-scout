import "server-only";
import { chunks, db, must } from "./db";

/** Result ids in a run for the given products (EAN + ASIN). */
export async function resultIdsFor(runId: string, items: { ean: string; asin: string | null }[]): Promise<string[]> {
  const d = db();
  const ids: string[] = [];
  for (const c of chunks([...new Set(items.map((i) => i.ean))])) {
    const products = must(await d.from("products").select("id, ean, asin").in("ean", c), "products") as { id: string; ean: string; asin: string | null }[];
    const wanted = products.filter((p) => items.some((i) => i.ean === p.ean && (i.asin ?? null) === (p.asin ?? null))).map((p) => p.id);
    for (const pc of chunks(wanted)) {
      const rs = must(await d.from("results").select("id").eq("run_id", runId).in("product_id", pc), "results") as { id: string }[];
      ids.push(...rs.map((r) => r.id));
    }
  }
  return ids;
}
