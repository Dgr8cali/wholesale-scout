import type { NextRequest } from "next/server";
import { extJson, extOptions, isAsin, saveScDg } from "@/lib/server/extension";
import { handle } from "@/lib/server/http";

export const OPTIONS = extOptions;
/** Seller Central's DG classification, confirmed on the page: { asin, status: hazmat | not_hazmat | unknown, detail?, url? }. */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { asin?: string; status?: string; detail?: string; url?: string };
  if (!isAsin(b.asin) || !b.status) return extJson({ error: "asin and status required" }, 400);
  return (await saveScDg(b.asin, { status: b.status, detail: b.detail, url: b.url })) ? extJson({ ok: true }) : extJson({ error: "Check this ASIN first" }, 404);
});
