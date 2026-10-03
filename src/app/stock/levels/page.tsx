"use client";

import { PlusIcon, TruckIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { usePageCrumbs } from "@/components/Crumbs";
import { SortTh, useSortable } from "@/components/SortableTable";
import { EmptyState, ErrorState } from "@/components/States";
import { NewItemDialog } from "@/components/stock/actions";
import { ItemDrawer } from "@/components/stock/ItemDrawer";
import { StockPurchaseDialog } from "@/components/tracker/StockPurchase";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ItemLevels, StockSettings } from "@/lib/server/stock";
import { BUCKET_LABEL, BUCKETS } from "@/lib/stock/levels";
import { api } from "@/lib/ui/client";
import { cn } from "@/lib/utils";

interface Data { items: ItemLevels[]; settings: StockSettings; fbaSynced: string | null }

const gbp = (v: number | null | undefined) => (v == null ? "—" : `£${v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const STATUS_CLS = { ok: "bg-pass-soft text-pass", low: "bg-warn-soft text-warn", out: "bg-fail-soft text-fail" } as const;
const STATUS_RANK = { out: 0, low: 1, ok: 2 } as const;

/** Days of cover: "—" when nothing sells, a red 0 when there's none. */
function Cover({ days }: { days: number | null }) {
  if (days == null) return <span className="text-muted-foreground" title="Nothing sold in 30 days">—</span>;
  if (days === 0) return <span className="font-medium text-fail">0</span>;
  return <span className={cn(days < 14 && "text-warn")}>{days >= 999 ? "999+" : Math.round(days)}</span>;
}

/** Stock → Levels: every item, its units per bucket and in all, value at cost, days of cover and status. */
export default function StockLevelsPage() {
  usePageCrumbs([{ label: "Stock", href: "/stock/levels" }, { label: "Levels" }]);
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  // ?item=<id> opens that item (the Tracker and Reorder link here).
  const [open, setOpen] = useState<string | null>(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("item")));
  const [adding, setAdding] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const load = useCallback(() => api<Data>("/api/stock/levels").then(setD).catch((e: Error) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const s = useSortable("stock.levels", d?.items ?? [], {
    item: { value: (r) => r.item.name }, sku: { value: (r) => r.item.sku },
    home: { value: (r) => r.levels.home, kind: "number" }, fba: { value: (r) => (r.fba.matched ? r.levels.fba : null), kind: "number" }, tiktok_fbt: { value: (r) => r.levels.tiktok_fbt, kind: "number" },
    total: { value: (r) => r.total, kind: "number" }, value: { value: (r) => r.value, kind: "number" },
    cover: { value: (r) => r.cover.total, kind: "number" }, status: { value: (r) => STATUS_RANK[r.status], kind: "number" }, supplier: { value: (r) => r.item.supplier_name },
  });
  if (error) return <ErrorState title="Couldn't load stock" message={error} onRetry={load} />;
  if (!d) return <Skeleton className="h-64 rounded-lg" />;
  const row = d.items.find((r) => r.item.id === open) ?? null;
  const totals = { units: d.items.reduce((a, r) => a + r.total, 0), value: d.items.reduce((a, r) => a + (r.value ?? 0), 0) };
  const synced = d.fbaSynced ? new Date(d.fbaSynced).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-3xl">
          <h1 className="page-title">Levels</h1>
          <p className="text-sm text-muted-foreground">
            What you hold, per item and bucket. Self-ship and TikTok FBT are the sum of their movements (receipts, sales, returns, adjustments, transfers); Amazon FBA is SP-API&apos;s fulfillable count{synced ? `, synced ${synced}` : ""}, never typed. Days of cover use the last 30 days&apos; sales: Amazon&apos;s orders and the sales recorded here. Low at or under the item&apos;s low-stock level (default {d.settings.lowStockDefault}).
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setOrdering(true)}><TruckIcon /> Record a new order</Button>
          <Button onClick={() => setAdding(true)}><PlusIcon /> New item</Button>
        </div>
      </div>
      {!d.items.length ? (
        <EmptyState title="No stock items yet">Import from StockPilot or a CSV (Import), or add an item.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-[11px] tracking-wide text-muted-foreground uppercase">
                <SortTh {...s.th("item")} className="px-2 py-1.5">Item</SortTh>
                <SortTh {...s.th("home")} numeric className="px-2 py-1.5 text-right">{BUCKET_LABEL.home}</SortTh>
                <SortTh {...s.th("fba")} numeric className="px-2 py-1.5 text-right" title={synced ? `From SP-API, synced ${synced}` : "From SP-API"}>{BUCKET_LABEL.fba}<span className="block font-normal normal-case">{synced ? `SP-API, ${synced}` : "from SP-API"}</span></SortTh>
                <SortTh {...s.th("tiktok_fbt")} numeric className="px-2 py-1.5 text-right">{BUCKET_LABEL.tiktok_fbt}</SortTh>
                <SortTh {...s.th("total")} numeric className="px-2 py-1.5 text-right">Total</SortTh>
                <SortTh {...s.th("value")} numeric className="px-2 py-1.5 text-right">Value at cost</SortTh>
                <SortTh {...s.th("cover")} numeric className="px-2 py-1.5 text-right" title="Days of cover per bucket and in all, at the last 30 days' sales">Days of cover</SortTh>
                <SortTh {...s.th("status")} className="px-2 py-1.5">Status</SortTh>
                <SortTh {...s.th("supplier")} className="px-2 py-1.5">Supplier</SortTh>
              </tr>
            </thead>
            <tbody>{s.rows.map((r) => (
              <tr key={r.item.id} onClick={() => setOpen(r.item.id)} className={cn("cursor-pointer border-b last:border-b-0 hover:bg-surface-2", r.item.status === "discontinued" && "opacity-60")}>
                <td className="px-2 py-1.5"><div className="font-medium">{r.item.name}</div><div className="num text-xs text-muted-foreground">{r.item.sku}{r.item.asin ? ` · ${r.item.asin}` : ""}</div></td>
                <td className="num px-2 py-1.5 text-right">{r.levels.home}</td>
                <td className="num px-2 py-1.5 text-right">{r.fba.matched ? r.levels.fba : <span className="text-muted-foreground" title="No SP-API stock for this SKU/ASIN">—</span>}</td>
                <td className="num px-2 py-1.5 text-right">{r.levels.tiktok_fbt}</td>
                <td className="num px-2 py-1.5 text-right font-semibold">{r.total}</td>
                <td className="num px-2 py-1.5 text-right">{gbp(r.value)}</td>
                <td className="num px-2 py-1.5 text-right" title={BUCKETS.map((b) => `${BUCKET_LABEL[b]}: ${r.cover[b] == null ? "no sales" : `${Math.round(r.cover[b]!)} days`}`).join("\n")}>
                  <Cover days={r.cover.total} />
                  <span className="block text-[10.5px] text-muted-foreground">{BUCKETS.map((b) => (r.cover[b] == null ? "—" : Math.round(r.cover[b]!))).join(" · ")}</span>
                </td>
                <td className="px-2 py-1.5"><span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_CLS[r.status])}>{r.status}</span></td>
                <td className="px-2 py-1.5 text-xs text-muted-foreground">{r.item.supplier_name ?? "—"}</td>
              </tr>
            ))}</tbody>
            <tfoot><tr className="border-t bg-surface-2 text-sm font-medium">
              <td className="px-2 py-1.5">{d.items.length} items</td>
              {BUCKETS.map((b) => <td key={b} className="num px-2 py-1.5 text-right">{d.items.reduce((a, r) => a + r.levels[b], 0)}</td>)}
              <td className="num px-2 py-1.5 text-right">{totals.units}</td>
              <td className="num px-2 py-1.5 text-right">{gbp(totals.value)}</td>
              <td colSpan={3} />
            </tr></tfoot>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Days of cover: the total, then per bucket ({BUCKETS.map((b) => BUCKET_LABEL[b]).join(" · ")}). &quot;—&quot; when nothing sold in 30 days.</p>
      {row && <ItemDrawer row={row} onClose={() => setOpen(null)} onChanged={load} />}
      {ordering && <StockPurchaseDialog open onOpenChange={(o) => { if (!o) setOrdering(false); }} onSaved={load} />}
      <NewItemDialog open={adding} onClose={() => setAdding(false)} onDone={(id) => { load().then(() => setOpen(id)); }} />
    </div>
  );
}
