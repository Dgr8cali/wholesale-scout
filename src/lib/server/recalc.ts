import "server-only";
import { allRows, chunks, db, must } from "./db";
import { businessSettings } from "./business";
import { scheduleRescreen } from "./kick";
import { refreshViews } from "./rescore";

/**
 * "Recalculate all" (Settings → Business): every finished run re-screened on its profile from the
 * stored data (no Amazon or Keepa calls), so saved profits follow the business's VAT basis.
 * Candidates are worked out live, so they follow at once. The profit of every result before is kept,
 * to show the biggest changes once the runs finish.
 */
export async function startRecalc(origin: string): Promise<{ jobId: string; runs: number; results: number; basis: string }> {
  const d = db();
  const b = await businessSettings();
  const basis = b.vatRegistered ? `VAT registered at ${b.vatRate}%` : "not VAT registered";
  const runs = must(await d.from("runs").select("id, profile_id, status, archived_at, paused_at"), "runs") as { id: string; profile_id: string | null; status: string; archived_at: string | null; paused_at: string | null }[];
  const due = runs.filter((r) => r.status === "done" && !r.archived_at && !r.paused_at);
  const before: Record<string, number | null> = {};
  for (const c of chunks(due.map((r) => r.id), 50)) {
    const rows = await allRows<{ id: string; profit: number | null }>((a, z) => d.from("results").select("id, profit").in("run_id", c).order("id").range(a, z), "results before");
    for (const r of rows) before[r.id] = r.profit == null ? null : Number(r.profit);
  }
  const job = must(await d.from("recalc_jobs").insert({ basis, run_ids: due.map((r) => r.id), before }).select("id").single(), "recalc job") as { id: string };
  for (const r of due) scheduleRescreen(origin, r.id, { profileId: r.profile_id ?? undefined, storedOnly: true });
  refreshViews(origin);
  return { jobId: job.id, runs: due.length, results: Object.keys(before).length, basis };
}

export interface RecalcChange { id: string; runId: string; asin: string | null; title: string | null; before: number | null; after: number | null; change: number }

/** Where a recalculation is: runs still re-screening, and once done the 20 biggest profit changes. */
export async function recalcStatus(jobId?: string | null): Promise<{ job: { id: string; started_at: string; basis: string } | null; pending: number; runs: number; done: boolean; changed: number; top: RecalcChange[] }> {
  const d = db();
  const q = d.from("recalc_jobs").select("id, started_at, basis, run_ids, before");
  const res = jobId ? await q.eq("id", jobId).maybeSingle() : await q.order("started_at", { ascending: false }).limit(1).maybeSingle();
  const job = must(res, "recalc job") as { id: string; started_at: string; basis: string; run_ids: string[]; before: Record<string, number | null> } | null;
  if (!job) return { job: null, pending: 0, runs: 0, done: true, changed: 0, top: [] };
  const runs = job.run_ids.length ? must(await d.from("runs").select("id, stats").in("id", job.run_ids), "runs") as { id: string; stats: { rescreen?: { finishedAt?: string | null; startedAt?: string } } | null }[] : [];
  // A run is done once a re-screen started after the job has finished.
  const pending = runs.filter((r) => { const j = r.stats?.rescreen; return !j || !j.finishedAt || (j.startedAt ?? "") < job.started_at; }).length;
  const ids = Object.keys(job.before);
  const after = new Map<string, { profit: number | null; run_id: string; product_id: string | null }>();
  for (const c of chunks(ids, 200)) {
    const rows = must(await d.from("results").select("id, run_id, product_id, profit").in("id", c), "results after") as { id: string; run_id: string; product_id: string | null; profit: number | null }[];
    for (const r of rows) after.set(r.id, { profit: r.profit == null ? null : Number(r.profit), run_id: r.run_id, product_id: r.product_id });
  }
  const changes = ids.map((id) => {
    const a = after.get(id);
    const b = job.before[id];
    const change = (a?.profit ?? 0) - (b ?? 0);
    return { id, runId: a?.run_id ?? "", productId: a?.product_id ?? null, before: b, after: a?.profit ?? null, change: Math.round(change * 100) / 100 };
  }).filter((x) => x.change !== 0 && (x.before != null || x.after != null));
  const top = changes.sort((x, y) => Math.abs(y.change) - Math.abs(x.change)).slice(0, 20);
  const pids = [...new Set(top.map((t) => t.productId).filter((x): x is string => !!x))];
  const products = new Map((pids.length ? must(await d.from("products").select("id, asin, title").in("id", pids), "products") as { id: string; asin: string | null; title: string | null }[] : []).map((p) => [p.id, p]));
  return {
    job: { id: job.id, started_at: job.started_at, basis: job.basis }, pending, runs: runs.length, done: pending === 0, changed: changes.length,
    top: top.map((t) => ({ id: t.id, runId: t.runId, asin: products.get(t.productId ?? "")?.asin ?? null, title: products.get(t.productId ?? "")?.title ?? null, before: t.before, after: t.after, change: t.change })),
  };
}
