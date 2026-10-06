import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { addReviewedAsin, keepReviewsSeparate, reviewData, saveReviewDump, savePasteAll, setReviewMark, type ReviewMark } from "@/lib/server/plReviews";

type Ctx = { params: Promise<{ id: string }> };

/** The pasted 1–3★ reviews, the theme marks, the synonym list and the last summary (no API call). */
export const GET = handle(async (_req: NextRequest, ctx: Ctx) => Response.json(await reviewData((await ctx.params).id)));

/** { asin, text }: one listing's reviews (empty removes them); or { all }: "Paste all" with "ASIN: B0…" lines. */
export const PUT = handle(async (req: NextRequest, ctx: Ctx) => {
  const id = (await ctx.params).id;
  const b = (await req.json().catch(() => ({}))) as { asin?: string; text?: string; all?: string };
  try {
    if (typeof b.all === "string") return Response.json({ ...(await savePasteAll(id, b.all)), ...(await reviewData(id)) });
    if (!b.asin || typeof b.text !== "string") return Response.json({ error: "{ asin, text } or { all }" }, { status: 400 });
    await saveReviewDump(id, b.asin, b.text);
    return Response.json(await reviewData(id));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});

/**
 * Reviews for an ASIN that isn't on the candidate: { action: "add-asin", asin } adds it to the
 * page-one ASINs (Keepa fills it on the next refresh); { action: "keep-separate", asin } keeps its box apart.
 */
export const POST = handle(async (req: NextRequest, ctx: Ctx) => {
  const id = (await ctx.params).id;
  const b = (await req.json().catch(() => ({}))) as { action?: string; asin?: string };
  try {
    if (!b.asin) return Response.json({ error: "asin required" }, { status: 400 });
    if (b.action === "add-asin") return Response.json({ asins: await addReviewedAsin(id, b.asin), ...(await reviewData(id)) });
    if (b.action === "keep-separate") { await keepReviewsSeparate(id, b.asin); return Response.json(await reviewData(id)); }
    return Response.json({ error: "action: add-asin or keep-separate" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});

/** { theme, mark: "chosen" | "not fixable" | "ignore" | null }. */
export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  const id = (await ctx.params).id;
  const b = (await req.json().catch(() => ({}))) as { theme?: string; mark?: ReviewMark | null };
  try {
    await setReviewMark(id, b.theme ?? "", b.mark ?? null);
    return Response.json(await reviewData(id));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
