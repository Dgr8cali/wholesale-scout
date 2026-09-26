import type { NextRequest } from "next/server";
import type { CostInput } from "@/lib/costOverride";
import { clearCostOverride, setCostOverride } from "@/lib/server/costOverrides";
import { handle } from "@/lib/server/http";

const ids = (b: { resultIds?: unknown }) => (Array.isArray(b.resultIds) ? b.resultIds.filter((x): x is string => typeof x === "string").slice(0, 5000) : []);

/**
 * Set a cost override for the rows' products: { resultIds, cost: { landedGbp } or { priceGbp,
 * vatBasis }, plus supplierName?, note? }. The rows are re-scored now, from stored data.
 */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json()) as { resultIds?: unknown; cost?: CostInput };
  const resultIds = ids(b);
  if (!resultIds.length) return Response.json({ error: "No rows" }, { status: 400 });
  try {
    return Response.json({ ok: true, ...(await setCostOverride(resultIds, b.cost ?? {})) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});

/** Clear the cost override for the rows' products: { resultIds }. */
export const DELETE = handle(async (req: NextRequest) => {
  const resultIds = ids((await req.json()) as { resultIds?: unknown });
  if (!resultIds.length) return Response.json({ error: "No rows" }, { status: 400 });
  return Response.json({ ok: true, ...(await clearCostOverride(resultIds)) });
});
