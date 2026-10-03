import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { stockLevels } from "@/lib/server/stock";

/** Every item: levels per bucket (FBA from SP-API), value, demand, days of cover, status, reorder. ?archived=1: the archived ones. */
export const GET = handle(async (req: NextRequest) => Response.json(await stockLevels({ archived: req.nextUrl.searchParams.get("archived") === "1" })));
