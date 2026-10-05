import type { NextRequest } from "next/server";
import { extJson, extOptions } from "@/lib/server/extension";
import { handle } from "@/lib/server/http";
import { candidatesWithAsin, saveCapturedReviews } from "@/lib/server/plReviews";
import { db, must } from "@/lib/server/db";

export const OPTIONS = extOptions;

/**
 * From the extension, only when you click "Send reviews to Private label" on amazon.co.uk's review
 * pages: { asin, reviews, candidateId?, mode? }. Saved into the Gate 4 dump of the one candidate
 * with that ASIN among its page-one ASINs; with several (or none), the candidates come back to pick
 * from. A dump you pasted by hand comes back as a conflict until mode is "replace" or "append".
 */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { asin?: string; reviews?: unknown; candidateId?: string; mode?: "replace" | "append" };
  const asin = (b.asin ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(asin)) return extJson({ error: "asin required" }, 400);
  const withAsin = await candidatesWithAsin(asin);
  let target = b.candidateId ? { id: b.candidateId } : withAsin.length === 1 ? withAsin[0] : null;
  if (!target) {
    // None has it: any candidate (not dropped) can take it; several have it: pick one of those.
    const pick = withAsin.length ? withAsin : (must(await db().from("pl_candidates").select("id, name, niche_keyword, status").neq("status", "dropped").order("updated_at", { ascending: false }), "candidates") as { id: string; name: string; niche_keyword: string | null; status: string }[]);
    return extJson({ saved: null, pick, hasAsin: withAsin.length > 0 });
  }
  const c = (await db().from("pl_candidates").select("id, name").eq("id", target.id).maybeSingle()).data as { id: string; name: string } | null;
  if (!c) return extJson({ error: "No such candidate" }, 404);
  target = c;
  try {
    const r = await saveCapturedReviews(c.id, asin, b.reviews, b.mode);
    return extJson({ saved: r.conflict ? null : r, conflict: r.conflict ? r : null, candidate: { id: c.id, name: c.name } });
  } catch (e) {
    return extJson({ error: (e as Error).message }, 400);
  }
});
