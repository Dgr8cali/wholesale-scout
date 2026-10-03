import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { getItem, saveItem } from "@/lib/server/stock";
import { itemImpact } from "@/lib/server/stockEdit";

type Ctx = { params: Promise<{ id: string }> };

/** The item, its listings, movements and sales. ?impact=1: only what deleting it takes with it. */
export const GET = handle(async (req: NextRequest, ctx: Ctx) => {
  if (req.nextUrl.searchParams.get("impact") === "1") return Response.json({ impact: await itemImpact((await ctx.params).id) });
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
