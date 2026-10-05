import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { refreshPriceTight, setField } from "@/lib/server/pl";

type Ctx = { params: Promise<{ id: string }> };

/** { key, value }: your own value for a Gatekeeper field (manual: no refresh overwrites it). Empty clears it. The target price band re-reads Gate 1's price spread. */
export const PUT = handle(async (req: NextRequest, ctx: Ctx) => {
  const b = (await req.json().catch(() => ({}))) as { key?: string; value?: string | null };
  if (!b.key) return Response.json({ error: "key required" }, { status: 400 });
  const id = (await ctx.params).id;
  await setField(id, b.key, b.value ?? null);
  // A new target price band: Gate 1's price spread is read again against it.
  const refilled = b.key === "bandMin" || b.key === "bandMax" ? await refreshPriceTight(id) : [];
  return Response.json({ ok: true, refilled });
});
