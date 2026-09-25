import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { supplierDetail, updateSupplier } from "@/lib/server/suppliers";

/** One supplier's record, figures, best products and runs. */
export const GET = handle(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const detail = await supplierDetail((await ctx.params).id);
  return detail ? Response.json(detail) : Response.json({ error: "Supplier not found" }, { status: 404 });
});

/** Save ledger fields: { website?, contact?, mov?, delivery_days?, importer_of_record?, … }. */
export const PATCH = handle(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  try {
    return Response.json({ supplier: await updateSupplier((await ctx.params).id, await req.json()) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
