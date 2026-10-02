import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { getItem, saveItem } from "@/lib/server/stock";

type Ctx = { params: Promise<{ id: string }> };

/** The item, its listings, movements and sales. */
export const GET = handle(async (_req: NextRequest, ctx: Ctx) => {
  const r = await getItem((await ctx.params).id);
  return r ? Response.json(r) : Response.json({ error: "No such item" }, { status: 404 });
});

export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  try {
    return Response.json({ item: await saveItem((await ctx.params).id, (await req.json().catch(() => ({}))) as Record<string, unknown>) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
