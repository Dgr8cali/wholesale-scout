import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { saveItem } from "@/lib/server/stock";

/** A new stock item. */
export const POST = handle(async (req: NextRequest) => {
  try {
    return Response.json({ item: await saveItem(null, (await req.json().catch(() => ({}))) as Record<string, unknown>) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
