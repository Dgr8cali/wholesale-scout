import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { listMovements } from "@/lib/server/stock";

const csvCell = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** ?item=&bucket=&kind=&from=&to= (&format=csv for a download). */
export const GET = handle(async (req: NextRequest) => {
  const q = req.nextUrl.searchParams;
  const rows = await listMovements({ itemId: q.get("item"), bucket: q.get("bucket"), kind: q.get("kind"), from: q.get("from"), to: q.get("to") });
  if (q.get("format") !== "csv") return Response.json({ movements: rows });
  const head = ["date", "sku", "name", "bucket", "kind", "quantity", "reason", "unit_cost", "note"];
  const lines = rows.map((r) => { const it = r.item as { sku: string; name: string } | null; return [r.date, it?.sku, it?.name, r.bucket, r.kind, r.quantity, r.reason, r.unit_cost, r.note].map(csvCell).join(","); });
  return new Response([head.join(","), ...lines].join("\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="stock-movements-${new Date().toISOString().slice(0, 10)}.csv"` } });
});
