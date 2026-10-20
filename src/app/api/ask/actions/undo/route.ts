import type { NextRequest } from "next/server";
import { undoAction } from "@/lib/server/askScoutActions";
import { handle } from "@/lib/server/http";

/** { log_id }: undo a confirmed action (within two minutes): the record goes back to how it was. */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { log_id?: string };
  if (!b.log_id) return Response.json({ error: "log_id is required" }, { status: 400 });
  try {
    return Response.json({ log: await undoAction(b.log_id) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
