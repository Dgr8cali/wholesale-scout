import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { bearerIs } from "@/lib/server/secrets";
import { scheduleNext } from "@/lib/server/kick";
import { stalledRuns } from "@/lib/server/watchdog";

/**
 * Restart processing chains that have died (Supabase pg_cron calls this every minute; see
 * migration 20260927000100_watchdog.sql). Harmless when nothing's stalled.
 */
export const GET = handle(async (req: NextRequest) => {
  if (!bearerIs(req.headers.get("authorization"), process.env.CRON_SECRET, process.env.WATCHDOG_SECRET)) return Response.json({ error: "Unauthorised" }, { status: 401 });
  const stalled = await stalledRuns();
  for (const s of stalled) scheduleNext(req.nextUrl.origin, s.runId, s.path);
  return Response.json({ restarted: stalled });
});
