import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { setLaunchStep } from "@/lib/server/plQuotes";

type Ctx = { params: Promise<{ id: string }> };

/** { step, done?, done_on?, note?, spend? }: one checklist step; the status follows. */
export const PUT = handle(async (req: NextRequest, ctx: Ctx) => {
  const b = (await req.json().catch(() => ({}))) as { step?: string; done?: boolean; done_on?: string | null; note?: string | null; spend?: number | null };
  try {
    return Response.json(await setLaunchStep((await ctx.params).id, String(b.step ?? ""), b));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
