import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { processRun } from "@/lib/server/process";

export const maxDuration = 60;

/** Screens the next chunk of pending rows. The results page calls this until done. */
export const POST = handle(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  return Response.json(await processRun(id));
});
