import type { NextRequest } from "next/server";
import { recentChecks, runCheckFor, startCheck, verdictCard } from "@/lib/server/check";
import { handle } from "@/lib/server/http";
import { scheduleNext } from "@/lib/server/kick";

export const maxDuration = 60;

/** The last 20 checks, for quick re-runs. */
export const GET = handle(async () => Response.json({ checks: await recentChecks(20) }));

/**
 * Start an ASIN check: { text, supplier?, profileId? }. A single item is worked on here for up
 * to ~12 s so its verdict card usually comes straight back; the rest carry on in the background.
 */
export const POST = handle(async (req: NextRequest) => {
  const body = (await req.json().catch(() => ({}))) as { text?: string; supplier?: string | null; profileId?: string | null };
  let started;
  try {
    started = await startCheck({ text: body.text ?? "", supplier: body.supplier, profileId: body.profileId });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
  const done = started.lines === 1 ? await runCheckFor(started.runId, 12_000) : false;
  if (!done) scheduleNext(req.nextUrl.origin, started.runId);
  return Response.json({ ...started, card: started.lines === 1 ? await verdictCard(started.runId) : null });
});
