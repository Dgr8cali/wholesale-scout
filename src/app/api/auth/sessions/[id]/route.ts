import type { NextRequest } from "next/server";
import { revokeSessions } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";

type Ctx = { params: Promise<{ id: string }> };

/** Sign one device out. */
export const DELETE = handle(async (_req: NextRequest, ctx: Ctx) => {
  await revokeSessions((await ctx.params).id);
  return Response.json({ ok: true });
});
