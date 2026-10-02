import type { NextRequest } from "next/server";
import type { NicheHuntFilters } from "@/lib/pl/hunt";
import { handle } from "@/lib/server/http";
import { requalifyHunt } from "@/lib/server/plHunt";

type Ctx = { params: Promise<{ id: string }> };

/** { thresholds, strict? }: qualify the hunt's cached detail again with these thresholds (0 tokens). */
export const POST = handle(async (req: NextRequest, ctx: Ctx) => {
  const b = (await req.json().catch(() => ({}))) as { thresholds?: Partial<NicheHuntFilters>; strict?: boolean };
  return Response.json(await requalifyHunt((await ctx.params).id, b.thresholds ?? {}, { strict: !!b.strict }));
});
