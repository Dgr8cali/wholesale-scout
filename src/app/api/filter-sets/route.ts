import type { NextRequest } from "next/server";
import { normalizeFilters, type FilterSet } from "@/lib/filters";
import { db, must } from "@/lib/server/db";
import { handle } from "@/lib/server/http";

const missing = (m: string) => /does not exist|schema cache/i.test(m);
const NEEDS = "Run migration 20260926000600_filter_sets.sql to save filter sets";

export const GET = handle(async () => {
  const res = await db().from("filter_sets").select("id, name, filters").order("name");
  if (res.error && missing(res.error.message)) return Response.json({ sets: [], unavailable: NEEDS });
  return Response.json({ sets: must(res, "filter sets") });
});

/** Save a filter set under a name; the same name overwrites. */
export const POST = handle(async (req: NextRequest) => {
  const body = (await req.json()) as { name?: string; filters?: FilterSet };
  const name = body.name?.trim();
  if (!name) return Response.json({ error: "Name the filter set" }, { status: 400 });
  if (name.length > 80) return Response.json({ error: "Keep the name under 80 characters" }, { status: 400 });
  const res = await db().from("filter_sets")
    .upsert({ name, filters: normalizeFilters(body.filters), updated_at: new Date().toISOString() }, { onConflict: "name" })
    .select("id, name, filters").single();
  if (res.error && missing(res.error.message)) return Response.json({ error: NEEDS }, { status: 409 });
  return Response.json({ set: must(res, "save filter set") });
});

export const DELETE = handle(async (req: NextRequest) => {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  must(await db().from("filter_sets").delete().eq("id", id), "delete filter set");
  return Response.json({ ok: true });
});
