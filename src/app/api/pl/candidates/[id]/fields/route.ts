import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { setField } from "@/lib/server/pl";

type Ctx = { params: Promise<{ id: string }> };

/** { key, value }: your own value for a Gatekeeper field (manual: no refresh overwrites it). Empty clears it. */
export const PUT = handle(async (req: NextRequest, ctx: Ctx) => {
  const b = (await req.json().catch(() => ({}))) as { key?: string; value?: string | null };
  if (!b.key) return Response.json({ error: "key required" }, { status: 400 });
  await setField((await ctx.params).id, b.key, b.value ?? null);
  return Response.json({ ok: true });
});
