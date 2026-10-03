"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { useDialogs } from "@/components/Dialogs";
import { useCallback, useEffect, useState } from "react";
import { usePageCrumbs } from "@/components/Crumbs";
import { SortTh, useSortable } from "@/components/SortableTable";
import { EmptyState, ErrorState } from "@/components/States";
import { ActionDialog } from "@/components/stock/actions";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import type { ItemLevels } from "@/lib/server/stock";
import { SALE_CHANNELS } from "@/lib/stock/levels";
import { api } from "@/lib/ui/client";

interface Row {
  id: string; date: string; channel: string; order_id: string | null; quantity: number; price_each: number; returned_quantity: number;
  cost_snapshot: { cost_each?: number | null; profit_each?: number | null }; item: { sku: string; name: string } | null; listing: { marketplace: string } | null;
}
const gbp = (v: number | null | undefined) => (v == null ? "—" : `£${Number(v).toFixed(2)}`);

/** Stock → Sales: sales outside Amazon, each with its cost and profit at the moment it was recorded. */
export default function StockSalesPage() {
  usePageCrumbs([{ label: "Stock", href: "/stock/levels" }, { label: "Sales" }]);
  const [channel, setChannel] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [items, setItems] = useState<ItemLevels[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const { confirm } = useDialogs();
  const load = useCallback(() => {
    api<{ sales: Row[] }>(`/api/stock/sales${channel ? `?channel=${encodeURIComponent(channel)}` : ""}`).then((r) => setRows(r.sales)).catch((e: Error) => setError(e.message));
    api<{ items: ItemLevels[] }>("/api/stock/levels").then((r) => setItems(r.items)).catch(() => {});
  }, [channel]);
  useEffect(() => { load(); }, [load]);
  const s = useSortable("stock.sales", rows ?? [], {
    date: { value: (r) => r.date, kind: "date" }, item: { value: (r) => r.item?.sku ?? "" }, channel: { value: (r) => r.channel }, listing: { value: (r) => r.listing?.marketplace },
    order: { value: (r) => r.order_id }, quantity: { value: (r) => r.quantity, kind: "number" }, price: { value: (r) => r.price_each, kind: "number" },
    cost: { value: (r) => r.cost_snapshot?.cost_each ?? null, kind: "number" }, profit: { value: (r) => r.cost_snapshot?.profit_each ?? null, kind: "number" }, returned: { value: (r) => r.returned_quantity, kind: "number" },
  }, { key: "date", dir: "desc" });
  const remove = async (r: Row) => {
    if (!(await confirm({ title: `Delete this sale?`, description: `${r.quantity} × ${r.item?.sku ?? "item"} on ${r.channel}, ${r.date}. Its stock movement${r.returned_quantity ? " and its returns" : ""} go with it, so the units are back in the bucket. The audit log keeps a copy.`, confirmLabel: "Delete sale", destructive: true }))) return;
    try {
      await api(`/api/stock/sales/${r.id}`, { method: "DELETE" });
      toast.success("Sale deleted, with its movement");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  if (error) return <ErrorState title="Couldn't load the sales" message={error} />;
  const total = (rows ?? []).reduce((a, r) => ({ units: a.units + r.quantity - r.returned_quantity, revenue: a.revenue + r.price_each * (r.quantity - r.returned_quantity), profit: a.profit + (r.cost_snapshot?.profit_each ?? 0) * (r.quantity - r.returned_quantity) }), { units: 0, revenue: 0, profit: 0 });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-3xl">
          <h1 className="page-title">Sales</h1>
          <p className="text-sm text-muted-foreground">Sales outside Amazon: eBay, TikTok Shop, your website, in person. Amazon&apos;s sales come from the orders sync (Tracker), not typed here. Recording a sale checks the bucket holds it, takes it off, and keeps its cost at that moment: unit + packaging + the listing&apos;s fee % of the price.</p>
        </div>
        <Button onClick={() => setRecording(true)} disabled={!items.length}><PlusIcon /> Record sale</Button>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1"><span className="field-label">Channel</span>
          <NativeSelect value={channel} onChange={(e) => setChannel(e.target.value)}>
            <NativeSelectOption value="">All channels</NativeSelectOption>
            {SALE_CHANNELS.map((c) => <NativeSelectOption key={c} value={c}>{c}</NativeSelectOption>)}
          </NativeSelect></label>
        {rows && rows.length > 0 && <span className="pb-2 text-sm text-muted-foreground">{total.units} units net of returns · {gbp(total.revenue)} sales · {gbp(total.profit)} profit</span>}
      </div>
      {!rows ? <Skeleton className="h-48 rounded-lg" /> : !rows.length ? <EmptyState title="No sales recorded">Record one here or from an item on Levels.</EmptyState> : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-[11px] tracking-wide text-muted-foreground uppercase">
              <SortTh {...s.th("date")} className="px-2 py-1.5">Date</SortTh>
              <SortTh {...s.th("item")} className="px-2 py-1.5">Item</SortTh>
              <SortTh {...s.th("channel")} className="px-2 py-1.5">Channel</SortTh>
              <SortTh {...s.th("listing")} className="px-2 py-1.5">Listing</SortTh>
              <SortTh {...s.th("order")} className="px-2 py-1.5">Order</SortTh>
              <SortTh {...s.th("quantity")} numeric className="px-2 py-1.5 text-right">Qty</SortTh>
              <SortTh {...s.th("price")} numeric className="px-2 py-1.5 text-right">Price each</SortTh>
              <SortTh {...s.th("cost")} numeric className="px-2 py-1.5 text-right">Cost each</SortTh>
              <SortTh {...s.th("profit")} numeric className="px-2 py-1.5 text-right">Profit each</SortTh>
              <SortTh {...s.th("returned")} numeric className="px-2 py-1.5 text-right">Returned</SortTh>
              <th className="px-2 py-1.5" />
            </tr></thead>
            <tbody>{s.rows.map((r) => (
              <tr key={r.id} className="border-b last:border-b-0">
                <td className="px-2 py-1.5 whitespace-nowrap">{r.date}</td>
                <td className="px-2 py-1.5"><span className="num">{r.item?.sku}</span> <span className="text-xs text-muted-foreground">{r.item?.name.slice(0, 40)}</span></td>
                <td className="px-2 py-1.5">{r.channel}</td>
                <td className="px-2 py-1.5 text-xs">{r.listing?.marketplace ?? "—"}</td>
                <td className="px-2 py-1.5 text-xs">{r.order_id ?? "—"}</td>
                <td className="num px-2 py-1.5 text-right">{r.quantity}</td>
                <td className="num px-2 py-1.5 text-right">{gbp(r.price_each)}</td>
                <td className="num px-2 py-1.5 text-right">{gbp(r.cost_snapshot?.cost_each)}</td>
                <td className="num px-2 py-1.5 text-right">{gbp(r.cost_snapshot?.profit_each)}</td>
                <td className="num px-2 py-1.5 text-right">{r.returned_quantity || "—"}</td>
                <td className="px-2 py-1.5 text-right"><button type="button" aria-label="Delete sale" title="Delete sale" onClick={() => remove(r)}><Trash2Icon className="size-3.5 text-muted-foreground hover:text-fail" /></button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {recording && <ActionDialog action="sale" item={null} items={items} onClose={() => setRecording(false)} onDone={load} />}
    </div>
  );
}
