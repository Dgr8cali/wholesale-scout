import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { restoreSnapshot } from "@/lib/server/adsOps";

type Ctx = { params: Promise<{ id: string }> };

/** The bulk sheet back to the snapshot, as a batch. */
export const POST = handle(async (_req: NextRequest, ctx: Ctx) => {
  try {
    return Response.json(await restoreSnapshot((await ctx.params).id));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
