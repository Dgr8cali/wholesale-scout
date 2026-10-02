import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { setRankKeyword } from "@/lib/server/adsOps";

/** { asin, keyword, on }: track (or stop tracking) a keyword besides the exact ones. */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { asin?: string; keyword?: string; on?: boolean };
  try {
    await setRankKeyword(String(b.asin ?? "").toUpperCase(), String(b.keyword ?? ""), b.on !== false);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
