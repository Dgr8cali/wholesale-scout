"use client";

import { StockLevel } from "@/components/ui/status-chip";
import { ArchiveRestoreIcon, MoreHorizontalIcon, PackageIcon, PencilIcon, PlusIcon, Trash2Icon, TruckIcon, UploadIcon } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useDialogs } from "@/components/Dialogs";
import { NegativeChip, itemActions } from "@/components/stock/corrections";
import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { ErrorState } from "@/components/States";
import { NewItemDialog } from "@/components/stock/actions";
import { ItemDrawer } from "@/components/stock/ItemDrawer";
import { StockPurchaseDialog } from "@/components/tracker/StockPurchase";
import { Button } from "@/components/ui/button";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import type { ItemLevels, StockSettings } from "@/lib/server/stock";
import { BUCKET_LABEL, BUCKETS } from "@/lib/stock/levels";
import { api } from "@/lib/ui/client";
import { cn } from "@/lib/utils";

interface Data { items: ItemLevels[]; settings: StockSettings; fbaSynced: string | null; archivedCount: number }

const gbp = (v: number | null | undefined) => (v == null ? "—" : `£${v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const STATUS_RANK = { out: 0, low: 1, ok: 2 } as const;

/** Days of cover: "—" when nothing sells, a red 0 when there's none. */
function Cover({ days }: { days: number | null }) {
  if (days == null) return <span className="text-muted-foreground" title="Nothing sold in 30 days">—</span>;
  if (days === 0) return <span className="font-medium text-danger">0</span>;
  return <span className={cn(days < 14 && "text-warn-ink")}>{days >= 999 ? "999+" : Math.round(days)}</span>;
}

/** Stock → Levels: every item, its units per bucket and in all, value at cost, days of cover and status. */
export default function StockLevelsPage() {
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  // ?item=<id> opens that item (the Tracker and Reorder link here).
  const [open, setOpen] = useState<string | null>(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("item")));
  const [adding, setAdding] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [archived, setArchived] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { confirm } = useDialogs();
  const load = useCallback(() => api<Data>(`/api/stock/levels${archived ? "?archived=1" : ""}`).then((r) => { setD(r); setSelected((sel) => new Set([...sel].filter((id) => r.items.some((i) => i.item.id === id)))); }).catch((e: Error) => setError(e.message)), [archived]);
  useEffect(() => { load(); }, [load]);
  const acts = itemActions(confirm, () => { load(); });
  if (error) return <ErrorState title="Couldn't load stock" message={error} onRetry={load} />;
  if (!d) return <Skeleton className="h-64 rounded-xl" />;
  const row = d.items.find((r) => r.item.id === open) ?? null;
  const shownIds = d.items.map((r) => r.item.id);
  const allShown = shownIds.length > 0 && shownIds.every((id) => selected.has(id));
  const toggle = (id: string) => setSelected((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const bulk = async (action: "archive" | "restore" | "purge") => {
    const ids = [...selected];
    const label = { archive: "Archive", restore: "Restore", purge: "Delete permanently" }[action];
    if (action !== "restore" && !(await confirm({
      title: `${label} ${ids.length} item${ids.length === 1 ? "" : "s"}?`,
      description: action === "archive" ? "Archived items are hidden from Levels, Reorder and Home, with their movements, sales, listings and orders kept. Show archived lists them, to Restore." : "Each item goes for good, with its movements, sales, listings and orders. The audit log keeps a copy.",
      confirmLabel: label, destructive: true,
    }))) return;
    try {
      const r = await api<{ done: number }>("/api/stock/items/bulk", { method: "POST", json: { ids, action } });
      toast.success(`${r.done} item${r.done === 1 ? "" : "s"} ${{ archive: "archived", restore: "restored", purge: "deleted permanently" }[action]}`);
      setSelected(new Set());
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const totals = { units: d.items.reduce((a, r) => a + r.total, 0), value: d.items.reduce((a, r) => a + (r.value ?? 0), 0) };
  const synced = d.fbaSynced ? new Date(d.fbaSynced).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;
  const stop = (e: MouseEvent) => e.stopPropagation();
  const columns: DataColumn<ItemLevels>[] = [
    {
      id: "select", mobileHidden: true, headerClassName: "w-8", className: "w-8",
      header: <input type="checkbox" aria-label="Select all" checked={allShown} onChange={() => setSelected(allShown ? new Set() : new Set(shownIds))} />,
      cell: (r) => <span onClick={stop}><input type="checkbox" aria-label={`Select ${r.item.sku}`} checked={selected.has(r.item.id)} onChange={() => toggle(r.item.id)} /></span>,
    },
    {
      id: "item", header: "Item", mobile: "title", className: "min-w-64", sortValue: (r) => r.item.name,
      cell: (r) => <div className="min-w-0"><div className="font-medium">{r.item.name}</div><div className="num text-xs text-muted-foreground">{r.item.sku}{r.item.asin ? ` · ${r.item.asin}` : ""}</div></div>,
    },
    { id: "home", header: BUCKET_LABEL.home, numeric: true, sortValue: (r) => r.levels.home, cell: (r) => <span className="whitespace-nowrap">{r.levels.home}{r.levels.home < 0 && <NegativeChip />}</span> },
    { id: "fba", header: BUCKET_LABEL.fba, numeric: true, sortValue: (r) => (r.fba.matched ? r.levels.fba : null), cell: (r) => (r.fba.matched ? r.levels.fba : <span className="text-muted-foreground" title="No SP-API stock for this SKU/ASIN">—</span>) },
    { id: "tiktok_fbt", header: BUCKET_LABEL.tiktok_fbt, numeric: true, sortValue: (r) => r.levels.tiktok_fbt, cell: (r) => <span className="whitespace-nowrap">{r.levels.tiktok_fbt}{r.levels.tiktok_fbt < 0 && <NegativeChip />}</span> },
    { id: "total", header: "Total", numeric: true, mobile: 2, sortValue: (r) => r.total, cell: (r) => <span className="font-semibold">{r.total}</span> },
    { id: "value", header: "Value at cost", numeric: true, sortValue: (r) => r.value, cell: (r) => gbp(r.value) },
    {
      id: "cover", header: "Days of cover", numeric: true, mobile: 3, sortValue: (r) => r.cover.total,
      cell: (r) => (
        <span title={BUCKETS.map((b) => `${BUCKET_LABEL[b]}: ${r.cover[b] == null ? "no sales" : `${Math.round(r.cover[b]!)} days`}`).join("\n")}>
          <Cover days={r.cover.total} />
          <span className="block text-xs text-muted-foreground">{BUCKETS.map((b) => (r.cover[b] == null ? "—" : Math.round(r.cover[b]!))).join(" · ")}</span>
        </span>
      ),
    },
    { id: "status", header: "Status", mobile: 1, sortValue: (r) => STATUS_RANK[r.status], cell: (r) => <StockLevel status={r.status} /> },
    { id: "supplier", header: "Supplier", sortValue: (r) => r.item.supplier_name, cell: (r) => <span className="text-meta text-muted-foreground">{r.item.supplier_name ?? "—"}</span> },
    {
      id: "actions", header: "", className: "text-right whitespace-nowrap",
      cell: (r) => (
        <span onClick={stop}>
          {archived ? (
            <span className="inline-flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => acts.restore(r.item)}><ArchiveRestoreIcon /> Restore</Button>
              <Button size="sm" variant="danger" onClick={() => acts.purge(r.item)}>Delete permanently</Button>
            </span>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${r.item.sku}`}><MoreHorizontalIcon /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onSelect={() => setOpen(r.item.id)}><PencilIcon /> Open</DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={() => acts.archive(r.item)}><Trash2Icon /> Delete…</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </span>
      ),
    },
  ];
  return (
    <div className="space-y-4">
      <PageHeader
        title="Levels"
        crumbs={[{ label: "Stock", href: "/stock/levels" }, { label: "Levels" }]}
        subtitle={`${d.items.length} ${archived ? "archived " : ""}item${d.items.length === 1 ? "" : "s"} · ${totals.units.toLocaleString("en-GB")} units · ${gbp(totals.value)} at cost${synced ? ` · FBA synced ${synced}` : ""}`}
        info={<>
          <p>What you hold, per item and bucket. Self-ship and TikTok FBT are the sum of their movements (receipts, sales, returns, adjustments, transfers); Amazon FBA is SP-API&apos;s fulfillable count, never typed.</p>
          <p>Days of cover use the last 30 days&apos; sales: Amazon&apos;s orders and the sales recorded here. The column shows the total, then per bucket ({BUCKETS.map((b) => BUCKET_LABEL[b]).join(" · ")}); &quot;—&quot; when nothing sold in 30 days.</p>
          <p>Low at or under the item&apos;s low-stock level (default {d.settings.lowStockDefault}).</p>
        </>}
        actions={<>
          <Button variant="secondary" onClick={() => setOrdering(true)}><TruckIcon /> Record a new order</Button>
          <Button onClick={() => setAdding(true)}><PlusIcon /> New item</Button>
        </>}
      />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button type="button" aria-pressed={archived} onClick={() => { setArchived((a) => !a); setSelected(new Set()); setOpen(null); }}
          className={cn("h-8 cursor-pointer rounded-full border px-3 text-meta font-medium", archived ? "border-primary bg-primary-soft text-primary-ink" : "border-border text-muted-foreground hover:text-foreground")}>
          Show archived{d.archivedCount ? ` · ${d.archivedCount}` : ""}
        </button>
        {d.items.length > 0 && <span className="num text-meta text-muted-foreground">{BUCKETS.map((b) => `${BUCKET_LABEL[b]} ${d.items.reduce((a, r) => a + r.levels[b], 0)}`).join(" · ")}</span>}
        {selected.size > 0 && (
          <>
            <span>{selected.size} selected</span>
            {archived ? (
              <>
                <Button size="sm" variant="secondary" onClick={() => bulk("restore")}><ArchiveRestoreIcon /> Restore selected</Button>
                <Button size="sm" variant="danger" onClick={() => bulk("purge")}><Trash2Icon /> Delete permanently</Button>
              </>
            ) : <Button size="sm" variant="danger" onClick={() => bulk("archive")}><Trash2Icon /> Archive selected</Button>}
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </>
        )}
      </div>
      <DataTable
        rows={d.items}
        columns={columns}
        getRowId={(r) => r.item.id}
        storageKey="stock.levels"
        caption="Stock levels"
        onRowClick={archived ? undefined : (r) => setOpen(r.item.id)}
        rowClassName={(r) => cn(r.item.status === "discontinued" && "opacity-60", selected.has(r.item.id) && "bg-primary-soft/30")}
        empty={archived
          ? { icon: <ArchiveRestoreIcon />, title: "No archived items", description: "Deleting an item archives it; it shows here to Restore or delete permanently." }
          : { icon: <PackageIcon />, title: "No stock items yet", description: "Import from StockPilot or a CSV, or add an item.", action: <Button asChild variant="secondary"><Link href="/stock/import"><UploadIcon /> Import</Link></Button> }}
      />
      {row && <ItemDrawer row={row} onClose={() => setOpen(null)} onChanged={load} />}
      {ordering && <StockPurchaseDialog open onOpenChange={(o) => { if (!o) setOrdering(false); }} onSaved={load} />}
      <NewItemDialog open={adding} onClose={() => setAdding(false)} onDone={(id) => { load().then(() => setOpen(id)); }} />
    </div>
  );
}
