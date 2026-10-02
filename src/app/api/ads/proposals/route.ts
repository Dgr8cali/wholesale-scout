import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { decide, listProposals } from "@/lib/server/adsRules";

export const maxDuration = 60;

/** The rules run first, so the list is current. */
export const GET = handle(async () => Response.json(await listProposals()));

/** { ids, action: approve | skip | snooze | reopen }. */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { ids?: unknown; action?: string };
  const ids = Array.isArray(b.ids) ? b.ids.filter((x): x is string => typeof x === "string") : [];
  if (!["approve", "skip", "snooze", "reopen"].includes(b.action ?? "")) return Response.json({ error: "action: approve, skip, snooze or reopen" }, { status: 400 });
  await decide(ids, b.action as "approve");
  return Response.json({ ok: true });
});
