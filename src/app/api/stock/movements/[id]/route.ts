import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { deleteMovement, editMovement } from "@/lib/server/stockEdit";

type Ctx = { params: Promise<{ id: string }> };

/** Edit: { quantity?, date?, bucket?, reason?, note?, unit_cost? } (a sale or transfer keeps its other side in step). */
export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  try {
    return Response.json(await editMovement((await ctx.params).id, (await req.json().catch(() => ({}))) as never));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});

/** Delete, with what goes with it (a sale's sale, a transfer's other half; a receipt's order back to Ordered). */
export const DELETE = handle(async (_req: NextRequest, ctx: Ctx) => {
  try {
    return Response.json(await deleteMovement((await ctx.params).id));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
