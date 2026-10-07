import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { recalcStatus, startRecalc } from "@/lib/server/recalc";

export const maxDuration = 120;

/** "Recalculate all": every finished run re-screened from stored data on the current VAT basis (no Keepa). */
export const POST = handle(async (req: NextRequest) => Response.json(await startRecalc(req.nextUrl.origin)));

/** ?job=<id> (else the latest): runs still re-screening, then the 20 biggest profit changes. */
export const GET = handle(async (req: NextRequest) => Response.json(await recalcStatus(req.nextUrl.searchParams.get("job"))));
