import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { leadCandidates, leadSummary, listLeads, targetsFor } from "@/lib/server/plSuppliers";

/** ?candidate=<id> (optional): the supplier leads, best first, with the strip's counts and the candidates to filter by. */
export const GET = handle(async (req: NextRequest) => {
  const candidate = req.nextUrl.searchParams.get("candidate");
  const leads = await listLeads(candidate);
  return Response.json({ leads, summary: leadSummary(leads), candidates: await leadCandidates(), targets: candidate ? await targetsFor(candidate) : null });
});
