import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { checkNicheIncumbents, nicheCheckPlan, nicheToCandidate, updateNiche } from "@/lib/server/plNiches";

type Ctx = { params: Promise<{ id: string }> };
export const maxDuration = 60;

/** ?plan=1: what an incumbent check would cost now, and whether it can run (no Keepa call). */
export const GET = handle(async (_req: NextRequest, ctx: Ctx) => {
  try {
    return Response.json(await nicheCheckPlan((await ctx.params).id));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});

/** { status?, notes? }. */
export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  try {
    return Response.json({ niche: await updateNiche((await ctx.params).id, (await req.json().catch(() => ({}))) as never) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});

/** { action: "candidate" } makes a Private label candidate; { action: "check" } runs the incumbent check (Keepa). */
export const POST = handle(async (req: NextRequest, ctx: Ctx) => {
  const id = (await ctx.params).id;
  const b = (await req.json().catch(() => ({}))) as { action?: string };
  try {
    if (b.action === "candidate") return Response.json(await nicheToCandidate(id));
    if (b.action === "check") return Response.json(await checkNicheIncumbents(id));
    return Response.json({ error: "action: candidate or check" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
