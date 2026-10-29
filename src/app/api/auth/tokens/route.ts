import type { NextRequest } from "next/server";
import { createApiToken } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";

/** { name }: a new extension token. The whole token is in this answer only; it can't be shown again. */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { name?: string };
  const { token, row } = await createApiToken(b.name ?? "");
  return Response.json({ token, id: row.id }, { headers: { "Cache-Control": "no-store" } });
});
