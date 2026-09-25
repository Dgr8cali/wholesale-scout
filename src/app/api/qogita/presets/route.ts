import { db, must } from "@/lib/server/db";
import { handle } from "@/lib/server/http";
import { QOGITA_MIGRATION } from "@/lib/server/qogitaPull";

const missing = (m: string) => /does not exist|schema cache|could not find/i.test(m);

/** Saved pulls, each with its latest pull (stats and run). */
export const GET = handle(async () => {
  const res = await db().from("qogita_presets").select("id, name, filters, profile_id, nightly, last_pulled_at, created_at").order("name");
  if (res.error && missing(res.error.message)) return Response.json({ presets: [], unavailable: QOGITA_MIGRATION });
  const presets = must(res, "presets") as { id: string }[];
  const pulls = presets.length
    ? must(await db().from("qogita_pulls").select("preset_id, run_id, kind, stats, error, started_at").in("preset_id", presets.map((p) => p.id)).order("started_at", { ascending: false }), "pulls") as { preset_id: string }[]
    : [];
  return Response.json({ presets: presets.map((p) => ({ ...p, lastPull: pulls.find((x) => x.preset_id === p.id) ?? null })) });
});
