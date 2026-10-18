import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { discardBatch } from "@/lib/server/adsOps";

type Ctx = { params: Promise<{ id: string }> };

/** A batch that was never uploaded, removed, and what writing it did here undone. */
export const POST = handle(async (_req: NextRequest, ctx: Ctx) => {
  try {
    return Response.json(await discardBatch((await ctx.params).id));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
