import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { archiveItem, purgeItem, restoreItem } from "@/lib/server/stockEdit";

type Ctx = { params: Promise<{ id: string }> };

/** { action: "archive" | "restore" | "purge" }: purge (delete permanently) only for an archived item. */
export const POST = handle(async (req: NextRequest, ctx: Ctx) => {
  const id = (await ctx.params).id;
  const b = (await req.json().catch(() => ({}))) as { action?: string };
  try {
    if (b.action === "restore") return Response.json({ item: await restoreItem(id) });
    if (b.action === "purge") return Response.json({ removed: await purgeItem(id) });
    return Response.json({ item: await archiveItem(id) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
