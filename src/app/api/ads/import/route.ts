import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { importReports } from "@/lib/server/ads";

export const maxDuration = 60;

/** { files: [{ name, text }] }: Amazon Ads CSV exports, format detected per file. Re-importing is idempotent. */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { files?: { name?: string; text?: string }[] };
  const files = (b.files ?? []).filter((f) => typeof f.text === "string" && f.text.length).map((f) => ({ name: String(f.name ?? "report.csv"), text: f.text! }));
  if (!files.length) return Response.json({ error: "No files" }, { status: 400 });
  if (files.some((f) => f.text.length > 4_000_000)) return Response.json({ error: "A file is over 4 MB: export a shorter date range" }, { status: 400 });
  return Response.json(await importReports(files));
});
