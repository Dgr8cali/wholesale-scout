import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { saveStockSettings, stockSettings } from "@/lib/server/stock";

export const GET = handle(async () => Response.json({ settings: await stockSettings() }));

/** { lowStockDefault?, coverTargetDays?, leadBufferDays? }. */
export const PUT = handle(async (req: NextRequest) => {
  try {
    return Response.json({ settings: await saveStockSettings((await req.json().catch(() => ({}))) as never) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
