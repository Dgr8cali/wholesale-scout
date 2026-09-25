import type { NextRequest } from "next/server";
import { db } from "@/lib/server/db";
import { handle } from "@/lib/server/http";
import { runProgress } from "@/lib/server/process";

/** Light status for the run page: counts, what rows are waiting on, and whether a worker has it. */
export const GET = handle(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const [progress, run] = await Promise.all([runProgress(id), db().from("runs").select("*").eq("id", id).single()]);
  const r = run.data as { status: string; token_cost: number; lease_until?: string | null } | null;
  return Response.json({
    ...progress,
    status: r?.status ?? null,
    tokenCost: r?.token_cost ?? 0,
    working: !!r?.lease_until && Date.parse(r.lease_until) > Date.now(),
  });
});
