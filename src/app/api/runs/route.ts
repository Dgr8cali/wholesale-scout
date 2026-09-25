import type { NextRequest } from "next/server";
import { db, must } from "@/lib/server/db";
import { handle } from "@/lib/server/http";
import { keepaQueue } from "@/lib/server/keepaTurn";
import { runSummaries, type RunSummary } from "@/lib/server/runSummaries";

export type { RunSummary };

// The list doesn't need each run's profile copy (3 KB each); export reads it from the run itself.
const COLS = "id, name, source, status, started_at, finished_at, row_count, processed_count, token_cost, error, archived_at, paused_at, keepa_first_at, stats, profile_id, profile:profiles(name)";

/** Runs, newest first, with their summaries. ?archived=1 includes archived runs; ?q= searches names and sources. */
export const GET = handle(async (req: NextRequest) => {
  const archived = req.nextUrl.searchParams.get("archived") === "1";
  const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";
  let query = db().from("runs").select(COLS).order("started_at", { ascending: false }).limit(300);
  if (!archived) query = query.is("archived_at", null);
  let rows = must(await query, "runs") as unknown as { id: string; name?: string | null; source: string }[];
  if (q) rows = rows.filter((r) => `${r.name ?? ""} ${r.source}`.toLowerCase().includes(q));
  const [sums, queue] = await Promise.all([runSummaries(rows.map((r) => r.id)), keepaQueue().catch(() => [])]);
  // Whose turn it is on Keepa (one run at a time) and who's waiting behind it.
  return Response.json({ runs: rows.map((r) => ({ ...r, summary: sums.get(r.id) ?? null })), keepaQueue: queue.map((q) => q.id) });
});
