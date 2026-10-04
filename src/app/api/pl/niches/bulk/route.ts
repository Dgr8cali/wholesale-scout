import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { bulkNicheStatus } from "@/lib/server/plNiches";

/** { ids, status: "shortlisted" | "dismissed" | "new" }. */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { ids?: string[]; status?: "shortlisted" | "dismissed" | "new" };
  if (!Array.isArray(b.ids) || !b.ids.length) return Response.json({ error: "{ ids, status }" }, { status: 400 });
  try {
    return Response.json(await bulkNicheStatus(b.ids, b.status ?? "shortlisted"));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
