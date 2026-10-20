import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { scheduleNext } from "@/lib/server/kick";
import { runFromResults } from "@/lib/server/runs";

/** Re-screen results from any runs as one new run: { resultIds, profileId?, label? } (Products, Brand detail). */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { resultIds?: string[]; profileId?: string; label?: string };
  if (!Array.isArray(b.resultIds) || !b.resultIds.length) return Response.json({ error: "Select some rows" }, { status: 400 });
  try {
    const r = await runFromResults(b.resultIds.slice(0, 5000), b.profileId, typeof b.label === "string" && b.label.trim() ? b.label.trim() : undefined);
    scheduleNext(req.nextUrl.origin, r.runId);
    return Response.json(r);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
