import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { rfqFor } from "@/lib/server/plSuppliers";

type Ctx = { params: Promise<{ id: string }> };

/** The candidate's RFQ from the template, and what it's missing. */
export const GET = handle(async (_req: NextRequest, ctx: Ctx) => Response.json(await rfqFor((await ctx.params).id)));
