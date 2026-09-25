import type { NextRequest } from "next/server";
import { db, must } from "@/lib/server/db";
import { handle } from "@/lib/server/http";

type Ctx = { params: Promise<{ id: string }> };

/** Switch a preset's nightly re-pull on or off. */
export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = (await req.json()) as { nightly?: boolean };
  if (typeof body.nightly !== "boolean") return Response.json({ error: "nightly must be true or false" }, { status: 400 });
  must(await db().from("qogita_presets").update({ nightly: body.nightly, updated_at: new Date().toISOString() }).eq("id", id), "preset");
  return Response.json({ ok: true });
});

export const DELETE = handle(async (_req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  must(await db().from("qogita_presets").delete().eq("id", id), "delete preset");
  return Response.json({ ok: true });
});
