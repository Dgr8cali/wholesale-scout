import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { addWaiver, removeWaiver } from "@/lib/server/pl";

type Ctx = { params: Promise<{ id: string }> };

/** { gate_id: "g0"–"g7", check_label?: one check's label (none: the whole gate), reason }. */
export const POST = handle(async (req: NextRequest, ctx: Ctx) => {
  const b = (await req.json().catch(() => ({}))) as { gate_id?: string; check_label?: string | null; reason?: string };
  try {
    return Response.json({ waiver: await addWaiver((await ctx.params).id, b) });
  } catch (e) {
    const m = (e as Error).message;
    if (/gate_id|reason/.test(m)) return Response.json({ error: m }, { status: 400 });
    throw e;
  }
});

/** ?waiver=<id>: remove it. */
export const DELETE = handle(async (req: NextRequest, ctx: Ctx) => {
  const w = req.nextUrl.searchParams.get("waiver");
  if (!w) return Response.json({ error: "waiver required" }, { status: 400 });
  await removeWaiver((await ctx.params).id, w);
  return Response.json({ ok: true });
});
