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
        .select("*, product:products(*), offer:offers(id, unit_cost, currency, unit_cost_gbp, cost_known, moq, pack_units, stock, title, source_ref, supplier:suppliers(id, name))")
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

/** Rename a run. */
export const PATCH = handle(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const body = (await req.json()) as { name?: string; archived?: boolean };
  // Archive / unarchive.
  if (typeof body.archived === "boolean") {
    const res = await db().from("runs").update({ archived_at: body.archived ? new Date().toISOString() : null }).eq("id", id);
    if (res.error && /archived_at/.test(res.error.message)) return Response.json({ error: "Run migration 20260927000200_runs_list.sql to archive runs" }, { status: 409 });
    must(res, "archive run");
    return Response.json({ ok: true });
  }
  const { name } = body;
  const clean = name?.trim();
  if (!clean) return Response.json({ error: "A name is required" }, { status: 400 });
  if (clean.length > 120) return Response.json({ error: "Keep the name under 120 characters" }, { status: 400 });
  const res = await db().from("runs").update({ name: clean }).eq("id", id);
  if (res.error && /column|schema cache/i.test(res.error.message)) {
    return Response.json({ error: "Run migration 20260926000500_run_names.sql to rename runs" }, { status: 409 });
  }
  must(res, "rename run");
  return Response.json({ ok: true, name: clean });
});

export const DELETE = handle(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  must(await db().from("runs").delete().eq("id", id), "delete run");
  return Response.json({ ok: true });
});
