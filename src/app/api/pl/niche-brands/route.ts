import type { NextRequest } from "next/server";
import { DEFAULT_BRAND_TERMS } from "@/lib/pl/brandTerms";
import { handle } from "@/lib/server/http";
import { brandTerms, reflagNiches, saveBrandTerms } from "@/lib/server/plNiches";

/** The BIG_BRAND list in use, and the defaults. */
export const GET = handle(async () => Response.json({ terms: await brandTerms(), defaults: DEFAULT_BRAND_TERMS }));

/** { terms } (one a line or comma), or { terms: null } for the defaults; every niche is re-flagged. */
export const PUT = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { terms?: string | string[] | null };
  return Response.json(await saveBrandTerms(b.terms ?? null));
});

/** Work every niche's flags out again with the current rules and brand list (nothing else changes). */
export const POST = handle(async () => Response.json({ reflagged: await reflagNiches() }));
