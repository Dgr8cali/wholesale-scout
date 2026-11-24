import type { NextRequest } from "next/server";
import { advanceAdsPulls, pullStatus, requestPull } from "@/lib/server/adsApiPulls";
import { handle } from "@/lib/server/http";

/** Where the pulls stand, for Settings → Amazon Ads: last success, pending and failed reports, next run, which source the app uses. */
export const GET = handle(async () => Response.json(await pullStatus()));

/**
 * { kind: "backfill" | "manual" }: ask Amazon for the reports and return at once; the background job
 * (the watchdog's minute tick) checks them and imports them, with or without this page open.
 * backfill: the last 30 days. manual: the last 7 (targeting 30, as the daily pull).
 */
export const POST = handle(async (req: NextRequest) => {
  const { kind } = (await req.json().catch(() => ({}))) as { kind?: string };
  if (kind !== "backfill" && kind !== "manual") return Response.json({ error: "kind must be backfill or manual" }, { status: 400 });
  try {
    const res = await requestPull(kind);
    // Look at once rather than a minute from now: Amazon sometimes has it ready.
    if (res.requested.length) setTimeout(() => { void advanceAdsPulls().catch(() => {}); }, 35_000);
    return Response.json(res);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
