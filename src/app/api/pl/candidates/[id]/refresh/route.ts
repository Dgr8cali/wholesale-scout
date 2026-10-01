import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { refreshCandidate } from "@/lib/server/pl";

export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

/** Refresh from Keepa: reuses snapshots under 7 days old, never touches fields you typed. */
export const POST = handle(async (_req: NextRequest, ctx: Ctx) => Response.json(await refreshCandidate((await ctx.params).id)));
