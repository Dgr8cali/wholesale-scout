import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { createCandidate, listCandidates, parseAsins, refreshCandidate } from "@/lib/server/pl";

export const maxDuration = 60;

/** Every private-label candidate with its fields, the thresholds and the rate card (the page scores them). */
export const GET = handle(async () => Response.json(await listCandidates()));

/** New candidate: { name, niche_keyword?, category?, asins: "one per line or comma-separated" }. Fetches Keepa straight away. */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { name?: string; niche_keyword?: string; category?: string; asins?: string | string[] };
  const asins = parseAsins(Array.isArray(b.asins) ? b.asins.join("\n") : b.asins ?? "");
  const candidate = await createCandidate({ name: b.name ?? "", niche_keyword: b.niche_keyword, category: b.category, asins });
  const refresh = asins.length ? await refreshCandidate(candidate.id) : null;
  return Response.json({ candidate, refresh });
});
