"use client";

import { FileUpIcon, UploadIcon } from "lucide-react";
import { FileDrop } from "@/components/ui/file-drop";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusChip } from "@/components/ui/status-chip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ImportPreview } from "@/lib/server/stock";
import { api } from "@/lib/ui/client";

type Kind = "stockpilot" | "csv";
type Src = { kind: "stockpilot"; raw: unknown; name: string } | { kind: "csv"; text: string; name: string };

/** Stock → Import: StockPilot's raw table export, or a CSV of items, previewed before anything is written. */
export default function StockImportPage() {
  const [tab, setTab] = useState<Kind>("stockpilot");
  return (
    <div className="space-y-4">
      <PageHeader
        title="Import"
        crumbs={[{ label: "Stock", href: "/stock/levels" }, { label: "Import" }]}
        subtitle="Bring your stock in from StockPilot or a spreadsheet."
        info={<p>Nothing is written until you click Import, and importing the same file again updates what&apos;s there rather than adding it twice.</p>}
      />
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
      <FileDrop onFiles={(f) => pick(f)} busy={busy} icon={<FileUpIcon />} accept={kind === "stockpilot" ? ".json,application/json" : ".csv,text/csv"}
        title={kind === "stockpilot" ? "Drop the stockpilot_workspaces export (.json), or click to choose" : "Drop a CSV of items, or click to choose"}
        hint={kind === "stockpilot"
          ? "The table's raw rows: products, sales, restocks, adjustments, transfers and returns. Opening balances are set so each item ends at StockPilot's levels; its FBA quantities are left to SP-API and its photos left out."
          : "One item per row. Columns StockPilot used work: product_name, sku, cost_price, stock_quantity, reorder_level, supplier, supplier_website, photo_url (and plain names like name, unit cost, quantity). Quantities become opening balances in Self-ship."} />
      {preview && src && <PreviewTable src={src} preview={preview} asins={asins} setAsins={setAsins} busy={busy} onImport={run} />}
    </div>
  );
}

function PreviewTable({ src, preview, asins, setAsins, busy, onImport }: { src: Src; preview: ImportPreview; asins: Record<string, string>; setAsins: (a: Record<string, string>) => void; busy: boolean; onImport: () => void }) {
  type R = ImportPreview["rows"][number];
  const columns: DataColumn<R>[] = [
    { id: "sku", header: "SKU", mobile: 1, sortValue: (r) => r.sku, cell: (r) => <span className="num">{r.sku}</span> },
    { id: "name", header: "Name", mobile: "title", sortValue: (r) => r.name, cell: (r) => r.name },
    {
      id: "asin", header: "ASIN", className: "align-top", sortValue: (r) => asins[r.sku] || null,
      cell: (r) => (
        <div>
          <Input className="num h-8 w-32 uppercase" value={asins[r.sku] ?? ""} placeholder="none" onChange={(e) => setAsins({ ...asins, [r.sku]: e.target.value })} aria-label={`ASIN for ${r.sku}`} />
          {!r.asin && r.suggestion && <span className="block max-w-56 text-xs text-muted-foreground">Suggested from Ads product: {r.suggestion.title.slice(0, 50)} ({r.suggestion.shared.join(", ")}). Clear it if wrong.</span>}
          {r.asin && <span className="block text-xs text-muted-foreground">Matched by SKU</span>}
        </div>
      ),
    },
    {
      id: "supplier", header: "Supplier", sortValue: (r) => r.supplier,
      cell: (r) => (r.supplier ? <span className="inline-flex flex-wrap items-center gap-1 text-meta">{r.supplier} <StatusChip tone={r.supplierAction === "match" ? "good" : "info"} icon={false}>{r.supplierAction === "match" ? "Matched" : "New"}</StatusChip></span> : "—"),
    },
    { id: "action", header: "Item", mobile: 2, sortValue: (r) => r.action, cell: (r) => <StatusChip tone={r.action === "new" ? "info" : "neutral"} icon={false}>{r.action === "new" ? "New" : "Update"}</StatusChip> },
    { id: "home", header: "Self-ship", numeric: true, mobile: 3, sortValue: (r) => r.home, cell: (r) => r.home },
    { id: "tiktok", header: "TikTok FBT", numeric: true, sortValue: (r) => r.tiktok_fbt, cell: (r) => r.tiktok_fbt },
    { id: "fba", header: <span title="StockPilot's FBA quantity, left to SP-API">FBA dropped</span>, numeric: true, sortValue: (r) => r.fbaDropped, cell: (r) => <span className="text-muted-foreground">{r.fbaDropped}</span> },
    { id: "movements", header: "Movements", numeric: true, sortValue: (r) => r.movements, cell: (r) => r.movements },
  ];
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="section-title">{src.name}</h2>
        <span className="text-meta text-muted-foreground">{preview.rows.length} item{preview.rows.length === 1 ? "" : "s"} · {preview.plan.listings.length} listings · {preview.plan.sales.length} sales · {preview.movementsNew} movement{preview.movementsNew === 1 ? "" : "s"} new, {preview.movementsExisting} already imported</span>
      </div>
      <DataTable rows={preview.rows} columns={columns} getRowId={(r) => r.ref} storageKey="stock.import" caption="Import preview"
        empty={{ icon: <FileUpIcon />, title: "Nothing to import", description: "The file has no items in it." }} />
      {preview.unknownColumns && preview.unknownColumns.length > 0 && <p className="text-xs text-warn-ink">Columns not read: {preview.unknownColumns.join(", ")}</p>}
      {preview.plan.notes.length > 0 && <ul className="list-inside list-disc space-y-0.5 text-xs text-muted-foreground">{preview.plan.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
      <div className="flex items-center gap-3">
        <Button onClick={onImport} loading={busy} disabled={!preview.rows.length}><UploadIcon /> Import</Button>
        <Link href="/stock/levels" className="link text-sm">Levels →</Link>
        <span className="text-xs text-muted-foreground">Self-ship and TikTok FBT are where each item ends up after the import.</span>
      </div>
    </section>
  );
}
