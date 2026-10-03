import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { bulkItems } from "@/lib/server/stockEdit";

/** { ids, action: "archive" | "restore" | "purge" } for several items at once. */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { ids?: string[]; action?: "archive" | "restore" | "purge" };
  if (!Array.isArray(b.ids) || !b.ids.length || !["archive", "restore", "purge"].includes(String(b.action))) return Response.json({ error: "{ ids, action }" }, { status: 400 });
  try {
    return Response.json(await bulkItems(b.ids, b.action!));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
