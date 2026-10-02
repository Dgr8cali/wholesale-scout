import type { NextRequest } from "next/server";
import { buildReviewContext, estimateTokens } from "@/lib/ads/ai";
import { handle } from "@/lib/server/http";
import { latestAi, monthlyReview, reviewInput } from "@/lib/server/adsAi";

export const maxDuration = 60;
const isMonth = (m: unknown): m is string => typeof m === "string" && /^\d{4}-\d{2}$/.test(m);

/** ?month=YYYY-MM: the latest review (no API call); &preview=1: the data that would be sent. */
export const GET = handle(async (req: NextRequest) => {
  const month = req.nextUrl.searchParams.get("month");
  if (!isMonth(month)) return Response.json({ error: "?month=YYYY-MM" }, { status: 400 });
  if (req.nextUrl.searchParams.get("preview") === "1") {
    try {
      const context = buildReviewContext(await reviewInput(month));
      return Response.json({ context, contextTokens: estimateTokens(context) });
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 400 });
    }
  }
  return Response.json({ latest: await latestAi("review", month) });
});

/** { month, force? }: the monthly review (on your click, or the schedule you turned on). */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { month?: string; force?: boolean };
  if (!isMonth(b.month)) return Response.json({ error: "month: YYYY-MM" }, { status: 400 });
  try {
    return Response.json(await monthlyReview(b.month, { force: !!b.force }));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
