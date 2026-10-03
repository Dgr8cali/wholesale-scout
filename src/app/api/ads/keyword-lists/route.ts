import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { keywordLists, saveKeywordLists } from "@/lib/server/adsKeywords";

/** The account's whitelist and blacklist, and each product's. */
export const GET = handle(async () => Response.json(await keywordLists()));

/** { scope: "account" | ASIN, whitelist?, blacklist? (one a line), useAccount? }. */
export const PUT = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { scope?: string; whitelist?: string | string[]; blacklist?: string | string[]; useAccount?: boolean };
  try {
    return Response.json(await saveKeywordLists(String(b.scope ?? "account"), b));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
