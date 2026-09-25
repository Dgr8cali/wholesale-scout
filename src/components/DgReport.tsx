"use client";

import { useRef, type ReactNode } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { DG_STATUS_LABEL, type DgLookupStatus } from "@/lib/dg/report";
import type { Cell } from "@/lib/ingest/mapping";
import { api } from "@/lib/ui/client";

interface Imported {
  asins: number; saved: number; notInApp: number; skipped: number;
  byStatus: Partial<Record<DgLookupStatus, number>>;
  columns: { asin: string; status: string; programme: string | null } | null;
  unrecognised: { text: string; rows: number }[];
}

/** The sheet with an ASIN header (the lookup file may carry a notes sheet first). */
function lookupRows(wb: XLSX.WorkBook): Cell[][] {
  const sheets = wb.SheetNames.map((n) => XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[n], { header: 1, raw: false, defval: null, blankrows: false }));
  return sheets.find((rows) => rows.slice(0, 20).some((r) => r.some((c) => /^\s*(child |product )?asin\s*$/i.test(String(c ?? ""))))) ?? sheets[0] ?? [];
}

/**
 * "Import DG report…": pick the file Seller Central's Dangerous Goods lookup returned (xlsx,
 * csv or txt); each ASIN's status is saved on its products. `after` runs once it's saved
 * (e.g. re-screen the run so the Compliance gate reads it).
 */
export function useDgImport(after?: () => Promise<void> | void): { pick: () => void; input: ReactNode } {
  const ref = useRef<HTMLInputElement>(null);
  async function read(file: File) {
    const t = toast.loading(`Reading ${file.name}…`);
    try {
      const buf = await file.arrayBuffer();
      const isText = /\.(csv|txt|tsv)$/i.test(file.name);
      const rows = lookupRows(XLSX.read(buf, { type: "array", raw: isText, dense: true }));
      const r = await api<Imported>("/api/dg-report", { method: "POST", json: { file: file.name, rows } });
      const counts = (Object.entries(r.byStatus) as [DgLookupStatus, number][]).map(([s, n]) => `${n} ${DG_STATUS_LABEL[s]}`).join(", ");
      const odd = r.unrecognised.length ? ` Wording not recognised (saved as shown, no effect on the gate): ${r.unrecognised.slice(0, 3).map((u) => `“${u.text}” (${u.rows})`).join(", ")}.` : "";
      toast.success(`DG lookup saved for ${r.saved.toLocaleString("en-GB")} of ${r.asins.toLocaleString("en-GB")} ASINs`, {
        id: t,
        duration: 12_000,
        description: `${counts || "nothing new"}.${r.notInApp ? ` ${r.notInApp} ASINs aren't products in the app.` : ""}${odd} Read “${r.columns?.status}”${r.columns?.programme ? ` and “${r.columns.programme}”` : ""}.`,
      });
      await after?.();
    } catch (e) {
      toast.error((e as Error).message, { id: t, duration: 12_000 });
    }
  }
  const input = (
    <input ref={ref} type="file" accept=".xlsx,.xls,.csv,.txt,.tsv" className="hidden" aria-hidden="true"
      onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void read(f); }} />
  );
  return { pick: () => ref.current?.click(), input };
}

/** "Export ASINs for DG lookup": the run's ASINs as a one-column CSV to paste or upload in Seller Central. */
export async function exportDgAsins(runId: string, name: string) {
  const t = toast.loading("Listing the run's ASINs…");
  try {
    const res = await fetch(`/api/runs/${runId}/asins`);
    if (!res.ok) throw new Error(`The app answered ${res.status}`);
    const n = Number(res.headers.get("x-asin-count") ?? 0);
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.replace(/[^\w.-]+/g, "_").slice(0, 60)}-asins-for-dg-lookup.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${n.toLocaleString("en-GB")} ASINs exported`, { id: t, description: "Look them up in Seller Central's Dangerous Goods lookup, then Import DG report with the file it returns." });
  } catch (e) {
    toast.error((e as Error).message, { id: t });
  }
}
