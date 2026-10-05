import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { deleteCandidate, getCandidate, parseAsins, setAsins, switchReference, updateCandidate, type PlStatus } from "@/lib/server/pl";
import { rescoreLeads } from "@/lib/server/plSuppliers";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: NextRequest, ctx: Ctx) => {
  const c = await getCandidate((await ctx.params).id);
  return c ? Response.json(c) : Response.json({ error: "No such candidate" }, { status: 404 });
});

/** Name, niche keyword, category, status, notes, park_reason (parking needs one), unpark; a new ASIN list (refresh to fetch them); or { reference } for Gate 2. */
export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const b = (await req.json().catch(() => ({}))) as { name?: string; niche_keyword?: string | null; category?: string; status?: PlStatus; notes?: string | null; park_reason?: string | null; unpark?: boolean; asins?: string; reference?: string };
  // Gate 2's reference listing: Gate 2 runs again (a 7-day snapshot reused; else ~3 Keepa tokens).
  if (b.reference) {
    try {
      return Response.json(await switchReference(id, b.reference, { pinned: true, fetch: true }));
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 400 });
    }
  }
  try {
    await updateCandidate(id, b);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
  if (b.asins != null) await setAsins(id, parseAsins(b.asins));
  // The product words come from the name and niche keyword: the supplier leads are scored again.
  if (b.name != null || b.niche_keyword !== undefined) await rescoreLeads(id);
  return Response.json({ ok: true });
});

export const DELETE = handle(async (_req: NextRequest, ctx: Ctx) => {
  await deleteCandidate((await ctx.params).id);
  return Response.json({ ok: true });
});
