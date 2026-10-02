"use client";

import { FileUpIcon, LoaderIcon, UploadIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { usePageCrumbs } from "@/components/Crumbs";
import { useDialogs } from "@/components/Dialogs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { parseReport, REPORT_LABEL, type ParsedReport, type ReportType } from "@/lib/ads/parse";
import { api } from "@/lib/ui/client";
import { cn } from "@/lib/utils";

interface Picked { name: string; text: string; parsed: ParsedReport | null; error: string | null }
interface ImportRow { id: string; report_type: ReportType; file_name: string; rows: number; date_from: string | null; date_to: string | null; imported_at: string }

const day = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
const gbp = (v: number) => `£${v.toFixed(2)}`;

/** Ads → Imports: drop Amazon Ads CSV exports, see what was read, import. */
export default function AdsImportsPage() {
  usePageCrumbs([{ label: "Ads", href: "/ads/dashboard" }, { label: "Imports" }]);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [past, setPast] = useState<ImportRow[] | null>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const { confirm } = useDialogs();

  const loadPast = useCallback(() => api<{ imports: ImportRow[] }>("/api/ads/imports").then((r) => setPast(r.imports)).catch(() => setPast([])), []);
  useEffect(() => { loadPast(); }, [loadPast]);

  const add = async (files: FileList | File[]) => {
    const read = await Promise.all([...files].filter((f) => /\.(csv|txt)$/i.test(f.name) || f.type.includes("csv")).map(async (f) => {
      const text = await f.text();
      try {
        return { name: f.name, text, parsed: parseReport(text, f.name), error: null };
      } catch (e) {
        return { name: f.name, text, parsed: null, error: (e as Error).message };
      }
    }));
    if (!read.length) { toast.error("Drop CSV files exported from Amazon Ads"); return; }
    setPicked((cur) => [...cur.filter((c) => !read.some((r) => r.name === c.name)), ...read]);
  };

  const ok = picked.filter((p) => p.parsed);
  const run = async () => {
    setBusy(true);
    try {
      const r = await api<{ imported: { file: string; label: string; rows: number }[]; errors: { file: string; error: string }[]; cpc: number | null }>("/api/ads/import", { method: "POST", json: { files: ok.map((p) => ({ name: p.name, text: p.text })) } });
      if (r.imported.length) toast.success(`Imported ${r.imported.map((i) => `${i.file} (${i.rows} rows)`).join(", ")}.${r.cpc != null ? ` CPC for private label's estimate now £${r.cpc.toFixed(2)}.` : ""}`);
      for (const e of r.errors) toast.error(`${e.file}: ${e.error}`);
      setPicked([]);
      loadPast();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const undo = async (i: ImportRow) => {
    if (!(await confirm({ title: `Undo the import of ${i.file_name}?`, description: "The rows it last wrote are removed. Rows a later import of the same data wrote stay.", confirmLabel: "Undo", destructive: true }))) return;
    await api(`/api/ads/imports?id=${i.id}`, { method: "DELETE" });
    loadPast();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Imports</h1>
          <p className="text-sm text-muted-foreground">Sponsored Products reports from Amazon Ads: the Search term report, the Campaign report, and the Campaign Manager grid export. Each file&apos;s format is worked out from its columns. Importing the same data again doesn&apos;t double it. Connect Amazon Ads once API access is approved.</p>
        </div>
        <Button asChild variant="outline"><Link href="/ads/dashboard">Dashboard</Link></Button>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
        onClick={() => input.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") input.current?.click(); }}
        className={cn("panel flex cursor-pointer flex-col items-center gap-2 border-2 border-dashed px-6 py-10 text-center", over && "border-brand bg-brand-soft")}>
        <FileUpIcon className="size-6 text-muted-foreground" />
        <p className="text-sm font-medium">Drop CSV reports here, or click to choose (several at once)</p>
        <p className="text-xs text-muted-foreground">Nothing is imported until you confirm.</p>
        <input ref={input} type="file" accept=".csv,text/csv" multiple hidden onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ""; }} />
      </div>

      {picked.length > 0 && (
        <section className="space-y-3">
          {picked.map((p) => <Preview key={p.name} p={p} onRemove={() => setPicked((c) => c.filter((x) => x.name !== p.name))} />)}
          <div className="flex items-center gap-3">
            <Button onClick={run} disabled={busy || !ok.length}>{busy ? <LoaderIcon className="animate-spin" /> : <UploadIcon />} Import {ok.length} file{ok.length === 1 ? "" : "s"}</Button>
            <Button variant="ghost" onClick={() => setPicked([])}>Clear</Button>
            {picked.length > ok.length && <span className="text-sm text-fail">{picked.length - ok.length} file{picked.length - ok.length === 1 ? "" : "s"} can&apos;t be read and won&apos;t be imported.</span>}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="section-label">Past imports</h2>
        {!past ? <Skeleton className="h-24 rounded-lg" /> : !past.length ? <p className="text-sm text-muted-foreground">None yet.</p> : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-[11px] tracking-wide text-muted-foreground uppercase"><th className="px-2 py-1.5">Imported</th><th className="px-2 py-1.5">File</th><th className="px-2 py-1.5">Report</th><th className="px-2 py-1.5 text-right">Rows</th><th className="px-2 py-1.5">Covers</th><th /></tr></thead>
              <tbody>{past.map((i) => (
                <tr key={i.id} className="border-b last:border-b-0">
                  <td className="px-2 py-1.5 whitespace-nowrap">{new Date(i.imported_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="px-2 py-1.5">{i.file_name}</td>
                  <td className="px-2 py-1.5">{REPORT_LABEL[i.report_type] ?? i.report_type}</td>
                  <td className="num px-2 py-1.5 text-right">{i.rows}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{i.date_from ? `${day(i.date_from)} – ${day(i.date_to)}` : "range not given"}</td>
                  <td className="px-2 py-1.5 text-right"><Button variant="ghost" size="xs" className="text-fail hover:text-fail" onClick={() => undo(i)}>Undo</Button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Preview({ p, onRemove }: { p: Picked; onRemove: () => void }) {
  if (!p.parsed) {
    return (
      <div className="panel flex items-start gap-3 border-fail/40 p-3">
        <div className="flex-1"><p className="font-medium">{p.name}</p><p className="text-sm text-fail">{p.error}</p></div>
        <button type="button" onClick={onRemove} aria-label="Remove"><XIcon className="size-4 text-muted-foreground" /></button>
      </div>
    );
  }
  const r = p.parsed;
  const isTerms = r.type === "search_term";
  const totals = r.rows.reduce((a, x) => ({ clicks: a.clicks + x.clicks, cost: a.cost + x.cost, orders: a.orders + x.orders, sales: a.sales + x.sales }), { clicks: 0, cost: 0, orders: 0, sales: 0 });
  return (
    <div className="panel space-y-2 p-3">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="font-medium">{p.name} <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand">{r.label}</span></p>
          <p className="text-xs text-muted-foreground">
            {r.rows.length} rows · {new Set(r.rows.map((x) => x.campaignName)).size} campaigns · {r.dateFrom ? `${day(r.dateFrom)} – ${day(r.dateTo)}` : "no date range"} ·
            {` ${totals.clicks.toLocaleString("en-GB")} clicks, ${gbp(totals.cost)} spend, ${totals.orders} orders, ${gbp(totals.sales)} sales`}
          </p>
          {r.warnings.map((w) => <p key={w} className="text-xs text-warn">{w}</p>)}
        </div>
        <button type="button" onClick={onRemove} aria-label="Remove"><XIcon className="size-4 text-muted-foreground" /></button>
      </div>
      <div className="overflow-x-auto rounded border">
        <table className="w-full text-xs">
          <thead><tr className="border-b text-left text-[10.5px] tracking-wide text-muted-foreground uppercase">
            <th className="px-2 py-1">Campaign</th>{isTerms && <th className="px-2 py-1">Search term</th>}<th className="px-2 py-1">Dates</th>
            <th className="px-2 py-1 text-right">Clicks</th><th className="px-2 py-1 text-right">Spend</th><th className="px-2 py-1 text-right">Orders</th><th className="px-2 py-1 text-right">Sales</th>
          </tr></thead>
          <tbody>{r.rows.slice(0, 8).map((x, i) => (
            <tr key={i} className="border-b last:border-b-0">
              <td className="px-2 py-1">{x.campaignName}</td>{isTerms && <td className="px-2 py-1">{x.searchTerm}</td>}
              <td className="px-2 py-1 whitespace-nowrap">{x.dateFrom ? (x.dateFrom === x.dateTo ? day(x.dateFrom) : `${day(x.dateFrom)} – ${day(x.dateTo)}`) : x.campaignStart ? `from ${day(x.campaignStart)} (as exported)` : "as exported"}</td>
              <td className="num px-2 py-1 text-right">{x.clicks}</td><td className="num px-2 py-1 text-right">{gbp(x.cost)}</td>
              <td className="num px-2 py-1 text-right">{x.orders}</td><td className="num px-2 py-1 text-right">{gbp(x.sales)}</td>
            </tr>
          ))}</tbody>
        </table>
        {r.rows.length > 8 && <p className="border-t px-2 py-1 text-xs text-muted-foreground">… and {r.rows.length - 8} more</p>}
      </div>
    </div>
  );
}
