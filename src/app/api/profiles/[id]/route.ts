import type { NextRequest } from "next/server";
import { invalidNumbers, withDefaults, type ProfileConfig } from "@/lib/screening/config";
import { db, must } from "@/lib/server/db";
import { handle } from "@/lib/server/http";

type Ctx = { params: Promise<{ id: string }> };

/** Rename, replace the config, or set as default. */
export const PUT = handle(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = (await req.json()) as { name?: string; config?: ProfileConfig; is_default?: boolean };
  if (body.config) {
    const bad = invalidNumbers(withDefaults(body.config));
    if (bad.length) return Response.json({ error: `These settings need a number: ${bad.join(", ")}` }, { status: 400 });
  }
  const weights = body.config?.score?.weights;
  if (weights) {
    const sum = Object.values(weights).reduce((a, b) => a + Number(b), 0);
    if (Math.abs(sum - 100) > 0.01) return Response.json({ error: `Group weights must sum to 100 (they sum to ${sum})` }, { status: 400 });
  }
  if (body.is_default) {
    must(await db().from("profiles").update({ is_default: false }).eq("is_default", true), "clear default");
  }
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name?.trim()) update.name = body.name.trim();
  if (body.config) update.config = withDefaults(body.config);
  if (body.is_default) update.is_default = true;
  const res = await db().from("profiles").update(update).eq("id", id);
  if (res.error?.code === "23505") return Response.json({ error: "That name is taken" }, { status: 409 });
  must(res, "update profile");
  return Response.json({ ok: true });
});

export const DELETE = handle(async (_req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const p = must(await db().from("profiles").select("is_default").eq("id", id).single(), "profile") as { is_default: boolean };
  if (p.is_default) return Response.json({ error: "Set another profile as default first" }, { status: 400 });
  must(await db().from("profiles").delete().eq("id", id), "delete profile");
  return Response.json({ ok: true });
});
