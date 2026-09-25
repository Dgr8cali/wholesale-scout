import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { bearerIs } from "@/lib/server/secrets";
import { scheduleNext } from "@/lib/server/kick";
import { stalledRuns } from "@/lib/server/watchdog";
import { advanceSync } from "@/lib/server/amazonSync";

/**
 * Restart processing chains that have died (Supabase pg_cron calls this every minute; see
 * migration 20260927000100_watchdog.sql). Harmless when nothing's stalled.
 */
export const GET = handle(async (req: NextRequest) => {
  if (!bearerIs(req.headers.get("authorization"), process.env.CRON_SECRET, process.env.WATCHDOG_SECRET)) return Response.json({ error: "Unauthorised" }, { status: 401 });
  const stalled = await stalledRuns();
  for (const s of stalled) scheduleNext(req.nextUrl.origin, s.runId, s.path);
  // The nightly Amazon sync for the tracker moves one step a minute (it does nothing until due).
  const sync = await advanceSync().catch((e: Error) => ({ error: e.message }));
  return Response.json({ restarted: stalled, sync });
});
