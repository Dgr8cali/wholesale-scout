import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { returnSale } from "@/lib/server/stock";

type Ctx = { params: Promise<{ id: string }> };

/** { quantity, bucket, reason?, date? }: units of the sale back into a bucket. */
export const POST = handle(async (req: NextRequest, ctx: Ctx) => {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    return Response.json({ movement: await returnSale({ ...b, saleId: (await ctx.params).id } as never) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
