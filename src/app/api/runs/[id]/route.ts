import type { NextRequest } from "next/server";
import { db, must } from "@/lib/server/db";
import { handle } from "@/lib/server/http";

export const GET = handle(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const run = must(
    await db().from("runs").select("*, profile:profiles(name)").eq("id", id).maybeSingle(),
    "run",
  );
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });
  const results: unknown[] = [];
  // PostgREST caps a page at 1,000 rows.
  for (let from = 0; ; from += 1000) {
    const page = must(
      await db().from("results")
        .select("*, product:products(id, ean, asin, title, brand, category, dims_cm, weight_g, sales_rank), offer:offers(id, unit_cost, currency, unit_cost_gbp, moq, pack_units, stock, title, source_ref, supplier:suppliers(name))")
        .eq("run_id", id)
        .order("score", { ascending: false, nullsFirst: false })
        .range(from, from + 999),
      "results",
    ) as unknown[];
    results.push(...page);
    if (page.length < 1000) break;
  }
  return Response.json({ run, results });
});

export const DELETE = handle(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  must(await db().from("runs").delete().eq("id", id), "delete run");
  return Response.json({ ok: true });
});
