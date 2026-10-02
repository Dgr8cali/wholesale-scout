import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { adjust } from "@/lib/server/stock";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: NextRequest, ctx: Ctx) => {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    return Response.json({ movement: await adjust({ ...b, itemId: (await ctx.params).id } as never) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
