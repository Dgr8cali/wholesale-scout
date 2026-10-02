import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { rulesConfig, saveRule } from "@/lib/server/adsRules";
import type { RuleConfig } from "@/lib/ads/rules";

export const GET = handle(async () => Response.json({ config: await rulesConfig() }));

/** { rule, enabled?, mode?, thresholds? }: one rule's settings. */
export const PUT = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { rule?: string } & Partial<RuleConfig>;
  try {
    return Response.json({ config: await saveRule(String(b.rule ?? ""), { enabled: b.enabled, mode: b.mode, thresholds: b.thresholds }) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
