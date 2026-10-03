"use client";

import { TruckIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { usePageCrumbs } from "@/components/Crumbs";
import { ProductThumb } from "@/components/ProductThumb";
import { SortTh, useSortable } from "@/components/SortableTable";
import { EmptyState, ErrorState } from "@/components/States";
import { OrderLink } from "@/components/stock/orderBits";
import { OrderDeleteButton, OrderEditButton } from "@/components/tracker/OrderDetails";
import { ReceiveDialog, StockPurchaseDialog } from "@/components/tracker/StockPurchase";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Purchase } from "@/lib/server/purchases";
import { BUCKET_LABEL, type Bucket } from "@/lib/stock/levels";
import { trackingText } from "@/lib/stock/orders";
import { PURCHASE_STATUSES } from "@/lib/tracker";
import { api } from "@/lib/ui/client";
import { cn } from "@/lib/utils";

const gbp = (v: number | null | undefined) => (v == null ? "—" : `£${Number(v).toFixed(2)}`);
const statusLabel = (s: string) => PURCHASE_STATUSES.find((x) => x.id === s)?.label ?? s;
const STATUS_CLS: Record<string, string> = { ordered: "bg-warn-soft text-warn", received: "bg-pass-soft text-pass" };

/**
 * Stock → Orders: every purchase of a stock item (from Stock, the Tracker or a product page: the same
 * record), with its status, supplier, quantity, cost, order number and expected date. Receive puts an
 * open order into a bucket; Edit and Delete work as on the Tracker and the item's drawer.
 */
export default function StockOrdersPage() {
  usePageCrumbs([{ label: "Stock", href: "/stock/levels" }, { label: "Orders" }]);
  const [rows, setRows] = useState<Purchase[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState<"open" | "all">("open");
  const [receiving, setReceiving] = useState<Purchase | null>(null);
  const [ordering, setOrdering] = useState(false);
  const load = useCallback(() => { api<{ orders: Purchase[] }>("/api/stock/orders").then((r) => setRows(r.orders)).catch((e: Error) => setError(e.message)); }, []);
  useEffect(() => { load(); }, [load]);
  const shown = useMemo(() => (rows ?? []).filter((p) => show === "all" || p.status === "ordered"), [rows, show]);
  const s = useSortable("stock.orders", shown, {
    item: { value: (p) => p.stock?.name ?? p.product?.title ?? p.asin }, supplier: { value: (p) => p.supplier_name },
    status: { value: (p) => String(PURCHASE_STATUSES.findIndex((x) => x.id === p.status)).padStart(2, "0") }, units: { value: (p) => p.units, kind: "number" },
    cost: { value: (p) => p.landed_gbp, kind: "number" }, total: { value: (p) => p.units * p.landed_gbp, kind: "number" }, order: { value: (p) => p.order_id },
    ordered: { value: (p) => p.ordered_on, kind: "date" }, expected: { value: (p) => (p.status === "ordered" ? p.expected_date ?? null : null), kind: "date" },
  }, { key: "ordered", dir: "desc" });
  const receive = async (p: Purchase, bucket: "home" | "tiktok_fbt" | null) => {
    try {
      const r = await api<{ stock: { created: boolean } | null }>(`/api/purchases/${p.id}`, { method: "PATCH", json: { status: "received", ...(bucket ? { bucket } : {}) } });
      toast.success(r.stock?.created ? `${p.units} received into ${BUCKET_LABEL[bucket as Bucket]}` : "Marked received");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  if (error) return <ErrorState title="Couldn't load the orders" message={error} />;
  const open = (rows ?? []).filter((p) => p.status === "ordered");
  const onOrder = open.reduce((a, p) => a + p.units * p.landed_gbp, 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-3xl">
          <h1 className="page-title">Orders</h1>
          <p className="text-sm text-muted-foreground">Every purchase of a stock item, whether recorded here, on the Tracker or on a product page: one record each. When an order arrives, <b>Receive</b> puts its units into a bucket with its order number on the receipt.</p>
        </div>
        <Button onClick={() => setOrdering(true)}><TruckIcon /> Record a new order</Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup type="single" variant="outline" size="sm" value={show} onValueChange={(v) => v && setShow(v as "open" | "all")}>
          <ToggleGroupItem value="open">Open · {open.length}</ToggleGroupItem>
          <ToggleGroupItem value="all">All · {rows?.length ?? 0}</ToggleGroupItem>
        </ToggleGroup>
        {open.length > 0 && <span className="text-sm text-muted-foreground">{gbp(onOrder)} on order, landed</span>}
      </div>
      {!rows ? <Skeleton className="h-48 rounded-lg" /> : !shown.length ? (
        <EmptyState title={show === "open" ? "Nothing on order" : "No orders yet"}>Record a new order here or on Stock → Levels; a purchase recorded on a product page shows here too.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-[11px] tracking-wide text-muted-foreground uppercase">
              <SortTh {...s.th("item")} className="px-2 py-1.5">Item</SortTh>
              <SortTh {...s.th("supplier")} className="px-2 py-1.5">Supplier</SortTh>
              <SortTh {...s.th("status")} className="px-2 py-1.5" title="In pipeline order">Status</SortTh>
              <SortTh {...s.th("units")} numeric className="px-2 py-1.5 text-right">Qty</SortTh>
              <SortTh {...s.th("cost")} numeric className="px-2 py-1.5 text-right">Unit cost</SortTh>
              <SortTh {...s.th("total")} numeric className="px-2 py-1.5 text-right">Total</SortTh>
              <SortTh {...s.th("order")} className="px-2 py-1.5">Order</SortTh>
              <SortTh {...s.th("ordered")} className="px-2 py-1.5">Ordered</SortTh>
              <SortTh {...s.th("expected")} className="px-2 py-1.5">Expected</SortTh>
              <th className="px-2 py-1.5" />
            </tr></thead>
            <tbody>{s.rows.map((p) => (
              <tr key={p.id} className="border-b align-top last:border-b-0">
                <td className="px-2 py-1.5">
                  <div className="flex gap-2">
                    <ProductThumb url={p.stock?.image_url || p.product?.image_url || null} asin={p.asin} title={p.stock?.name ?? p.product?.title ?? p.asin ?? "—"} brand={p.stock?.brand ?? p.product?.brand ?? null} size={32} />
                    <div className="min-w-0">
                      <Link className="line-clamp-2 hover:text-brand hover:underline" href={`/stock/levels?item=${p.stock_item_id}`}>{p.stock?.name ?? p.product?.title ?? p.asin}</Link>
                      <p className="num text-2xs text-muted-foreground">{p.stock?.sku}{p.asin ? <> · <Link className="hover:underline" href={`/products/${p.asin}`}>{p.asin}</Link></> : null}</p>
                    </div>
                  </div>
                </td>
                <td className="px-2 py-1.5 text-xs">{p.supplier_id ? <Link className="hover:underline" href={`/suppliers/${p.supplier_id}`}>{p.supplier_name}</Link> : p.supplier_name ?? "—"}</td>
                <td className="px-2 py-1.5"><span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_CLS[p.status] ?? "bg-surface-2 text-ink-2")}>{statusLabel(p.status)}</span>
                  {p.received_bucket && <span className="block text-2xs text-muted-foreground">into {BUCKET_LABEL[p.received_bucket as Bucket]}</span>}</td>
                <td className="num px-2 py-1.5 text-right">{p.units}</td>
                <td className="num px-2 py-1.5 text-right">{gbp(p.landed_gbp)}{p.currency && p.currency !== "GBP" && p.unit_cost_ccy != null && <span className="block text-2xs text-muted-foreground">{p.currency} {Number(p.unit_cost_ccy).toFixed(2)}</span>}</td>
                <td className="num px-2 py-1.5 text-right">{gbp(p.units * p.landed_gbp)}</td>
                <td className="px-2 py-1.5 text-xs"><OrderLink id={p.order_id} url={p.order_url} />{trackingText(p.tracking_carrier, p.tracking_number) && <span className="block text-2xs text-muted-foreground">{trackingText(p.tracking_carrier, p.tracking_number)}</span>}</td>
                <td className="num px-2 py-1.5 text-xs whitespace-nowrap">{p.ordered_on}</td>
                <td className="num px-2 py-1.5 text-xs whitespace-nowrap">{p.status === "ordered" ? p.expected_date ?? "—" : ""}</td>
                <td className="px-2 py-1.5 text-right whitespace-nowrap">
                  {p.status === "ordered" && <Button size="xs" variant="outline" onClick={() => setReceiving(p)}>Receive</Button>}
                  <OrderEditButton p={p} onSaved={load} />
                  <OrderDeleteButton p={p} onDeleted={load} />
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {receiving && <ReceiveDialog open units={receiving.units} onOpenChange={(o) => { if (!o) setReceiving(null); }} onReceive={(bucket) => { const p = receiving; setReceiving(null); receive(p, bucket); }} />}
      {ordering && <StockPurchaseDialog open onOpenChange={(o) => { if (!o) setOrdering(false); }} onSaved={load} />}
    </div>
  );
}
