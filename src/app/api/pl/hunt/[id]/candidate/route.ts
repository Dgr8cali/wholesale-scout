import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { candidateFromNiche } from "@/lib/server/plHunt";

export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

/** { key }: a Private label candidate from that niche, filled from Keepa (reusing the hunt's snapshots). */
export const POST = handle(async (req: NextRequest, ctx: Ctx) => {
  const b = (await req.json().catch(() => ({}))) as { key?: string };
  if (!b.key) return Response.json({ error: "key required" }, { status: 400 });
  return Response.json(await candidateFromNiche((await ctx.params).id, b.key));
});
