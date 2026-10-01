import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { deleteCandidate, getCandidate, parseAsins, setAsins, updateCandidate, type PlStatus } from "@/lib/server/pl";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: NextRequest, ctx: Ctx) => {
  const c = await getCandidate((await ctx.params).id);
  return c ? Response.json(c) : Response.json({ error: "No such candidate" }, { status: 404 });
});

/** Name, niche keyword, category, status, notes; or a new ASIN list (refresh to fetch them). */
export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const b = (await req.json().catch(() => ({}))) as { name?: string; niche_keyword?: string | null; category?: string; status?: PlStatus; notes?: string | null; asins?: string };
  await updateCandidate(id, b);
  if (b.asins != null) await setAsins(id, parseAsins(b.asins));
  return Response.json({ ok: true });
});

export const DELETE = handle(async (_req: NextRequest, ctx: Ctx) => {
  await deleteCandidate((await ctx.params).id);
  return Response.json({ ok: true });
});
