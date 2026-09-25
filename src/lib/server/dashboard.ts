import "server-only";
import type { Eta } from "../eta";
import { dailySpend, ukDay, type TokensByDay } from "../keepaLedger";
import { db, must } from "./db";
import { runProgress } from "./process";
import { nightlySummaries, type NightlySummary } from "./qogitaNightly";

export interface DashboardRun {
  id: string;
  name: string | null;
  source: string;
  status: string;
  started_at: string;
  row_count: number;
  token_cost: number;
  profile: { name: string } | null;
  /** Screened rows by verdict; rows that errored; rows not screened yet. */
  counts: { pass: number; warn: number; fail: number; error: number; pending: number };
  /** For a run still going: its time-left estimate. */
  eta: Eta | null;
}

export interface Dashboard {
  runs: DashboardRun[];
  /** Keepa spend from the token totals recorded on runs (see keepaLedger.dailySpend). */
  keepa: { spentToday: number; day: string; last7: { day: string; tokens: number }[] };
  /** Last night's Qogita re-pulls: what was new or re-priced, and how much of it passed. */
  qogita: NightlySummary[];
}

/** Recent runs with verdict counts (and time left if running), and Keepa tokens spent today. */
export async function dashboard(recent = 6): Promise<Dashboard> {
  const d = db();
  const runs = must(
    await d.from("runs").select("*, profile:profiles(name)").order("started_at", { ascending: false }).limit(50),
    "runs",
  ) as (Omit<DashboardRun, "counts" | "eta"> & { stats?: { keepaByDay?: TokensByDay | null } | null })[];

  const count = async (runId: string, f: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => (await f(base(runId))).count ?? 0;
  const base = (runId: string) => d.from("results").select("id", { count: "exact", head: true }).eq("run_id", runId);

  const out = await Promise.all(runs.slice(0, recent).map(async (r): Promise<DashboardRun> => {
    const [pass, warn, fail, error, pending] = await Promise.all([
      count(r.id, (q) => q.eq("status", "done").eq("verdict", "pass")),
      count(r.id, (q) => q.eq("status", "done").eq("verdict", "warn")),
      count(r.id, (q) => q.eq("status", "done").eq("verdict", "fail")),
      count(r.id, (q) => q.eq("status", "error")),
      count(r.id, (q) => q.eq("status", "pending")),
    ]);
    const eta = pending > 0 ? (await runProgress(r.id)).eta : null;
    return {
      id: r.id, name: r.name ?? null, source: r.source, status: r.status, started_at: r.started_at,
      row_count: r.row_count, token_cost: r.token_cost, profile: r.profile,
      counts: { pass, warn, fail, error, pending }, eta,
    };
  }));
  const day = ukDay();
  // Every run that can have spent tokens in the last week: started in it, or with ledger days in it.
  const week = new Date(Date.now() - 8 * 86_400_000).toISOString();
  const spendRuns = must(
    await d.from("runs").select("started_at, token_cost, stats").order("started_at", { ascending: false }).limit(500),
    "run spend",
  ) as { started_at: string; token_cost: number; stats?: { keepaByDay?: TokensByDay | null } | null }[];
  const last7 = dailySpend(
    spendRuns
      .filter((r) => r.started_at >= week || Object.keys(r.stats?.keepaByDay ?? {}).some((k) => k >= ukDay(new Date(week))))
      .map((r) => ({ startedAt: r.started_at, tokenCost: Number(r.token_cost) || 0, keepaByDay: r.stats?.keepaByDay })),
    7,
  );
  const qogita = await nightlySummaries().catch(() => []);
  return { runs: out, keepa: { spentToday: last7.at(-1)?.tokens ?? 0, day, last7 }, qogita };
}
