import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { candidateExtras } from "@/lib/server/plQuotes";

type Ctx = { params: Promise<{ id: string }> };

/** The candidate's quotes, launch checklist, listing ASIN and its ads figures. */
export const GET = handle(async (_req: NextRequest, ctx: Ctx) => Response.json(await candidateExtras((await ctx.params).id)));
