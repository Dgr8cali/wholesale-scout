import type { NextRequest } from "next/server";
import { adsSettings, saveAdsSettings } from "@/lib/server/ads";
import { handle } from "@/lib/server/http";

export const GET = handle(async () => Response.json({ settings: await adsSettings() }));

/** { targetAcos?, cpc?, cpcAuto?, smoothingK?, ctrBenchmark? }. */
export const PUT = handle(async (req: NextRequest) => {
  try {
    return Response.json({ settings: await saveAdsSettings((await req.json().catch(() => ({}))) as Record<string, never>) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
