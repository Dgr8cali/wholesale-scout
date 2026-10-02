import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { scheduleCall } from "@/lib/server/kick";
import { recheckIncumbents } from "@/lib/server/plHunt";

type Ctx = { params: Promise<{ id: string }> };

/** { limit? }: check a finished direct hunt's niches (3+ qualifying) for incumbents, ~31 tokens a niche. */
export const POST = handle(async (req: NextRequest, ctx: Ctx) => {
  const id = (await ctx.params).id;
  const b = (await req.json().catch(() => ({}))) as { limit?: number };
  try {
    const r = await recheckIncumbents(id, Math.min(30, Math.max(1, Math.round(Number(b.limit) || 10))));
    scheduleCall(req.nextUrl.origin, `/api/pl/hunt/${id}/process`);
    return Response.json(r);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
