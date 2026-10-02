import type { NextRequest } from "next/server";
import { validFilters, type NicheHuntFilters } from "@/lib/pl/hunt";
import { handle } from "@/lib/server/http";
import { listHunts, nicheHuntStart, runNicheHunt } from "@/lib/server/plHunt";

export const maxDuration = 60;

/** Categories, default filters, presets, dismissed niches, recent hunts and Keepa's balance (free). */
export const GET = handle(async () => Response.json({ ...(await nicheHuntStart()), hunts: await listHunts() }));

/** Run a hunt: { filters, name? }. Spends the finder page plus the detail of ASINs not fetched in 7 days. */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { filters?: Partial<NicheHuntFilters>; name?: string };
  const f = validFilters(b.filters ?? {});
  if (typeof f === "string") return Response.json({ error: f }, { status: 400 });
  return Response.json(await runNicheHunt(f, b.name));
});
