import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { deleteImport, listImports } from "@/lib/server/ads";

export const GET = handle(async () => Response.json({ imports: await listImports() }));

/** ?id=: undo an import (the rows it last wrote go with it). */
export const DELETE = handle(async (req: NextRequest) => {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  await deleteImport(id);
  return Response.json({ ok: true });
});
