import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { revertBatch } from "@/lib/server/adsOps";

type Ctx = { params: Promise<{ id: string }> };

/** The inverse bulk sheet of a batch, as a new batch linked to it. */
export const POST = handle(async (_req: NextRequest, ctx: Ctx) => {
  try {
    return Response.json(await revertBatch((await ctx.params).id));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
