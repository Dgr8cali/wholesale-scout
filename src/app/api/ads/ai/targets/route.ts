import type { NextRequest } from "next/server";
import { buildTargetsContext, estimateTokens } from "@/lib/ads/ai";
import { handle } from "@/lib/server/http";
import { recommendTargets, targetsInput, latestAi } from "@/lib/server/adsAi";

export const maxDuration = 60;
const asinOf = (v: unknown) => String(v ?? "").toUpperCase();

/** ?asin=: the latest answer (no API call); &preview=1: the data that would be sent. */
export const GET = handle(async (req: NextRequest) => {
  const asin = asinOf(req.nextUrl.searchParams.get("asin"));
  if (!/^[A-Z0-9]{10}$/.test(asin)) return Response.json({ error: "?asin=" }, { status: 400 });
  if (req.nextUrl.searchParams.get("preview") === "1") {
    try {
      const input = await targetsInput(asin);
      const context = buildTargetsContext(input);
      return Response.json({ input, context, contextTokens: estimateTokens(context) });
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 400 });
    }
  }
  return Response.json({ latest: await latestAi("targets", asin) });
});

/** { asin, force? }: ask the model (on your click only); the same data returns the stored answer unless force. */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { asin?: string; force?: boolean };
  const asin = asinOf(b.asin);
  if (!/^[A-Z0-9]{10}$/.test(asin)) return Response.json({ error: "asin" }, { status: 400 });
  try {
    return Response.json(await recommendTargets(asin, { force: !!b.force }));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
