import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { planCandidates } from "@/lib/server/plan";

/** The order planner's candidates and limits (the plan itself is worked out on the page). ?warns=1 includes warns. */
export const GET = handle(async (req: NextRequest) => Response.json(await planCandidates({ warns: req.nextUrl.searchParams.get("warns") === "1" })));
