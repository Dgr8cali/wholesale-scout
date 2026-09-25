import type { NextRequest } from "next/server";
import { db, must } from "@/lib/server/db";
import { handle } from "@/lib/server/http";

export interface RunSummary { pass: number; warn: number; fail: number; error: number; pending: number; suppliers: string[]; newestKeepa: string | null }

/** Verdict counts, suppliers and newest Keepa data for many runs in one call (run_summaries). */
async function summaries(ids: string[]): Promise<Map<string, RunSummary>> {
  const out = new Map<string, RunSummary>();
  if (!ids.length) return out;
  const res = await db().rpc("run_summaries", { run_ids: ids });
  if (!res.error && Array.isArray(res.data)) {
    for (const r of res.data as { run_id: string; pass: number; warn: number; fail: number; error: number; pending: number; suppliers: string[]; newest_keepa: string | null }[]) {
      out.set(r.run_id, { pass: r.pass, warn: r.warn, fail: r.fail, error: r.error, pending: r.pending, suppliers: r.suppliers ?? [], newestKeepa: r.newest_keepa });
    }
    return out;
  }
  // Before migration 20260927000200: count per run (slower, no suppliers).
  const d = db();
  await Promise.all(ids.map(async (id) => {
    const n = async (f: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => (await f(base())).count ?? 0;
    const base = () => d.from("results").select("id", { count: "exact", head: true }).eq("run_id", id);
    const [pass, warn, fail, error, pending] = await Promise.all([
      n((q) => q.eq("status", "done").eq("verdict", "pass")), n((q) => q.eq("status", "done").eq("verdict", "warn")),
      n((q) => q.eq("status", "done").eq("verdict", "fail")), n((q) => q.eq("status", "error")), n((q) => q.eq("status", "pending")),
    ]);
    out.set(id, { pass, warn, fail, error, pending, suppliers: [], newestKeepa: null });
  }));
  return out;
}

/** Runs, newest first, with their summaries. ?archived=1 includes archived runs; ?q= searches names and sources. */
export const GET = handle(async (req: NextRequest) => {
  const archived = req.nextUrl.searchParams.get("archived") === "1";
  const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";
  let query = db().from("runs").select("*, profile:profiles(name)").order("started_at", { ascending: false }).limit(300);
  if (!archived) query = query.is("archived_at", null);
  let res = await query;
  // Before the archive column exists, list everything.
  if (res.error && /archived_at/.test(res.error.message)) res = await db().from("runs").select("*, profile:profiles(name)").order("started_at", { ascending: false }).limit(300);
  let rows = must(res, "runs") as { id: string; name?: string | null; source: string }[];
  if (q) rows = rows.filter((r) => `${r.name ?? ""} ${r.source}`.toLowerCase().includes(q));
  const sums = await summaries(rows.map((r) => r.id));
  return Response.json({ runs: rows.map((r) => ({ ...r, summary: sums.get(r.id) ?? null })) });
});
