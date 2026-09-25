import { after, type NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { kickRun } from "@/lib/server/kick";
import { runQogitaPull, type QogitaFilters } from "@/lib/server/qogitaPull";

export const maxDuration = 60;

/** Pull from Qogita with these filters, save them as a preset, and start screening. */
export const POST = handle(async (req: NextRequest) => {
  const body = (await req.json()) as { name?: string; filters?: QogitaFilters; profileId?: string | null };
  try {
    const r = await runQogitaPull({ name: body.name ?? "", filters: body.filters!, profileId: body.profileId });
    if (r.runId) after(() => kickRun(req.nextUrl.origin, r.runId!));
    return Response.json(r);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
