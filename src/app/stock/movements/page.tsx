"use client";

import { DownloadIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { usePageCrumbs } from "@/components/Crumbs";
import { SortTh, useSortable } from "@/components/SortableTable";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { BUCKET_LABEL, BUCKETS, KIND_LABEL, MOVEMENT_KINDS, type Bucket, type MovementKind } from "@/lib/stock/levels";
import { OrderLink } from "@/components/stock/orderBits";
import { trackingText } from "@/lib/stock/orders";
import { api } from "@/lib/ui/client";
import { cn } from "@/lib/utils";

interface Row {
  id: string; item_id: string; bucket: Bucket; quantity: number; kind: MovementKind; date: string; reason: string | null; unit_cost: number | null; note: string | null; created_at: string;
  order_id: string | null; order_url: string | null; tracking_carrier: string | null; tracking_number: string | null; currency: string | null; unit_cost_ccy: number | null;
  item: { sku: string; name: string } | null; supplier: { id: string; name: string } | null;
}

/** Stock → Movements: the ledger every level is the sum of, filtered and exported as CSV. */
export default function StockMovementsPage() {
  usePageCrumbs([{ label: "Stock", href: "/stock/levels" }, { label: "Movements" }]);
  const [f, setF] = useState(() => ({ item: typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("item") ?? "", bucket: "", kind: "", from: "", to: "" }));
  const [rows, setRows] = useState<Row[] | null>(null);
  const [items, setItems] = useState<{ id: string; sku: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const query = useMemo(() => new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString(), [f]);
  useEffect(() => { api<{ items: { item: { id: string; sku: string; name: string } }[] }>("/api/stock/levels").then((r) => setItems(r.items.map((i) => i.item))).catch(() => {}); }, []);
  useEffect(() => { api<{ movements: Row[] }>(`/api/stock/movements?${query}`).then((r) => setRows(r.movements)).catch((e: Error) => setError(e.message)); }, [query]);
  const s = useSortable("stock.movements", rows ?? [], {
    date: { value: (r) => r.date, kind: "date" }, item: { value: (r) => r.item?.sku ?? "" }, bucket: { value: (r) => BUCKET_LABEL[r.bucket] }, kind: { value: (r) => KIND_LABEL[r.kind] },
    quantity: { value: (r) => r.quantity, kind: "number" }, reason: { value: (r) => r.reason }, order: { value: (r) => r.order_id ?? (r.order_url ? "order" : null) }, supplier: { value: (r) => r.supplier?.name ?? null }, unitCost: { value: (r) => r.unit_cost, kind: "number" }, note: { value: (r) => r.note },
  }, { key: "date", dir: "desc" });
  if (error) return <ErrorState title="Couldn't load the movements" message={error} />;
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  return (
    <div className="space-y-4">
      <div className="max-w-3xl">
        <h1 className="page-title">Movements</h1>
        <p className="text-sm text-muted-foreground">Every receipt, sale, return, adjustment and transfer, signed into or out of its bucket. The levels are their sums. Amazon FBA follows SP-API, so FBA has no movements here.</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1"><span className="field-label">Item</span>
          <NativeSelect value={f.item} onChange={(e) => set({ item: e.target.value })} className="max-w-xs">
            <NativeSelectOption value="">All items</NativeSelectOption>
            {items.map((i) => <NativeSelectOption key={i.id} value={i.id}>{i.sku} · {i.name.slice(0, 40)}</NativeSelectOption>)}
          </NativeSelect></label>
        <label className="space-y-1"><span className="field-label">Bucket</span>
          <NativeSelect value={f.bucket} onChange={(e) => set({ bucket: e.target.value })}>
            <NativeSelectOption value="">All</NativeSelectOption>
            {BUCKETS.map((b) => <NativeSelectOption key={b} value={b}>{BUCKET_LABEL[b]}</NativeSelectOption>)}
          </NativeSelect></label>
        <label className="space-y-1"><span className="field-label">Kind</span>
          <NativeSelect value={f.kind} onChange={(e) => set({ kind: e.target.value })}>
            <NativeSelectOption value="">All</NativeSelectOption>
            {MOVEMENT_KINDS.map((k) => <NativeSelectOption key={k} value={k}>{KIND_LABEL[k]}</NativeSelectOption>)}
          </NativeSelect></label>
        <label className="space-y-1"><span className="field-label">From</span><Input type="date" className="h-9 w-auto" value={f.from} onChange={(e) => set({ from: e.target.value })} /></label>
        <label className="space-y-1"><span className="field-label">To</span><Input type="date" className="h-9 w-auto" value={f.to} onChange={(e) => set({ to: e.target.value })} /></label>
        <Button variant="outline" asChild className="ml-auto"><a href={`/api/stock/movements?${query}${query ? "&" : ""}format=csv`}><DownloadIcon /> Export CSV</a></Button>
      </div>
      {!rows ? <Skeleton className="h-48 rounded-lg" /> : !rows.length ? <p className="text-sm text-muted-foreground">No movements match.</p> : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-[11px] tracking-wide text-muted-foreground uppercase">
              <SortTh {...s.th("date")} className="px-2 py-1.5">Date</SortTh>
              <SortTh {...s.th("item")} className="px-2 py-1.5">Item</SortTh>
              <SortTh {...s.th("bucket")} className="px-2 py-1.5">Bucket</SortTh>
              <SortTh {...s.th("kind")} className="px-2 py-1.5">Kind</SortTh>
              <SortTh {...s.th("quantity")} numeric className="px-2 py-1.5 text-right">Quantity</SortTh>
              <SortTh {...s.th("reason")} className="px-2 py-1.5">Reason</SortTh>
              <SortTh {...s.th("unitCost")} numeric className="px-2 py-1.5 text-right">Unit cost</SortTh>
              <SortTh {...s.th("order")} className="px-2 py-1.5">Order</SortTh>
              <SortTh {...s.th("supplier")} className="px-2 py-1.5">Supplier</SortTh>
              <SortTh {...s.th("note")} className="px-2 py-1.5">Note</SortTh>
            </tr></thead>
            <tbody>{s.rows.map((r) => (
              <tr key={r.id} className="border-b last:border-b-0">
                <td className="px-2 py-1.5 whitespace-nowrap">{r.date}</td>
                <td className="px-2 py-1.5"><span className="num">{r.item?.sku}</span> <span className="text-xs text-muted-foreground">{r.item?.name.slice(0, 50)}</span></td>
                <td className="px-2 py-1.5">{BUCKET_LABEL[r.bucket]}</td>
                <td className="px-2 py-1.5">{KIND_LABEL[r.kind]}</td>
                <td className={cn("num px-2 py-1.5 text-right font-medium", r.quantity > 0 ? "text-pass" : "text-fail")}>{r.quantity > 0 ? `+${r.quantity}` : r.quantity}</td>
                <td className="px-2 py-1.5 text-xs">{r.reason ?? "—"}</td>
                <td className="num px-2 py-1.5 text-right">{r.unit_cost != null ? `£${Number(r.unit_cost).toFixed(2)}` : "—"}{r.currency && r.unit_cost_ccy != null && <span className="block text-2xs text-muted-foreground">{r.currency} {Number(r.unit_cost_ccy).toFixed(2)}</span>}</td>
                <td className="px-2 py-1.5 text-xs"><OrderLink id={r.order_id} url={r.order_url} />{trackingText(r.tracking_carrier, r.tracking_number) && <span className="block text-2xs text-muted-foreground">{trackingText(r.tracking_carrier, r.tracking_number)}</span>}</td>
                <td className="px-2 py-1.5 text-xs">{r.supplier ? <a className="hover:underline" href={`/suppliers/${r.supplier.id}`}>{r.supplier.name}</a> : ""}</td>
                <td className="px-2 py-1.5 text-xs text-muted-foreground">{r.note ?? ""}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
