import "server-only";
import { db, must } from "./db";
import { runQogitaPull, type PullResult, type QogitaFilters } from "./qogitaPull";

/** A preset is due when it's nightly and wasn't pulled in the last 20 hours. */
const DUE_AFTER_MS = 20 * 3_600_000;

interface Preset { id: string; name: string; filters: QogitaFilters; profile_id: string | null; nightly: boolean; last_pulled_at: string | null }

export async function duePresets(now = Date.now()): Promise<Preset[]> {
  const res = await db().from("qogita_presets").select("id, name, filters, profile_id, nightly, last_pulled_at").eq("nightly", true);
  if (res.error && /does not exist|schema cache/i.test(res.error.message)) return [];
  const all = must(res, "presets") as Preset[];
  return all
    .filter((p) => !p.last_pulled_at || now - Date.parse(p.last_pulled_at) > DUE_AFTER_MS)
    .sort((a, b) => (a.last_pulled_at ?? "").localeCompare(b.last_pulled_at ?? ""));
}

/**
 * One step of the nightly job: re-pull the most overdue preset, screening only EANs that are
 * new or whose price moved (screening reuses Keepa snapshots under 24 hours old). A failed
 * pull is recorded and marks the preset pulled, so one bad preset can't stall the rest.
 */
export async function nightlyStep(): Promise<{ preset: string | null; result?: PullResult; error?: string; remaining: number }> {
  const due = await duePresets();
  const p = due[0];
  if (!p) return { preset: null, remaining: 0 };
  try {
    const result = await runQogitaPull({ name: p.name, filters: p.filters, profileId: p.profile_id, kind: "nightly", onlyChanged: true, deadlineMs: 35_000 });
    return { preset: p.name, result, remaining: due.length - 1 };
  } catch (e) {
    const error = (e as Error).message;
    const d = db();
    const now = new Date().toISOString();
    await d.from("qogita_pulls").insert({ preset_id: p.id, run_id: null, kind: "nightly", error, stats: {}, started_at: now, finished_at: now });
    await d.from("qogita_presets").update({ last_pulled_at: new Date().toISOString() }).eq("id", p.id);
    return { preset: p.name, error, remaining: due.length - 1 };
  }
}

export interface NightlySummary {
  preset: string;
  runId: string | null;
  at: string;
  screened: number;
  new: number;
  moved: number;
  unchanged: number;
  /** Rows that passed every gate in the nightly run (all of them new or re-priced). */
  passes: number;
  stillScreening: boolean;
  error: string | null;
}

/** Each preset's latest nightly pull in the last 36 hours, with how many of its rows passed. */
export async function nightlySummaries(now = Date.now()): Promise<NightlySummary[]> {
  const d = db();
  const since = new Date(now - 36 * 3_600_000).toISOString();
  const res = await d.from("qogita_pulls").select("preset_id, run_id, stats, error, started_at").eq("kind", "nightly").gte("started_at", since).order("started_at", { ascending: false });
  if (res.error && /does not exist|schema cache/i.test(res.error.message)) return [];
  const pulls = must(res, "nightly pulls") as { preset_id: string; run_id: string | null; stats: Record<string, number>; error: string | null; started_at: string }[];
  const latest = new Map<string, (typeof pulls)[number]>();
  for (const p of pulls) if (!latest.has(p.preset_id)) latest.set(p.preset_id, p);
  if (!latest.size) return [];
  const names = new Map((must(await d.from("qogita_presets").select("id, name").in("id", [...latest.keys()]), "presets") as { id: string; name: string }[]).map((p) => [p.id, p.name]));
  return Promise.all([...latest.values()].map(async (p) => {
    let passes = 0, pending = 0;
    if (p.run_id) {
      passes = (await d.from("results").select("id", { count: "exact", head: true }).eq("run_id", p.run_id).eq("status", "done").eq("verdict", "pass")).count ?? 0;
      pending = (await d.from("results").select("id", { count: "exact", head: true }).eq("run_id", p.run_id).eq("status", "pending")).count ?? 0;
    }
    return {
      preset: names.get(p.preset_id) ?? "Deleted preset", runId: p.run_id ?? null, at: p.started_at,
      screened: p.stats?.screened ?? 0, new: p.stats?.new ?? 0, moved: p.stats?.moved ?? 0, unchanged: p.stats?.unchanged ?? 0,
      passes, stillScreening: pending > 0, error: p.error ?? null,
    };
  }));
}
