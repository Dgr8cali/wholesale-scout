import { getKeepa } from "@/lib/keepa/client";
import type { KeepaTokens } from "@/lib/keepa/types";

// Keepa's /token endpoint is free, but every open tab polls this; share one answer briefly.
let cached: { at: number; tokens: KeepaTokens | null } | null = null;
const TTL_MS = 15_000;

/** The live Keepa token balance, or null when Keepa isn't configured or didn't answer. */
export async function GET() {
  const keepa = getKeepa();
  if (!keepa.available) return Response.json({ available: false, tokens: null });
  if (!cached || Date.now() - cached.at > TTL_MS) cached = { at: Date.now(), tokens: await keepa.tokenStatus() };
  return Response.json({ available: true, tokens: cached.tokens, at: new Date(cached.at).toISOString() });
}
