"use client";

import { FileUpIcon, LoaderIcon, UploadIcon } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { usePageCrumbs } from "@/components/Crumbs";
import { SortTh, useSortable } from "@/components/SortableTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ImportPreview } from "@/lib/server/stock";
import { api } from "@/lib/ui/client";
import { cn } from "@/lib/utils";

type Kind = "stockpilot" | "csv";
type Src = { kind: "stockpilot"; raw: unknown; name: string } | { kind: "csv"; text: string; name: string };

/** Stock → Import: StockPilot's raw table export, or a CSV of items, previewed before anything is written. */
export default function StockImportPage() {
  usePageCrumbs([{ label: "Stock", href: "/stock/levels" }, { label: "Import" }]);
  const [tab, setTab] = useState<Kind>("stockpilot");
  return (
    <div className="space-y-4">
      <div className="max-w-3xl">
        <h1 className="page-title">Import</h1>
        <p className="text-sm text-muted-foreground">Bring your stock in from StockPilot or a spreadsheet. Nothing is written until you click Import, and importing the same file again updates what&apos;s there rather than adding it twice.</p>
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as Kind)}>
        <TabsList>
          <TabsTrigger value="stockpilot">StockPilot export</TabsTrigger>
          <TabsTrigger value="csv">Items CSV</TabsTrigger>
        </TabsList>
        <TabsContent value="stockpilot" className="pt-3"><Importer kind="stockpilot" /></TabsContent>
        <TabsContent value="csv" className="pt-3"><Importer kind="csv" /></TabsContent>
      </Tabs>
    </div>
  );
}

function Importer({ kind }: { kind: Kind }) {
  const [src, setSrc] = useState<Src | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [asins, setAsins] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const body = (s: Src, extra: Record<string, unknown> = {}) => (s.kind === "stockpilot" ? { kind: s.kind, raw: s.raw, ...extra } : { kind: s.kind, text: s.text, ...extra });

  const pick = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      const text = await f.text();
      const s: Src = kind === "stockpilot" ? { kind, raw: JSON.parse(text), name: f.name } : { kind, text, name: f.name };
      const r = await api<{ preview: ImportPreview }>("/api/stock/import", { method: "POST", json: body(s) });
      setSrc(s);
      setPreview(r.preview);
      setAsins(Object.fromEntries(r.preview.rows.map((x) => [x.sku, x.asin ?? x.suggestion?.asin ?? ""])));
    } catch (e) {
      toast.error(kind === "stockpilot" && e instanceof SyntaxError ? "That file isn't JSON: export the stockpilot_workspaces table as JSON" : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const run = async () => {
    if (!src) return;
    setBusy(true);
    try {
      const map = Object.fromEntries(Object.entries(asins).filter(([, v]) => /^[A-Z0-9]{10}$/i.test(v.trim())).map(([k, v]) => [k, v.trim().toUpperCase()]));
      const r = await api<{ applied: { items: number; listings: number; sales: number; movements: number; newMovements: number } }>("/api/stock/import", { method: "POST", json: body(src, { asins: map, apply: true }) });
      const a = r.applied;
      toast.success(`Imported ${a.items} item${a.items === 1 ? "" : "s"}, ${a.listings} listing${a.listings === 1 ? "" : "s"}, ${a.sales} sale${a.sales === 1 ? "" : "s"}, ${a.movements} movements (${a.newMovements} new)`);
      const again = await api<{ preview: ImportPreview }>("/api/stock/import", { method: "POST", json: body(src, { asins: map }) });
      setPreview(again.preview);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files); }}
        onClick={() => input.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") input.current?.click(); }}
        className={cn("panel flex cursor-pointer flex-col items-center gap-2 border-2 border-dashed px-6 py-8 text-center", over && "border-brand bg-brand-soft")}>
        {busy ? <LoaderIcon className="size-6 animate-spin text-muted-foreground" /> : <FileUpIcon className="size-6 text-muted-foreground" />}
        <p className="text-sm font-medium">{kind === "stockpilot" ? "Drop the stockpilot_workspaces export (.json), or click to choose" : "Drop a CSV of items, or click to choose"}</p>
        <p className="max-w-2xl text-xs text-muted-foreground">
          {kind === "stockpilot"
            ? "The table's raw rows: products, sales, restocks, adjustments, transfers and returns. Opening balances are set so each item ends at StockPilot's levels; its FBA quantities are left to SP-API and its photos left out."
            : "One item per row. Columns StockPilot used work: product_name, sku, cost_price, stock_quantity, reorder_level, supplier, supplier_website, photo_url (and plain names like name, unit cost, quantity). Quantities become opening balances in Self-ship."}
        </p>
        <input ref={input} type="file" accept={kind === "stockpilot" ? ".json,application/json" : ".csv,text/csv"} hidden onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      </div>
      {preview && src && <PreviewTable src={src} preview={preview} asins={asins} setAsins={setAsins} busy={busy} onImport={run} />}
    </div>
  );
}

function PreviewTable({ src, preview, asins, setAsins, busy, onImport }: { src: Src; preview: ImportPreview; asins: Record<string, string>; setAsins: (a: Record<string, string>) => void; busy: boolean; onImport: () => void }) {
  type R = ImportPreview["rows"][number];
  const s = useSortable<R>("stock.import", preview.rows, {
    sku: { value: (r) => r.sku }, name: { value: (r) => r.name }, asin: { value: (r) => asins[r.sku] || null }, supplier: { value: (r) => r.supplier },
    action: { value: (r) => r.action }, home: { value: (r) => r.home, kind: "number" }, tiktok: { value: (r) => r.tiktok_fbt, kind: "number" },
    fba: { value: (r) => r.fbaDropped, kind: "number" }, movements: { value: (r) => r.movements, kind: "number" },
  });
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="font-semibold">{src.name}</h2>
        <span className="text-sm text-muted-foreground">{preview.rows.length} item{preview.rows.length === 1 ? "" : "s"} · {preview.plan.listings.length} listings · {preview.plan.sales.length} sales · {preview.movementsNew} movement{preview.movementsNew === 1 ? "" : "s"} new, {preview.movementsExisting} already imported</span>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-[11px] tracking-wide text-muted-foreground uppercase">
            <SortTh {...s.th("sku")} className="px-2 py-1.5">SKU</SortTh>
            <SortTh {...s.th("name")} className="px-2 py-1.5">Name</SortTh>
            <SortTh {...s.th("asin")} className="px-2 py-1.5">ASIN</SortTh>
            <SortTh {...s.th("supplier")} className="px-2 py-1.5">Supplier</SortTh>
            <SortTh {...s.th("action")} className="px-2 py-1.5">Item</SortTh>
            <SortTh {...s.th("home")} numeric className="px-2 py-1.5 text-right">Self-ship</SortTh>
            <SortTh {...s.th("tiktok")} numeric className="px-2 py-1.5 text-right">TikTok FBT</SortTh>
            <SortTh {...s.th("fba")} numeric className="px-2 py-1.5 text-right" title="StockPilot's FBA quantity, left to SP-API">FBA dropped</SortTh>
            <SortTh {...s.th("movements")} numeric className="px-2 py-1.5 text-right">Movements</SortTh>
          </tr></thead>
          <tbody>{s.rows.map((r) => (
            <tr key={r.ref} className="border-b align-top last:border-b-0">
              <td className="num px-2 py-1.5">{r.sku}</td>
              <td className="px-2 py-1.5">{r.name}</td>
              <td className="px-2 py-1.5">
                <Input className="num h-7 w-32 uppercase" value={asins[r.sku] ?? ""} placeholder="none" onChange={(e) => setAsins({ ...asins, [r.sku]: e.target.value })} aria-label={`ASIN for ${r.sku}`} />
                {!r.asin && r.suggestion && <span className="block max-w-56 text-[11px] text-muted-foreground">Suggested from Ads product: {r.suggestion.title.slice(0, 50)} ({r.suggestion.shared.join(", ")}). Clear it if wrong.</span>}
                {r.asin && <span className="block text-[11px] text-muted-foreground">Matched by SKU</span>}
              </td>
              <td className="px-2 py-1.5 text-xs">{r.supplier ? <>{r.supplier} <span className={cn("rounded px-1 text-[10px] font-semibold uppercase", r.supplierAction === "match" ? "bg-pass-soft text-pass" : "bg-brand-soft text-brand")}>{r.supplierAction === "match" ? "matched" : "new"}</span></> : "—"}</td>
              <td className="px-2 py-1.5"><span className={cn("rounded px-1.5 text-[11px] font-semibold uppercase", r.action === "new" ? "bg-brand-soft text-brand" : "bg-empty-soft text-ink-2")}>{r.action === "new" ? "new" : "update"}</span></td>
              <td className="num px-2 py-1.5 text-right">{r.home}</td>
              <td className="num px-2 py-1.5 text-right">{r.tiktok_fbt}</td>
              <td className="num px-2 py-1.5 text-right text-muted-foreground">{r.fbaDropped}</td>
              <td className="num px-2 py-1.5 text-right">{r.movements}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {preview.unknownColumns && preview.unknownColumns.length > 0 && <p className="text-xs text-warn">Columns not read: {preview.unknownColumns.join(", ")}</p>}
      {preview.plan.notes.length > 0 && <ul className="list-inside list-disc space-y-0.5 text-xs text-muted-foreground">{preview.plan.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
      <div className="flex items-center gap-3">
        <Button onClick={onImport} disabled={busy || !preview.rows.length}>{busy ? <LoaderIcon className="animate-spin" /> : <UploadIcon />} Import</Button>
        <Link href="/stock/levels" className="text-sm text-brand hover:underline">Levels →</Link>
        <span className="text-xs text-muted-foreground">Self-ship and TikTok FBT are where each item ends up after the import.</span>
      </div>
    </section>
  );
}
