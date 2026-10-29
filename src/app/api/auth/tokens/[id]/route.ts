import type { NextRequest } from "next/server";
import { revokeApiToken } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";

type Ctx = { params: Promise<{ id: string }> };

/** Revoke a token: the extension using it stops working at once. */
export const DELETE = handle(async (_req: NextRequest, ctx: Ctx) => {
  await revokeApiToken((await ctx.params).id);
  return Response.json({ ok: true });
});
