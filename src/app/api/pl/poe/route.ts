import type { NextRequest } from "next/server";
import { extJson, extOptions } from "@/lib/server/extension";
import { handle } from "@/lib/server/http";
import { savePoe } from "@/lib/server/pl";
import { linkPoeCaptures } from "@/lib/server/plNiches";

export const OPTIONS = extOptions;
/**
 * From the extension, only when you click "Send to Private label" on Opportunity Explorer:
 * { nicheId, title, raw: { niche, growth } }. Stored, read for Gates 3 and 5, and attached to the
 * candidate whose niche keyword is the niche's title; otherwise the candidates come back to pick from.
 * An imported niche with that title (or alias) gets its best search-term conversion.
 */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { nicheId?: string; title?: string; raw?: unknown };
  if (!b.raw) return extJson({ error: "raw required" }, 400);
  const r = await savePoe({ nicheId: b.nicheId ?? null, title: b.title ?? null, raw: b.raw });
  // The imported niche it's for (Private label → Niches) gets its best term conversion.
  const niches = await linkPoeCaptures(r.snapshotId).catch((e) => { console.error(`[poe] niche link: ${(e as Error).message}`); return { linked: 0 }; });
  return extJson({ ...r, nichesLinked: niches.linked });
});
