import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { rescreenRun } from "@/lib/server/process";

export const maxDuration = 60;

/** Re-run gates and score with a profile's current settings, from stored data. */
export const POST = handle(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { profileId?: string };
  return Response.json(await rescreenRun(id, body.profileId));
});
