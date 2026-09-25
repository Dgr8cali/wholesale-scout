import "server-only";
import { chunks, db, must } from "./db";

export interface RunSummary { pass: number; warn: number; fail: number; error: number; pending: number; suppliers: string[]; newestKeepa: string | null }

const empty = (): RunSummary => ({ pass: 0, warn: 0, fail: 0, error: 0, pending: 0, suppliers: [], newestKeepa: null });

/**
 * Verdict counts, suppliers and newest Keepa data for many runs in one call (the run_summaries
 * SQL function). Where that isn't available (the in-memory test database), counts are made
 * from the rows in one query per 200 runs; suppliers and Keepa dates are left empty.
 */
export async function runSummaries(ids: string[]): Promise<Map<string, RunSummary>> {
  const out = new Map<string, RunSummary>();
  if (!ids.length) return out;
  const d = db();
  const res = typeof d.rpc === "function" ? await d.rpc("run_summaries", { run_ids: ids }) : null;
  if (res && !res.error && Array.isArray(res.data)) {
    for (const r of res.data as { run_id: string; pass: number; warn: number; fail: number; error: number; pending: number; suppliers: string[]; newest_keepa: string | null }[]) {
      out.set(r.run_id, { pass: r.pass, warn: r.warn, fail: r.fail, error: r.error, pending: r.pending, suppliers: r.suppliers ?? [], newestKeepa: r.newest_keepa });
    }
    return out;
  }
  for (const id of ids) out.set(id, empty());
  for (const c of chunks(ids)) {
    for (let from = 0; ; from += 1000) {
      const rows = must(await d.from("results").select("run_id, status, verdict").in("run_id", c).range(from, from + 999), "results") as { run_id: string; status: string; verdict: string | null }[];
      for (const r of rows) {
        const s = out.get(r.run_id)!;
        if (r.status === "pending") s.pending++;
        else if (r.status === "error") s.error++;
        else if (r.status === "done" && (r.verdict === "pass" || r.verdict === "warn" || r.verdict === "fail")) s[r.verdict]++;
      }
      if (rows.length < 1000) break;
    }
  }
  return out;
}
