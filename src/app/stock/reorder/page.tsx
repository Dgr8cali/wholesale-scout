"use client";

import { ShoppingCartIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePageCrumbs } from "@/components/Crumbs";
import { SortTh, useSortable } from "@/components/SortableTable";
import { EmptyState, ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ItemLevels, StockSettings } from "@/lib/server/stock";
import { api } from "@/lib/ui/client";
import { cn } from "@/lib/utils";

const STATUS_CLS = { due: "bg-fail-soft text-fail", soon: "bg-warn-soft text-warn", ok: "bg-pass-soft text-pass", "no demand": "bg-empty-soft text-ink-2" } as const;
const STATUS_RANK = { due: 0, soon: 1, ok: 2, "no demand": 3 } as const;
const LEAD_FROM = { item: "the item", supplier: "the supplier's delivery days", default: "the default (no lead time set)" } as const;

/** Stock → Reorder: when each item needs ordering again and how many, from its sales and lead time. */
export default function StockReorderPage() {
  usePageCrumbs([{ label: "Stock", href: "/stock/levels" }, { label: "Reorder" }]);
  const [d, setD] = useState<{ items: ItemLevels[]; settings: StockSettings } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<{ items: ItemLevels[]; settings: StockSettings }>("/api/stock/levels").then(setD).catch((e: Error) => setError(e.message)); }, []);
  const rows = (d?.items ?? []).filter((r) => r.item.status === "active");
  const s = useSortable("stock.reorder", rows, {
    item: { value: (r) => r.item.name }, total: { value: (r) => r.total, kind: "number" }, demand: { value: (r) => r.reorder.perDay, kind: "number" },
    cover: { value: (r) => r.cover.total, kind: "number" }, lead: { value: (r) => r.reorder.leadTimeDays, kind: "number" }, point: { value: (r) => r.reorder.reorderPoint, kind: "number" },
    qty: { value: (r) => r.reorder.suggestedQty, kind: "number" }, status: { value: (r) => STATUS_RANK[r.reorder.status], kind: "number" }, supplier: { value: (r) => r.item.supplier_name },
  }, { key: "status", dir: "asc" });
  if (error) return <ErrorState title="Couldn't load the reorder list" message={error} />;
  if (!d) return <Skeleton className="h-48 rounded-lg" />;
  const S = d.settings;
  return (
    <div className="space-y-4">
      <div className="max-w-3xl">
        <h1 className="page-title">Reorder</h1>
        <p className="text-sm text-muted-foreground">
          From the last 30 days&apos; sales (Amazon&apos;s orders plus the sales recorded here): the <b>reorder point</b> is (lead time + {S.leadBufferDays} days&apos; buffer) × units a day, and the <b>suggested quantity</b> {S.coverTargetDays} days of sales (Settings → Stock). <b>Due</b> at or under the point, <b>soon</b> within a week of it. Lead time: the item&apos;s, else its supplier&apos;s delivery days, else 14.
        </p>
      </div>
      {!rows.length ? <EmptyState title="No active items">Import or add stock items first.</EmptyState> : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-[11px] tracking-wide text-muted-foreground uppercase">
              <SortTh {...s.th("item")} className="px-2 py-1.5">Item</SortTh>
              <SortTh {...s.th("total")} numeric className="px-2 py-1.5 text-right">In stock</SortTh>
              <SortTh {...s.th("demand")} numeric className="px-2 py-1.5 text-right">Sold / day</SortTh>
              <SortTh {...s.th("cover")} numeric className="px-2 py-1.5 text-right">Days of cover</SortTh>
              <SortTh {...s.th("lead")} numeric className="px-2 py-1.5 text-right">Lead time</SortTh>
              <SortTh {...s.th("point")} numeric className="px-2 py-1.5 text-right">Reorder point</SortTh>
              <SortTh {...s.th("qty")} numeric className="px-2 py-1.5 text-right">Suggested qty</SortTh>
              <SortTh {...s.th("status")} className="px-2 py-1.5">Status</SortTh>
              <SortTh {...s.th("supplier")} className="px-2 py-1.5">Supplier</SortTh>
              <th />
            </tr></thead>
            <tbody>{s.rows.map((r) => {
              const R = r.reorder;
              const href = `/tracker?new=stock&item=${r.item.id}&qty=${R.suggestedQty}${r.item.supplier_id ? `&supplier=${r.item.supplier_id}` : ""}`;
              return (
                <tr key={r.item.id} className="border-b last:border-b-0">
                  <td className="px-2 py-1.5"><Link href={`/stock/levels?item=${r.item.id}`} className="font-medium hover:underline">{r.item.name}</Link><div className="num text-xs text-muted-foreground">{r.item.sku}</div></td>
                  <td className="num px-2 py-1.5 text-right">{r.total}</td>
                  <td className="num px-2 py-1.5 text-right">{R.perDay ? R.perDay.toFixed(2) : "—"}</td>
                  <td className="num px-2 py-1.5 text-right">{r.cover.total == null ? "—" : r.cover.total === 0 ? <span className="text-fail">0</span> : Math.round(r.cover.total)}</td>
                  <td className="num px-2 py-1.5 text-right" title={`From ${LEAD_FROM[R.leadFrom]}`}>{R.leadTimeDays} d<span className="block text-[10.5px] text-muted-foreground">{R.leadFrom}</span></td>
                  <td className="num px-2 py-1.5 text-right">{R.perDay ? R.reorderPoint : "—"}</td>
                  <td className="num px-2 py-1.5 text-right font-semibold">{R.perDay ? R.suggestedQty : "—"}</td>
                  <td className="px-2 py-1.5"><span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_CLS[R.status])}>{R.status}</span>
                    {R.status === "soon" && R.daysToReorder != null && <span className="block text-[10.5px] text-muted-foreground">in {Math.ceil(R.daysToReorder)} days</span>}</td>
                  <td className="px-2 py-1.5 text-xs text-muted-foreground">{r.item.supplier_name ?? "—"}</td>
                  <td className="px-2 py-1.5 text-right">{R.perDay > 0 && <Button size="xs" variant={R.status === "due" ? "default" : "outline"} asChild><Link href={href}><ShoppingCartIcon /> Create purchase</Link></Button>}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
