import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { moveStage } from "@/lib/server/plPipeline";

type Ctx = { params: Promise<{ id: string }> };

/** { stage }: move the candidate to a pipeline column (the page confirms a backwards move); the status follows. */
export const POST = handle(async (req: NextRequest, ctx: Ctx) => {
  const b = (await req.json().catch(() => ({}))) as { stage?: string };
  try {
    return Response.json({ card: await moveStage((await ctx.params).id, String(b.stage ?? "")) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
