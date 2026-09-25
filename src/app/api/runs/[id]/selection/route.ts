import { after, type NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { kickRun } from "@/lib/server/kick";
import { removeFromRun, runFromSelection } from "@/lib/server/runs";

type Ctx = { params: Promise<{ id: string }> };

/** Re-screen selected rows as a new run: { resultIds, profileId? }. */
export const POST = handle(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const b = (await req.json()) as { resultIds?: string[]; profileId?: string };
  if (!Array.isArray(b.resultIds) || !b.resultIds.length) return Response.json({ error: "Select some rows" }, { status: 400 });
  try {
    const r = await runFromSelection(id, b.resultIds, b.profileId);
    after(() => kickRun(req.nextUrl.origin, r.runId));
    return Response.json(r);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});

/** Remove selected rows from this run: { resultIds }. */
export const DELETE = handle(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const b = (await req.json()) as { resultIds?: string[] };
  if (!Array.isArray(b.resultIds) || !b.resultIds.length) return Response.json({ error: "Select some rows" }, { status: 400 });
  return Response.json({ removed: await removeFromRun(id, b.resultIds) });
});
