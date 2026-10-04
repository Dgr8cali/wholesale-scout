import type { NextRequest } from "next/server";
import { DEFAULT_OFF_NICHE } from "@/lib/pl/offNiche";
import { handle } from "@/lib/server/http";
import { offNicheWords, saveOffNicheWords } from "@/lib/server/plNiches";

/** The off-niche words the incumbent check uses, and the defaults. */
export const GET = handle(async () => Response.json({ words: await offNicheWords(), defaults: DEFAULT_OFF_NICHE }));

/** { words } (one a line or comma), or { words: null } for the defaults. */
export const PUT = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { words?: string | string[] | null };
  return Response.json(await saveOffNicheWords(b.words ?? null));
});
