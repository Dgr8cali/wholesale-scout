"use client";

import { FileUpIcon, LoaderIcon, Undo2Icon, UploadIcon, XIcon } from "lucide-react";
import { FileDrop } from "@/components/ui/file-drop";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useDialogs } from "@/components/Dialogs";
import { Button } from "@/components/ui/button";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { SortTh, useSortable } from "@/components/SortableTable";
import { Skeleton } from "@/components/ui/skeleton";
import { parseBulk, type ParsedBulk } from "@/lib/ads/bulk";
import { parseReport, REPORT_LABEL, type ParsedReport, type ReportType } from "@/lib/ads/parse";
import { api } from "@/lib/ui/client";

interface Picked { name: string; text: string; parsed: ParsedReport | null; error: string | null }
/** A bulk export (.xlsx): read here for the preview, sent as is; its date range is given here. */
interface PickedBulk { name: string; data: Uint8Array; parsed: ParsedBulk | null; error: string | null; from: string; to: string }
interface ImportRow { id: string; report_type: ReportType | "bulk"; file_name: string; rows: number; date_from: string | null; date_to: string | null; imported_at: string }

const day = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
const gbp = (v: number) => `£${v.toFixed(2)}`;
const base64 = (u: Uint8Array) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const LABEL: Record<string, string> = { ...REPORT_LABEL, bulk: "Bulk export" };

/**
 * Ads → Dashboard → Import (a sheet): drop an Amazon Ads bulk export (or CSV reports), see what was
 * read, import. The reading and the import calls are exactly the old Imports page's.
 */
export function ImportFlow({ onImported }: { onImported: () => void }) {
  const [picked, setPicked] = useState<Picked[]>([]);
  const [bulks, setBulks] = useState<PickedBulk[]>([]);
  const [busy, setBusy] = useState(false);

  const add = async (files: FileList | File[]) => {
    const list = [...files];
    const xlsx = list.filter((f) => /\.xlsx$/i.test(f.name));
    const csv = list.filter((f) => /\.(csv|txt)$/i.test(f.name) || f.type.includes("csv"));
    const readBulk = await Promise.all(xlsx.map(async (f): Promise<PickedBulk> => {
      const data = new Uint8Array(await f.arrayBuffer());
      try {
        const parsed = parseBulk(data, { fileName: f.name });
        return { name: f.name, data, parsed, error: null, from: parsed.dateFrom ?? "", to: parsed.dateTo ?? "" };
      } catch (e) {
        return { name: f.name, data, parsed: null, error: (e as Error).message, from: "", to: "" };
      }
    }));
    const read = await Promise.all(csv.map(async (f) => {
      const text = await f.text();
      try {
        return { name: f.name, text, parsed: parseReport(text, f.name), error: null };
      } catch (e) {
        return { name: f.name, text, parsed: null, error: (e as Error).message };
      }
    }));
    if (!read.length && !readBulk.length) { toast.error("Drop a bulk export (.xlsx) or CSV reports from Amazon Ads"); return; }
    setBulks((cur) => [...cur.filter((c) => !readBulk.some((r) => r.name === c.name)), ...readBulk]);
    setPicked((cur) => [...cur.filter((c) => !read.some((r) => r.name === c.name)), ...read]);
  };

  const ok = picked.filter((p) => p.parsed);
  const okBulk = bulks.filter((b) => b.parsed);
  const bulkReady = okBulk.every((b) => b.from && b.to && b.from <= b.to);
  const count = ok.length + okBulk.length;
  const run = async () => {
    setBusy(true);
    try {
      let cpc: number | null = null;
      for (const b of okBulk) {
        try {
          const r = await api<{ imported: { file: string; rows: number; mapped: number; warnings: string[] }; cpc: number | null }>("/api/ads/import", { method: "POST", json: { bulk: { name: b.name, data: base64(b.data), dateFrom: b.from, dateTo: b.to } } });
          toast.success(`Imported ${r.imported.file} (${r.imported.rows} rows; ${r.imported.mapped} campaign${r.imported.mapped === 1 ? "" : "s"} mapped to an ASIN from their product ads).`);
          cpc = r.cpc ?? cpc;
        } catch (e) {
          toast.error(`${b.name}: ${(e as Error).message}`);
        }
      }
      if (ok.length) {
        const r = await api<{ imported: { file: string; label: string; rows: number }[]; errors: { file: string; error: string }[]; cpc: number | null }>("/api/ads/import", { method: "POST", json: { files: ok.map((p) => ({ name: p.name, text: p.text })) } });
        if (r.imported.length) toast.success(`Imported ${r.imported.map((i) => `${i.file} (${i.rows} rows)`).join(", ")}.`);
        for (const e of r.errors) toast.error(`${e.file}: ${e.error}`);
        cpc = r.cpc ?? cpc;
      }
      if (cpc != null) toast.success(`CPC for private label's estimate now £${cpc.toFixed(2)}.`);
      setPicked([]);
      setBulks([]);
      onImported();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-5">
      <FileDrop onFiles={(f) => add(f)} multiple accept=".xlsx,.csv,text/csv" icon={<FileUpIcon />}
        title="Drop the bulk export (.xlsx) or CSV reports here, or click to choose" hint="Nothing is imported until you confirm." />

      {(picked.length > 0 || bulks.length > 0) && (
        <section className="space-y-3">
          {bulks.map((b) => <BulkPreview key={b.name} b={b} onChange={(patch) => setBulks((c) => c.map((x) => (x.name === b.name ? { ...x, ...patch } : x)))} onRemove={() => setBulks((c) => c.filter((x) => x.name !== b.name))} />)}
          {picked.map((p) => <Preview key={p.name} p={p} onRemove={() => setPicked((c) => c.filter((x) => x.name !== p.name))} />)}
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={run} disabled={busy || !count || !bulkReady}>{busy ? <LoaderIcon className="animate-spin" /> : <UploadIcon />} Import {count} file{count === 1 ? "" : "s"}</Button>
            <Button variant="ghost" onClick={() => { setPicked([]); setBulks([]); }}>Clear</Button>
            {!bulkReady && <span className="text-sm text-warn">Give the date range each bulk export covers.</span>}
            {picked.length + bulks.length > count && <span className="text-sm text-fail">{picked.length + bulks.length - count} file{picked.length + bulks.length - count === 1 ? "" : "s"} can&apos;t be read and won&apos;t be imported.</span>}
          </div>
        </section>
      )}

    </div>
  );
}

/** Ads → Dashboard → Imports history: every import, newest first, each one undoable. */
export function ImportsHistory({ refresh = 0 }: { refresh?: number }) {
  const [past, setPast] = useState<ImportRow[] | null>(null);
  const { confirm } = useDialogs();
  const loadPast = useCallback(() => api<{ imports: ImportRow[] }>("/api/ads/imports").then((r) => setPast(r.imports)).catch(() => setPast([])), []);
  useEffect(() => { loadPast(); }, [loadPast, refresh]);
  const undo = async (i: ImportRow) => {
    if (!(await confirm({ title: `Undo the import of ${i.file_name}?`, description: "The rows it last wrote are removed. Rows a later import of the same data wrote stay.", confirmLabel: "Undo import", destructive: true }))) return;
    await api(`/api/ads/imports?id=${i.id}`, { method: "DELETE" });
    loadPast();
  };
  if (!past) return <Skeleton className="h-24 rounded-xl" />;
  const columns: DataColumn<ImportRow>[] = [
    { id: "file", header: "File", mobile: "title", sortValue: (i) => i.file_name, cell: (i) => <span className="font-medium break-all">{i.file_name}</span> },
    { id: "imported", header: "Imported", mobile: 1, sortValue: (i) => i.imported_at, cell: (i) => <span className="whitespace-nowrap">{new Date(i.imported_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span> },
    { id: "report", header: "Report", mobile: 2, sortValue: (i) => LABEL[i.report_type] ?? i.report_type, cell: (i) => LABEL[i.report_type] ?? i.report_type },
    { id: "rows", header: "Rows", numeric: true, sortValue: (i) => i.rows, cell: (i) => i.rows.toLocaleString("en-GB") },
    { id: "covers", header: "Covers", sortValue: (i) => i.date_from, cell: (i) => <span className="text-muted-foreground">{i.date_from ? `${day(i.date_from)} – ${day(i.date_to)}` : "range not given"}</span> },
    { id: "undo", header: <span className="sr-only">Undo</span>, mobile: 3, className: "text-right", cell: (i) => <Button variant="danger" size="sm" onClick={() => undo(i)}><Undo2Icon /> Undo</Button> },
  ];
  return (
    <DataTable rows={past} columns={columns} getRowId={(i) => i.id} storageKey="ads.imports" caption="Past imports" initialSort={{ id: "imported", desc: true }}
      empty={{ icon: <FileUpIcon />, title: "No imports yet", description: "Use Import at the top of the dashboard to bring in a bulk export or CSV reports." }} />
  );
}

function Preview({ p, onRemove }: { p: Picked; onRemove: () => void }) {
  const s = useSortable("ads.import-preview", p.parsed?.rows ?? [], {
    campaign: { value: (x) => x.campaignName, kind: "text" }, term: { value: (x) => x.searchTerm, kind: "text" },
    dates: { value: (x) => x.dateFrom ?? x.campaignStart, kind: "date" }, clicks: { value: (x) => x.clicks, kind: "number" },
    cost: { value: (x) => x.cost, kind: "number" }, orders: { value: (x) => x.orders, kind: "number" }, sales: { value: (x) => x.sales, kind: "number" },
  });
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
          <thead><tr className="border-b text-left text-xs tracking-wide text-muted-foreground uppercase">
            <SortTh {...s.th("campaign")} className="px-2 py-1">Campaign</SortTh>{isTerms && <SortTh {...s.th("term")} className="px-2 py-1">Search term</SortTh>}<SortTh {...s.th("dates")} className="px-2 py-1">Dates</SortTh>
            <SortTh {...s.th("clicks")} numeric className="px-2 py-1 text-right">Clicks</SortTh><SortTh {...s.th("cost")} numeric className="px-2 py-1 text-right">Spend</SortTh>
            <SortTh {...s.th("orders")} numeric className="px-2 py-1 text-right">Orders</SortTh><SortTh {...s.th("sales")} numeric className="px-2 py-1 text-right">Sales</SortTh>
          </tr></thead>
          <tbody>{s.rows.slice(0, 8).map((x, i) => (
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

function BulkPreview({ b, onChange, onRemove }: { b: PickedBulk; onChange: (patch: Partial<PickedBulk>) => void; onRemove: () => void }) {
  const bp = b.parsed;
  const s = useSortable("ads.import-bulk", bp?.campaigns ?? [], {
    campaign: { value: (c) => c.name, kind: "text" }, asin: { value: (c) => bp?.campaignAsins.get(c.campaignId) ?? null, kind: "text" },
    state: { value: (c) => c.state, kind: "text" }, keywords: { value: (c) => bp?.keywords.filter((k) => k.campaignId === c.campaignId).length ?? 0, kind: "number" },
    clicks: { value: (c) => c.clicks, kind: "number" }, cost: { value: (c) => c.cost, kind: "number" },
    orders: { value: (c) => c.orders, kind: "number" }, sales: { value: (c) => c.sales, kind: "number" },
  });
  if (!b.parsed) {
    return (
      <div className="panel flex items-start gap-3 border-fail/40 p-3">
        <div className="flex-1"><p className="font-medium">{b.name}</p><p className="text-sm text-fail">{b.error}</p></div>
        <button type="button" onClick={onRemove} aria-label="Remove"><XIcon className="size-4 text-muted-foreground" /></button>
      </div>
    );
  }
  const r = b.parsed;
  const t = r.campaigns.reduce((a, x) => ({ clicks: a.clicks + x.clicks, cost: a.cost + x.cost, orders: a.orders + x.orders, sales: a.sales + x.sales }), { clicks: 0, cost: 0, orders: 0, sales: 0 });
  const counts: [number, string][] = [[r.campaigns.length, "campaigns"], [r.placements.length, "placements"], [r.adGroups.length, "ad groups"], [r.productAds.length, "product ads"], [r.keywords.length, "keywords"], [r.negatives.length, "negatives"], [r.targets.length, "product targets"], [r.searchTerms.length, "search terms"]];
  const warnings = r.warnings.filter((w) => !/which dates/.test(w));
  return (
    <div className="panel space-y-2 p-3">
      <div className="flex items-start gap-3">
        <div className="flex-1 space-y-1">
          <p className="font-medium">{b.name} <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand">{r.label}</span></p>
          <p className="text-xs text-muted-foreground">{counts.filter(([n]) => n).map(([n, w]) => `${n} ${w}`).join(" · ")} · {`${t.clicks.toLocaleString("en-GB")} clicks, ${gbp(t.cost)} spend, ${t.orders} orders, ${gbp(t.sales)} sales`}</p>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Figures cover</span>
            <Input type="date" className="h-7 w-auto" value={b.from} onChange={(e) => onChange({ from: e.target.value })} aria-label="From" />
            <span>to</span>
            <Input type="date" className="h-7 w-auto" value={b.to} onChange={(e) => onChange({ to: e.target.value })} aria-label="To" />
            <span className="text-xs text-muted-foreground">the range chosen when exporting (the file doesn&apos;t say)</span>
          </div>
          {warnings.map((w) => <p key={w} className="text-xs text-warn">{w}</p>)}
        </div>
        <button type="button" onClick={onRemove} aria-label="Remove"><XIcon className="size-4 text-muted-foreground" /></button>
      </div>
      <div className="overflow-x-auto rounded border">
        <table className="w-full text-xs">
          <thead><tr className="border-b text-left text-xs tracking-wide text-muted-foreground uppercase">
            <SortTh {...s.th("campaign")} className="px-2 py-1">Campaign</SortTh><SortTh {...s.th("asin")} className="px-2 py-1">ASIN (from product ads)</SortTh><SortTh {...s.th("state")} className="px-2 py-1">State</SortTh>
            <SortTh {...s.th("keywords")} numeric className="px-2 py-1 text-right">Keywords</SortTh><SortTh {...s.th("clicks")} numeric className="px-2 py-1 text-right">Clicks</SortTh>
            <SortTh {...s.th("cost")} numeric className="px-2 py-1 text-right">Spend</SortTh><SortTh {...s.th("orders")} numeric className="px-2 py-1 text-right">Orders</SortTh><SortTh {...s.th("sales")} numeric className="px-2 py-1 text-right">Sales</SortTh>
          </tr></thead>
          <tbody>{s.rows.map((c) => (
            <tr key={c.campaignId} className="border-b last:border-b-0">
              <td className="px-2 py-1">{c.name}</td>
              <td className="px-2 py-1">{r.campaignAsins.get(c.campaignId) ?? <span className="text-muted-foreground">{r.productAds.some((p) => p.campaignId === c.campaignId) ? "several" : "none"}</span>}</td>
              <td className="px-2 py-1">{c.state}</td>
              <td className="num px-2 py-1 text-right">{r.keywords.filter((k) => k.campaignId === c.campaignId).length}</td>
              <td className="num px-2 py-1 text-right">{c.clicks}</td><td className="num px-2 py-1 text-right">{gbp(c.cost)}</td>
              <td className="num px-2 py-1 text-right">{c.orders}</td><td className="num px-2 py-1 text-right">{gbp(c.sales)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
