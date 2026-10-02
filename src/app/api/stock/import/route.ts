import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { applyImport, previewImport } from "@/lib/server/stock";

export const maxDuration = 60;

/**
 * { kind: "stockpilot", raw } (the stockpilot_workspaces export) or { kind: "csv", text }, with
 * { asins: { SKU: ASIN } } to link items to Amazon listings, and { apply: true } to write it.
 */
export const POST = handle(async (req: NextRequest) => {
  const b = (await req.json().catch(() => ({}))) as { kind?: string; raw?: unknown; text?: string; asins?: Record<string, string>; apply?: boolean };
  const src = b.kind === "csv" ? { kind: "csv" as const, text: String(b.text ?? "") } : { kind: "stockpilot" as const, raw: b.raw };
  if (src.kind === "stockpilot" && !src.raw) return Response.json({ error: "No StockPilot export" }, { status: 400 });
  const asins = Object.fromEntries(Object.entries(b.asins ?? {}).filter(([, v]) => /^[A-Z0-9]{10}$/.test(String(v).toUpperCase())).map(([k, v]) => [k.toUpperCase(), String(v).toUpperCase()]));
  try {
    return Response.json(b.apply ? { applied: await applyImport(src, asins) } : { preview: await previewImport(src, asins) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
});
