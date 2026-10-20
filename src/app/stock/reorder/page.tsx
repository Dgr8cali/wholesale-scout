"use client";

import { PackageIcon, ShoppingCartIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip, type Tone } from "@/components/ui/status-chip";
import type { ItemLevels, StockSettings } from "@/lib/server/stock";
import { api } from "@/lib/ui/client";

// The reorder statuses keep their own words, in the shared chip tones.
const STATUS_CHIP: Record<"due" | "soon" | "ok" | "no demand", { label: string; tone: Tone }> = {
  due: { label: "Due", tone: "bad" }, soon: { label: "Soon", tone: "warn" }, ok: { label: "OK", tone: "good" }, "no demand": { label: "No demand", tone: "neutral" },
};
const STATUS_RANK = { due: 0, soon: 1, ok: 2, "no demand": 3 } as const;
const LEAD_FROM = { item: "the item", supplier: "the supplier's delivery days", default: "the default (no lead time set)" } as const;
const crumbs = [{ label: "Stock", href: "/stock/levels" }, { label: "Reorder" }];

/** Stock → Reorder: when each item needs ordering again and how many, from its sales and lead time. */
export default function StockReorderPage() {
  const [d, setD] = useState<{ items: ItemLevels[]; settings: StockSettings } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<{ items: ItemLevels[]; settings: StockSettings }>("/api/stock/levels").then(setD).catch((e: Error) => setError(e.message)); }, []);
  const rows = (d?.items ?? []).filter((r) => r.item.status === "active");
  if (error) return <div className="space-y-4"><PageHeader title="Reorder" crumbs={crumbs} /><ErrorState title="Couldn't load the reorder list" message={error} /></div>;
  if (!d) return <div className="space-y-4"><PageHeader title="Reorder" crumbs={crumbs} /><Skeleton className="h-48 rounded-xl" /></div>;
  const S = d.settings;
  const due = rows.filter((r) => r.reorder.status === "due").length;
  const soon = rows.filter((r) => r.reorder.status === "soon").length;
  const columns: DataColumn<ItemLevels>[] = [
    { id: "item", header: "Item", mobile: "title", sortValue: (r) => r.item.name, cell: (r) => <div className="min-w-0"><Link href={`/stock/levels?item=${r.item.id}`} className="font-medium hover:underline">{r.item.name}</Link><div className="num text-xs text-muted-foreground">{r.item.sku}</div></div> },
    { id: "total", header: "In stock", numeric: true, mobile: 2, sortValue: (r) => r.total, cell: (r) => r.total },
    { id: "demand", header: "Sold / day", numeric: true, sortValue: (r) => r.reorder.perDay, cell: (r) => (r.reorder.perDay ? r.reorder.perDay.toFixed(2) : "—") },
    { id: "cover", header: "Days of cover", numeric: true, sortValue: (r) => r.cover.total, cell: (r) => (r.cover.total == null ? "—" : r.cover.total === 0 ? <span className="text-danger">0</span> : Math.round(r.cover.total)) },
    { id: "lead", header: "Lead time", numeric: true, sortValue: (r) => r.reorder.leadTimeDays, cell: (r) => <span title={`From ${LEAD_FROM[r.reorder.leadFrom]}`}>{r.reorder.leadTimeDays} d<span className="block text-xs text-muted-foreground">{r.reorder.leadFrom}</span></span> },
    { id: "point", header: "Reorder point", numeric: true, sortValue: (r) => r.reorder.reorderPoint, cell: (r) => (r.reorder.perDay ? r.reorder.reorderPoint : "—") },
    { id: "qty", header: "Suggested qty", numeric: true, mobile: 3, sortValue: (r) => r.reorder.suggestedQty, cell: (r) => <span className="font-semibold">{r.reorder.perDay ? r.reorder.suggestedQty : "—"}</span> },
    {
      id: "status", header: "Status", mobile: 1, sortValue: (r) => STATUS_RANK[r.reorder.status],
      cell: (r) => (
        <span>
          <StatusChip tone={STATUS_CHIP[r.reorder.status].tone}>{STATUS_CHIP[r.reorder.status].label}</StatusChip>
          {r.reorder.status === "soon" && r.reorder.daysToReorder != null && <span className="block text-xs text-muted-foreground">in {Math.ceil(r.reorder.daysToReorder)} days</span>}
        </span>
      ),
    },
    { id: "supplier", header: "Supplier", sortValue: (r) => r.item.supplier_name, cell: (r) => <span className="text-meta text-muted-foreground">{r.item.supplier_name ?? "—"}</span> },
    {
      id: "action", header: "", className: "text-right",
      cell: (r) => {
        const R = r.reorder;
        const href = `/stock/purchases?new=stock&item=${r.item.id}&qty=${R.suggestedQty}${r.item.supplier_id ? `&supplier=${r.item.supplier_id}` : ""}`;
        return R.perDay > 0 && <Button size="sm" variant={R.status === "due" ? "secondary" : "ghost"} asChild><Link href={href}><ShoppingCartIcon /> Create purchase</Link></Button>;
      },
    },
  ];
  return (
    <div className="space-y-4">
      <PageHeader
        title="Reorder"
        crumbs={crumbs}
        subtitle={rows.length ? `${due} due · ${soon} soon · ${rows.length} active item${rows.length === 1 ? "" : "s"}` : undefined}
        info={<>
          <p>From the last 30 days&apos; sales (Amazon&apos;s orders plus the sales recorded here): the <b>reorder point</b> is (lead time + {S.leadBufferDays} days&apos; buffer) × units a day, and the <b>suggested quantity</b> {S.coverTargetDays} days of sales (Settings → Stock).</p>
          <p><b>Due</b> at or under the point, <b>soon</b> within a week of it. Lead time: the item&apos;s, else its supplier&apos;s delivery days, else 14.</p>
        </>}
      />
      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(r) => r.item.id}
        storageKey="stock.reorder"
        caption="Reorder list"
        initialSort={{ id: "status" }}
        empty={{ icon: <PackageIcon />, title: "No active items", description: "Import or add stock items first.", action: <Button asChild variant="secondary"><Link href="/stock/import">Import</Link></Button> }}
      />
    </div>
  );
}
