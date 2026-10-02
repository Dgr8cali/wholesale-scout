import type { NextRequest } from "next/server";
import { DEFAULT_SYNONYMS } from "@/lib/pl/reviews";
import { handle } from "@/lib/server/http";
import { reviewSynonyms, saveReviewSynonyms } from "@/lib/server/plReviews";

/** The review miner's synonym list (shared by every candidate), and the defaults. */
export const GET = handle(async () => Response.json({ synonyms: await reviewSynonyms(), defaults: DEFAULT_SYNONYMS }));

/** { synonyms: [{ theme, canon, terms }] }, or { synonyms: null } to reset to the defaults. */
export const PUT = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { synonyms?: unknown };
  try {
    return Response.json({ synonyms: await saveReviewSynonyms(b.synonyms ?? null) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
