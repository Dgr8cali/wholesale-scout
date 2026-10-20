import type { NextRequest } from "next/server";
import { actionLog, confirmAction, declineAction } from "@/lib/server/askScoutActions";
import { handle } from "@/lib/server/http";
import { whoOf } from "@/lib/server/who";

/** The action log: what was confirmed or declined from Ask Scout, by whom and when (newest 50). */
export const GET = handle(async () => Response.json({ log: await actionLog() }));

/** { run_id, action_id, decision: "confirm" | "decline" }: run one proposed action (once), or say No thanks. */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { run_id?: string; action_id?: string; decision?: string };
  if (!b.run_id || !b.action_id || !["confirm", "decline"].includes(b.decision ?? "")) return Response.json({ error: "run_id, action_id and decision (confirm or decline) are required" }, { status: 400 });
  try {
    if (b.decision === "decline") return Response.json({ log: await declineAction(b.run_id, b.action_id, whoOf(req)) });
    return Response.json(await confirmAction(b.run_id, b.action_id, whoOf(req)));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
