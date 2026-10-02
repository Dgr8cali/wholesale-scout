import type { NextRequest } from "next/server";
import { AI_MODELS } from "@/lib/ads/ai";
import { handle } from "@/lib/server/http";
import { aiSettings, aiSpend, saveAiSettings } from "@/lib/server/adsAi";

export const GET = handle(async () => Response.json({ settings: await aiSettings(), models: AI_MODELS, spend: await aiSpend() }));

/** { model?, inUsd?, outUsd?, gbpPerUsd?, reviewSchedule? }. */
export const PUT = handle(async (req: NextRequest) => {
  try {
    return Response.json({ settings: await saveAiSettings((await req.json().catch(() => ({}))) as never) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
