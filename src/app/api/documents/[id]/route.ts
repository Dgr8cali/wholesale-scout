import type { NextRequest } from "next/server";
import type { DocKind } from "@/lib/documents";
import { handle } from "@/lib/server/http";
import { deleteDocument, updateDocument } from "@/lib/server/documents";

type Ctx = { params: Promise<{ id: string }> };

/** Change a document's type, date, note or brands. */
export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  const b = (await req.json().catch(() => ({}))) as { kind?: DocKind; date?: string | null; note?: string | null; brands?: string[] };
  await updateDocument((await ctx.params).id, b);
  return Response.json({ ok: true });
});

/** Delete the document and its file. */
export const DELETE = handle(async (_req: NextRequest, ctx: Ctx) => {
  await deleteDocument((await ctx.params).id);
  return Response.json({ ok: true });
});
