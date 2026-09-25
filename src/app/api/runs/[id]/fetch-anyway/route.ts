import type { NextRequest } from "next/server";
import { fetchAnyway, runCheckFor, verdictCard } from "@/lib/server/check";
import { handle } from "@/lib/server/http";
import { scheduleNext } from "@/lib/server/kick";

export const maxDuration = 60;

/** "Fetch anyway" on a check: gather every source past the failing gate, and return the card. */
export const POST = handle(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  await fetchAnyway(id);
  const done = await runCheckFor(id, 12_000);
  if (!done) scheduleNext(req.nextUrl.origin, id);
  return Response.json({ card: await verdictCard(id) });
});
