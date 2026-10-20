import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { setStepState } from "@/lib/server/nextSteps";

/** Later (snooze 24 h), Done (dismiss until the condition changes) or restore one step. */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json()) as { id?: string; action?: string; fingerprint?: string | null };
  if (!b.id || !["snooze", "dismiss", "restore"].includes(b.action ?? "")) return Response.json({ error: "id and action (snooze, dismiss or restore) are required" }, { status: 400 });
  return Response.json(await setStepState(b.id, b.action as "snooze" | "dismiss" | "restore", b.fingerprint ?? null));
});
