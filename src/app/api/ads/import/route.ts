import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { importBulkFile, importReports } from "@/lib/server/ads";

export const maxDuration = 60;

/**
 * { bulk: { name, data (base64 .xlsx), dateFrom, dateTo } }: an Amazon Ads bulk export, the primary
 * import. { files: [{ name, text }] }: CSV reports, format detected per file. Re-importing is idempotent.
 */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { files?: { name?: string; text?: string }[]; bulk?: { name?: string; data?: string; dateFrom?: string; dateTo?: string } };
  if (b.bulk) {
    if (typeof b.bulk.data !== "string" || !b.bulk.data) return Response.json({ error: "No file" }, { status: 400 });
    if (b.bulk.data.length > 8_000_000) return Response.json({ error: "The bulk file is over 6 MB: export fewer campaigns or a shorter range" }, { status: 400 });
    const iso = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
    return Response.json(await importBulkFile(new Uint8Array(Buffer.from(b.bulk.data, "base64")), String(b.bulk.name ?? "bulk.xlsx"), iso(b.bulk.dateFrom), iso(b.bulk.dateTo)));
  }
  const files = (b.files ?? []).filter((f) => typeof f.text === "string" && f.text.length).map((f) => ({ name: String(f.name ?? "report.csv"), text: f.text! }));
  if (!files.length) return Response.json({ error: "No files" }, { status: 400 });
  if (files.some((f) => f.text.length > 4_000_000)) return Response.json({ error: "A file is over 4 MB: export a shorter date range" }, { status: 400 });
  return Response.json(await importReports(files));
});
