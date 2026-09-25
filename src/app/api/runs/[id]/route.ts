import type { NextRequest } from "next/server";
import { db, must } from "@/lib/server/db";
import { handle } from "@/lib/server/http";

/** What the run page reads of a product (not the catalog and Keepa fields it doesn't show). */
const PRODUCT = "id, ean, asin, title, brand, category, image_url, competitor_stock, sc_dg, dg_lookup";
const RESULT = `*, product:products(${PRODUCT}), offer:offers(id, unit_cost, currency, unit_cost_gbp, cost_known, moq, pack_units, stock, title, source_ref, supplier:suppliers(id, name))`;

/**
 * A run and its results, best score first.
 *   ?limit=100            the first screen only (the page then loads the rest with &offset=)
 *   ?offset=100&limit=1000
 *   ?since=<ISO>          only rows changed since then (updated_at is kept by the database)
 * No parameters: every row. `total` is the run's row count; `at` is when this answer was read,
 * to pass back as `since`.
 */
export const GET = handle(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const q = req.nextUrl.searchParams;
  const at = new Date(Date.now() - 2_000).toISOString(); // a little early: a write in flight isn't missed
  const d = db();
  const [runRes, countRes] = await Promise.all([
    d.from("runs").select("*, profile:profiles(name)").eq("id", id).maybeSingle(),
    d.from("results").select("id", { count: "exact", head: true }).eq("run_id", id),
  ]);
  const run = must(runRes, "run");
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });
  const since = q.get("since");
  const offset = Math.max(0, Number(q.get("offset")) || 0);
  const limit = q.has("limit") ? Math.min(1000, Math.max(1, Number(q.get("limit")) || 100)) : null;
  const page = (from: number, to: number) => {
    let x = d.from("results").select(RESULT).eq("run_id", id);
    if (since) x = x.gt("updated_at", since);
    return x.order("score", { ascending: false, nullsFirst: false }).order("id").range(from, to);
  };
  const results: unknown[] = [];
  if (limit != null && !since) {
    results.push(...(must(await page(offset, offset + limit - 1), "results") as unknown[]));
  } else {
    // PostgREST caps a page at 1,000 rows.
    for (let from = 0; ; from += 1000) {
      const rows = must(await page(from, from + 999), "results") as unknown[];
      results.push(...rows);
      if (rows.length < 1000) break;
    }
  }
  return Response.json({ run, results, total: countRes.count ?? null, at });
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
