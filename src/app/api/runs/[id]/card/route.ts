import type { NextRequest } from "next/server";
import { verdictCard } from "@/lib/server/check";
import { handle } from "@/lib/server/http";

/** A check's verdict card (its best row). */
export const GET = handle(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const card = await verdictCard((await ctx.params).id);
  return card ? Response.json({ card }) : Response.json({ error: "Run not found" }, { status: 404 });
});
