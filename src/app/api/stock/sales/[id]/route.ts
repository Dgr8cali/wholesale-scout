import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { deleteSale } from "@/lib/server/stockEdit";

type Ctx = { params: Promise<{ id: string }> };

/** Delete a sale: its stock movement (and any returns) go with it. */
export const DELETE = handle(async (_req: NextRequest, ctx: Ctx) => {
  try {
    return Response.json(await deleteSale((await ctx.params).id));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
