import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { createDocument, listDocuments, type NewDocument } from "@/lib/server/documents";

/** Documents for ?brand=, ?supplier= (id), or both with &apply=1 (an application's kit). */
export const GET = handle(async (req: NextRequest) => {
  const q = req.nextUrl.searchParams;
  return Response.json({ documents: await listDocuments({ brand: q.get("brand"), supplierId: q.get("supplier"), apply: q.get("apply") === "1" }) });
});

/** Start an upload: the document's details → { id, uploadUrl } to PUT the file to, then POST …/done. */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as NewDocument;
  if (!b.fileName) return Response.json({ error: "fileName required" }, { status: 400 });
  try {
    return Response.json(await createDocument(b));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
