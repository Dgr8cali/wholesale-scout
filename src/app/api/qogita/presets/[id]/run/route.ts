import { after, type NextRequest } from "next/server";
import { db, must } from "@/lib/server/db";
import { handle } from "@/lib/server/http";
import { kickRun } from "@/lib/server/kick";
import { runQogitaPull, type QogitaFilters } from "@/lib/server/qogitaPull";

export const maxDuration = 60;

/** "Run again": pull a saved preset with its filters and profile. */
export const POST = handle(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const p = must(await db().from("qogita_presets").select("name, filters, profile_id").eq("id", id).single(), "preset") as { name: string; filters: QogitaFilters; profile_id: string | null };
  try {
    const r = await runQogitaPull({ name: p.name, filters: p.filters, profileId: p.profile_id });
    if (r.runId) after(() => kickRun(req.nextUrl.origin, r.runId!));
    return Response.json(r);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
