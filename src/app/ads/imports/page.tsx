"use client";

import { FileUpIcon, LoaderIcon, UploadIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { usePageCrumbs } from "@/components/Crumbs";
import { useDialogs } from "@/components/Dialogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { parseBulk, type ParsedBulk } from "@/lib/ads/bulk";
import { parseReport, REPORT_LABEL, type ParsedReport, type ReportType } from "@/lib/ads/parse";
import { api } from "@/lib/ui/client";
import { cn } from "@/lib/utils";

interface Picked { name: string; text: string; parsed: ParsedReport | null; error: string | null }
/** A bulk export (.xlsx): read here for the preview, sent as is; its date range is given here. */
interface PickedBulk { name: string; data: Uint8Array; parsed: ParsedBulk | null; error: string | null; from: string; to: string }
interface ImportRow { id: string; report_type: ReportType | "bulk"; file_name: string; rows: number; date_from: string | null; date_to: string | null; imported_at: string }

const day = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
const gbp = (v: number) => `£${v.toFixed(2)}`;
const base64 = (u: Uint8Array) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const LABEL: Record<string, string> = { ...REPORT_LABEL, bulk: "Bulk export" };

/** Ads → Imports: drop an Amazon Ads bulk export (or CSV reports), see what was read, import. */
export default function AdsImportsPage() {
  usePageCrumbs([{ label: "Ads", href: "/ads/dashboard" }, { label: "Imports" }]);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [bulks, setBulks] = useState<PickedBulk[]>([]);
  const [past, setPast] = useState<ImportRow[] | null>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const { confirm } = useDialogs();

  const loadPast = useCallback(() => api<{ imports: ImportRow[] }>("/api/ads/imports").then((r) => setPast(r.imports)).catch(() => setPast([])), []);
  useEffect(() => { loadPast(); }, [loadPast]);

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
          <p className="text-sm text-muted-foreground">The bulk export from Amazon Ads (Campaign manager → Bulk operations, with the search term data) gives everything in one file: campaigns, placements, ad groups, keywords with their IDs and bids, negatives, product ads (which map campaigns to ASINs) and search terms with the keyword that matched. CSV reports (Search term, Campaign, the Campaign Manager grid) still work. Importing the same data again doesn&apos;t double it.</p>
        </div>
        <Button asChild variant="outline"><Link href="/ads/dashboard">Dashboard</Link></Button>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
        onClick={() => input.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") input.current?.click(); }}
        className={cn("panel flex cursor-pointer flex-col items-center gap-2 border-2 border-dashed px-6 py-10 text-center", over && "border-brand bg-brand-soft")}>
        <FileUpIcon className="size-6 text-muted-foreground" />
        <p className="text-sm font-medium">Drop the bulk export (.xlsx) or CSV reports here, or click to choose</p>
        <p className="text-xs text-muted-foreground">Nothing is imported until you confirm.</p>
        <input ref={input} type="file" accept=".xlsx,.csv,text/csv" multiple hidden onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ""; }} />
      </div>

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
                  <td className="px-2 py-1.5">{LABEL[i.report_type] ?? i.report_type}</td>
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

function BulkPreview({ b, onChange, onRemove }: { b: PickedBulk; onChange: (patch: Partial<PickedBulk>) => void; onRemove: () => void }) {
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
          <thead><tr className="border-b text-left text-[10.5px] tracking-wide text-muted-foreground uppercase">
            <th className="px-2 py-1">Campaign</th><th className="px-2 py-1">ASIN (from product ads)</th><th className="px-2 py-1">State</th>
            <th className="px-2 py-1 text-right">Keywords</th><th className="px-2 py-1 text-right">Clicks</th><th className="px-2 py-1 text-right">Spend</th><th className="px-2 py-1 text-right">Orders</th><th className="px-2 py-1 text-right">Sales</th>
          </tr></thead>
          <tbody>{r.campaigns.map((c) => (
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
