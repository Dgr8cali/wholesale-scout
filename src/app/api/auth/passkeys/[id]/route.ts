import type { NextRequest } from "next/server";
import { listPasskeys } from "@/lib/server/auth";
import { db, must } from "@/lib/server/db";
import { handle } from "@/lib/server/http";

type Ctx = { params: Promise<{ id: string }> };

/** Remove a passkey (a lost phone's). Not the last one: that would leave only email to sign in. */
export const DELETE = handle(async (_req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const keys = await listPasskeys();
  if (!keys.some((k) => k.id === id)) return Response.json({ error: "No such passkey" }, { status: 404 });
  if (keys.length === 1) return Response.json({ error: "That's your only passkey: add another before removing it." }, { status: 400 });
  must(await db().from("auth_passkeys").delete().eq("id", id), "remove passkey");
  return Response.json({ ok: true });
});
