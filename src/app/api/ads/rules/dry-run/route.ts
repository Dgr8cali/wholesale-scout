import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { dryRun } from "@/lib/server/adsRules";
import type { RuleConfig } from "@/lib/ads/rules";

/** { config? }: what each rule would propose against the current data (the saved settings when none given). Nothing is saved. */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { config?: Record<string, Partial<RuleConfig>> };
  return Response.json(await dryRun(b.config));
});
