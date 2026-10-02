import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { cancelHunt } from "@/lib/server/plHunt";

type Ctx = { params: Promise<{ id: string }> };

/** Stop a hunt that's still running; what it found so far stays. */
export const POST = handle(async (_req: NextRequest, ctx: Ctx) => {
  await cancelHunt((await ctx.params).id);
  return Response.json({ ok: true });
});
