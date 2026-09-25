import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { importIpCsv } from "@/lib/server/ipRisk";

/** Import a pasted CSV: { csv, source? } → { added, updated, errors }. */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { csv?: string; source?: string };
  if (!b.csv?.trim()) return Response.json({ error: "Paste a list to import" }, { status: 400 });
  return Response.json(await importIpCsv(b.csv, b.source?.trim() || undefined));
});
