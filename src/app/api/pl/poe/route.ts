import type { NextRequest } from "next/server";
import { extJson, extOptions } from "@/lib/server/extension";
import { handle } from "@/lib/server/http";
import { savePoe } from "@/lib/server/pl";

export const OPTIONS = extOptions;
/**
 * From the extension, only when you click "Send to Private label" on Opportunity Explorer:
 * { nicheId, title, raw: { niche, growth } }. Stored, read for Gates 3 and 5, and attached to the
 * candidate whose niche keyword is the niche's title; otherwise the candidates come back to pick from.
 */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { nicheId?: string; title?: string; raw?: unknown };
  if (!b.raw) return extJson({ error: "raw required" }, 400);
  return extJson(await savePoe({ nicheId: b.nicheId ?? null, title: b.title ?? null, raw: b.raw }));
});
