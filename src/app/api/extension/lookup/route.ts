import type { NextRequest } from "next/server";
import { extJson, extOptions, isAsin, lookupAsins } from "@/lib/server/extension";
import { handle } from "@/lib/server/http";

export const OPTIONS = extOptions;
/** Search-page badges: ?asins=A,B,… (up to 20). What the app already knows; nothing is screened. */
export const GET = handle(async (req: NextRequest) => {
  const asins = [...new Set((req.nextUrl.searchParams.get("asins") ?? "").split(",").map((a) => a.trim().toUpperCase()).filter(isAsin))].slice(0, 20);
  if (!asins.length) return extJson({ error: "asins required" }, 400);
  return extJson({ badges: await lookupAsins(asins) });
});
