import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { RANK_RUN_CAP, rankHistory, rankTargets, recordRanks } from "@/lib/server/adsOps";

/** The products to rank-check with their tracked keywords (the extension's list), and the checks so far. */
export const GET = handle(async () => Response.json({ targets: await rankTargets(), history: await rankHistory(), cap: RANK_RUN_CAP }));

/** { asin, runId, results: [{ keyword, position (1–48 or null), page, checkedAt }] }: one manual run from the extension. */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { asin?: string; runId?: string; results?: { keyword: string; position: number | null; page: number | null; checkedAt?: string }[] };
  if (!Array.isArray(b.results)) return Response.json({ error: "results: [{ keyword, position, page }]" }, { status: 400 });
  try {
    return Response.json(await recordRanks(String(b.asin ?? "").toUpperCase(), b.runId ?? null, b.results));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
