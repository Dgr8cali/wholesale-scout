import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { alertCount, dismissAlerts } from "@/lib/server/watchlist";

/** Open alerts in the last 14 days (Home's tile). */
export const GET = handle(async () => Response.json({ count: await alertCount() }));

/** Dismiss an alert: { id } or { all: true }. */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { id?: string; all?: boolean };
  if (!b.id && !b.all) return Response.json({ error: "id or all required" }, { status: 400 });
  await dismissAlerts(b.all ? "all" : b.id!);
  return Response.json({ ok: true });
});
