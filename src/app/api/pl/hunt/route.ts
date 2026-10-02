import type { NextRequest } from "next/server";
import { validFilters, type NicheHuntFilters } from "@/lib/pl/hunt";
import { handle } from "@/lib/server/http";
import { scheduleCall } from "@/lib/server/kick";
import { HuntRefused, listHunts, nicheHuntStart, startNicheHunt } from "@/lib/server/plHunt";

/** Categories, default filters, presets, dismissed niches, recent hunts and Keepa's balance (free). */
export const GET = handle(async () => Response.json({ ...(await nicheHuntStart()), hunts: await listHunts() }));

/**
 * Start a hunt in the background: { filters, name? }. Refused (409, with the plan) when its estimate
 * would eat into the 100-token reserve; the plan says how many leaves to detail would fit.
 */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { filters?: Partial<NicheHuntFilters>; name?: string };
  const f = validFilters(b.filters ?? {});
  if (typeof f === "string") return Response.json({ error: f }, { status: 400 });
  try {
    const r = await startNicheHunt(f, b.name);
    scheduleCall(req.nextUrl.origin, `/api/pl/hunt/${r.id}/process`);
    return Response.json(r);
  } catch (e) {
    if (e instanceof HuntRefused) return Response.json({ error: e.message, plan: e.plan }, { status: 409 });
    throw e;
  }
});
