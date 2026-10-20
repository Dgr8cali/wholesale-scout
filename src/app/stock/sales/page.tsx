"use client";

import { PlusIcon, ReceiptIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { useDialogs } from "@/components/Dialogs";
import { useCallback, useEffect, useState } from "react";
import { ErrorState } from "@/components/States";
import { ActionDialog } from "@/components/stock/actions";
import { Button } from "@/components/ui/button";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
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
  const remove = async (r: Row) => {
    if (!(await confirm({ title: `Delete the sale of ${r.quantity} × ${r.item?.sku ?? "item"}?`, description: `${r.quantity} × ${r.item?.sku ?? "item"} on ${r.channel}, ${r.date}. Its stock movement${r.returned_quantity ? " and its returns" : ""} go with it, so the units are back in the bucket. The audit log keeps a copy.`, confirmLabel: "Delete sale", destructive: true }))) return;
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
  const columns: DataColumn<Row>[] = [
    { id: "date", header: "Date", mobile: 1, sortValue: (r) => r.date, cell: (r) => <span className="num whitespace-nowrap">{r.date}</span> },
    { id: "item", header: "Item", mobile: "title", sortValue: (r) => r.item?.sku ?? "", cell: (r) => <span><span className="num">{r.item?.sku}</span> <span className="text-xs text-muted-foreground">{r.item?.name.slice(0, 40)}</span></span> },
    { id: "channel", header: "Channel", mobile: 2, sortValue: (r) => r.channel, cell: (r) => r.channel },
    { id: "listing", header: "Listing", sortValue: (r) => r.listing?.marketplace, cell: (r) => <span className="text-meta">{r.listing?.marketplace ?? "—"}</span> },
    { id: "order", header: "Order", sortValue: (r) => r.order_id, cell: (r) => <span className="text-meta">{r.order_id ?? "—"}</span> },
    { id: "quantity", header: "Qty", numeric: true, mobile: 3, sortValue: (r) => r.quantity, cell: (r) => r.quantity },
    { id: "price", header: "Price each", numeric: true, sortValue: (r) => r.price_each, cell: (r) => gbp(r.price_each) },
    { id: "cost", header: "Cost each", numeric: true, sortValue: (r) => r.cost_snapshot?.cost_each ?? null, cell: (r) => gbp(r.cost_snapshot?.cost_each) },
    { id: "profit", header: "Profit each", numeric: true, sortValue: (r) => r.cost_snapshot?.profit_each ?? null, cell: (r) => gbp(r.cost_snapshot?.profit_each) },
    { id: "returned", header: "Returned", numeric: true, sortValue: (r) => r.returned_quantity, cell: (r) => r.returned_quantity || "—" },
    { id: "actions", header: "", className: "text-right", cell: (r) => <Button size="sm" variant="danger" onClick={() => remove(r)} aria-label={`Delete sale of ${r.item?.sku ?? "item"}`}><Trash2Icon /> Delete</Button> },
  ];
  return (
    <div className="space-y-4">
      <PageHeader
        title="Sales"
        crumbs={[{ label: "Stock", href: "/stock/levels" }, { label: "Sales" }]}
        subtitle="Sales outside Amazon: eBay, TikTok Shop, your website, in person."
        info={<>
          <p>Amazon&apos;s sales come from the orders sync, not typed here.</p>
          <p>Recording a sale checks the bucket holds it, takes it off, and keeps its cost at that moment: unit + packaging + the listing&apos;s fee % of the price.</p>
        </>}
        actions={<Button onClick={() => setRecording(true)} disabled={!items.length}><PlusIcon /> Record sale</Button>}
      />
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1"><span className="field-label">Channel</span>
          <NativeSelect value={channel} onChange={(e) => setChannel(e.target.value)}>
            <NativeSelectOption value="">All channels</NativeSelectOption>
            {SALE_CHANNELS.map((c) => <NativeSelectOption key={c} value={c}>{c}</NativeSelectOption>)}
          </NativeSelect></label>
        {rows && rows.length > 0 && <span className="num pb-2 text-meta text-muted-foreground">{total.units} units net of returns · {gbp(total.revenue)} sales · {gbp(total.profit)} profit</span>}
      </div>
      {!rows ? <Skeleton className="h-48 rounded-xl" /> : (
        <DataTable
          rows={rows}
          columns={columns}
          getRowId={(r) => r.id}
          storageKey="stock.sales"
          caption="Sales"
          initialSort={{ id: "date", desc: true }}
          empty={{ icon: <ReceiptIcon />, title: "No sales recorded", description: "Record one here or from an item on Levels.", action: <Button variant="secondary" onClick={() => setRecording(true)} disabled={!items.length}><PlusIcon /> Record sale</Button> }}
        />
      )}
      {recording && <ActionDialog action="sale" item={null} items={items} onClose={() => setRecording(false)} onDone={load} />}
    </div>
  );
}
