import type { NextRequest } from "next/server";
import { db } from "@/lib/server/db";
import { extJson, extOptions } from "@/lib/server/extension";
import { handle } from "@/lib/server/http";
import { leadCandidates, saveCapturedLeads } from "@/lib/server/plSuppliers";

export const OPTIONS = extOptions;
export const maxDuration = 60;

/**
 * From the extension, only when you click "Send suppliers to Private label" on an Alibaba results
 * page: { candidateId?, cards, unparsed? }. Without a candidate, the candidates come back to pick
 * from. Saved as that candidate's supplier leads (one per listing; a re-capture keeps status and notes).
 */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { candidateId?: string; cards?: unknown[]; unparsed?: unknown[] };
  if (!Array.isArray(b.cards) || !b.cards.length) return extJson({ error: "No supplier cards captured on this page" }, 400);
  if (!b.candidateId) return extJson({ saved: null, pick: await leadCandidates() });
  const c = (await db().from("pl_candidates").select("id, name").eq("id", b.candidateId).maybeSingle()).data as { id: string; name: string } | null;
  if (!c) return extJson({ error: "No such candidate" }, 404);
  if (Array.isArray(b.unparsed) && b.unparsed.length) console.warn(`[suppliers] ${b.unparsed.length} Alibaba card(s) the extension couldn't read`, JSON.stringify(b.unparsed).slice(0, 2000));
  try {
    return extJson({ saved: await saveCapturedLeads(c.id, b.cards), candidate: c });
  } catch (e) {
    return extJson({ error: (e as Error).message }, 400);
  }
});
