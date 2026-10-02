import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { scheduleCall } from "@/lib/server/kick";
import { processHunt } from "@/lib/server/plHunt";

export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

/**
 * Work on a hunt for one budget (~40 s), then call itself again until it's done: no page needs to
 * be open. One worker at a time (a lease); waiting for Keepa tokens, it stops and the watchdog
 * carries on after the refill.
 */
export const POST = handle(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const p = await processHunt(id, 40_000);
  if (!p.done && !p.busy && !p.waiting) scheduleCall(req.nextUrl.origin, `/api/pl/hunt/${id}/process`);
  return Response.json(p);
});
