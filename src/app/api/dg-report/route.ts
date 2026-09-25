import type { NextRequest } from "next/server";
import type { Cell } from "@/lib/ingest/mapping";
import { importDgReport } from "@/lib/server/dgReport";
import { handle } from "@/lib/server/http";

/** Import Seller Central's Dangerous Goods lookup file: { file, rows } (the sheet's rows, read in the browser). */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { file?: string; rows?: Cell[][] };
  if (!Array.isArray(b.rows)) return Response.json({ error: "rows required" }, { status: 400 });
  if (b.rows.length > 50_000) return Response.json({ error: "Over 50,000 rows: split the file" }, { status: 400 });
  const res = await importDgReport(b.rows, b.file ? String(b.file).slice(0, 200) : null);
  return Response.json(res, { status: res.error ? 422 : 200 });
});
