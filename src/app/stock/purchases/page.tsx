"use client";

import Link from "next/link";
import { VatTag } from "@/components/VatTag";
import { useEffect, useMemo, useState } from "react";
import { ProductThumb } from "@/components/ProductThumb";
import { ErrorState } from "@/components/States";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { Kpi } from "@/components/ui/kpi";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Actuals } from "@/lib/actuals";
import type { Purchase } from "@/lib/server/purchases";
import { PURCHASE_STATUSES, type PurchaseStatus } from "@/lib/tracker";
import { api, gbp } from "@/lib/ui/client";
import { cn } from "@/lib/utils";
import { PackageIcon } from "lucide-react";
import { SyncStatus } from "@/components/product/SyncStatus";
import { CalibrationPanel } from "@/components/product/CalibrationPanel";
import { RecordPurchaseDialog } from "@/components/product/RecordPurchaseDialog";
import { ReceiveDialog, StockPurchaseDialog } from "@/components/tracker/StockPurchase";
import { OrderDeleteButton, OrderEditButton, OrderEditDialog, OrderLine } from "@/components/tracker/OrderDetails";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

type Row = Purchase & { actuals?: Actuals | null };
/** A purchase's title and image: its stock item's, else (older rows) the catalogue product's. */
const purchaseTitle = (p: Purchase) => p.stock?.name ?? p.product?.title ?? p.asin ?? "—";
const purchaseImage = (p: Purchase) => p.stock?.image_url || p.product?.image_url || null;
const label = (s: PurchaseStatus) => PURCHASE_STATUSES.find((x) => x.id === s)?.label ?? s;

function pctOff(pred: number | null | undefined, act: number | null | undefined) {
  if (pred == null || act == null || pred === 0) return null;
  return Math.round(((act - pred) / Math.abs(pred)) * 100);
}

/**
 * Stock → Purchases (the old Tracker and Stock → Orders: the same purchase records): everything you've
 * bought, its status and order, money in, the prediction frozen at purchase and (once live) how it's going.
 */
export default function PurchasesPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState<"open" | "all">("open");
  const [nonce, setNonce] = useState(0);
  const [vatReg, setVatReg] = useState<boolean | null>(null);
  // From Stock → Reorder: ?new=stock&item=<id>&qty=<n>&supplier=<id> opens a prefilled purchase (also via the old /tracker).
  const [stockNew, setStockNew] = useState<{ item: string; qty: number | null; supplier: string | null } | null>(() => {
    if (typeof window === "undefined") return null;
    const q = new URLSearchParams(window.location.search);
    return q.get("new") === "stock" && q.get("item") ? { item: q.get("item")!, qty: Number(q.get("qty")) || null, supplier: q.get("supplier") || null } : null;
  });
  // From Today's "Add costs" step: ?edit=<purchase id> opens that purchase's edit dialog, its row marked.
  const [editId, setEditId] = useState<string | null>(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("edit")));
  const [receiving, setReceiving] = useState<Row | null>(null);
  const setStatus = async (p: Row, status: PurchaseStatus, bucket?: "home" | "tiktok_fbt" | null) => {
    if (status === "received" && bucket === undefined) { setReceiving(p); return; }
    try {
      const r = await api<{ stock: { created: boolean } | null }>(`/api/purchases/${p.id}`, { method: "PATCH", json: { status, ...(bucket ? { bucket } : {}) } });
      toast.success(r.stock?.created ? `${label(status)}: ${p.units} units into Stock` : label(status));
      setNonce((n) => n + 1);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  useEffect(() => { api<{ vatRegistered: boolean }>("/api/business").then((b) => setVatReg(b.vatRegistered)).catch(() => {}); }, []);
  useEffect(() => {
    api<{ purchases: Row[] }>("/api/purchases?actuals=1")
      .then((r) => setRows(r.purchases))
      .catch((e: Error) => setError(e.message));
  }, [nonce]);
  const filtered = useMemo(() => (rows ?? []).filter((p) => show === "all" || p.status !== "closed"), [rows, show]);
  const header = (
    <PageHeader
      title="Purchases"
      crumbs={[{ label: "Stock", href: "/stock/levels" }, { label: "Purchases" }]}
      subtitle="What you've bought, and the prediction against what happened."
      info={<>
        <p>Every purchase, one record each, whether recorded here, on a product page, from the Plan or from Stock → Reorder (this page was the Tracker and Stock → Orders).</p>
        <p>Set a purchase to <b>Received</b> to put its units into a Stock bucket, with its order number on the receipt. Profit / unit and Sales / mo show predicted (frozen when you bought) · actual (from Amazon&apos;s reports once the stock is live).</p>
      </>}
      actions={<>
        <SyncStatus onSynced={() => setNonce((n) => n + 1)} />
        <RecordPurchaseDialog variant="outline" />
        <Button onClick={() => setStockNew({ item: "", qty: null, supplier: null })}>Record a stock order</Button>
      </>}
    />
  );
  if (error) return <div className="space-y-6">{header}<ErrorState title="Couldn't load the purchases" message={error} /></div>;
  if (!rows) return <div className="space-y-6">{header}<Skeleton className="h-64 rounded-xl" /></div>;

  const open = rows.filter((p) => p.status !== "closed");
  const invested = open.reduce((s, p) => s + p.units * p.landed_gbp, 0);
  // A month at your share, but never more units than you hold.
  const predictedMonth = open.reduce((s, p) => s + (p.prediction.profitPerUnit ?? 0) * Math.min(p.prediction.sharePerMonth ?? 0, p.units), 0);
  const profitToDate = rows.reduce((s, p) => s + (p.actuals?.profitToDate ?? 0), 0);
  const counts = new Map<PurchaseStatus, number>();
  for (const p of open) counts.set(p.status, (counts.get(p.status) ?? 0) + 1);

  const reload = () => setNonce((n) => n + 1);
  const editing = editId ? rows.find((p) => p.id === editId) ?? null : null;
  const closeEdit = () => { setEditId(null); window.history.replaceState(null, "", "/stock/purchases"); };
  const columns: DataColumn<Row>[] = [
    {
      id: "product", header: "Product", mobile: "title", className: "min-w-72 max-w-96 whitespace-normal", sortValue: (p) => p.product?.title ?? p.stock?.name ?? p.asin,
      cell: (p) => (
        <div className="flex gap-2.5">
          <ProductThumb url={purchaseImage(p)} asin={p.asin} title={purchaseTitle(p)} brand={p.stock?.brand ?? p.product?.brand ?? null} size={36} />
          <div className="min-w-0">
            {p.asin && p.product
              ? <Link className="line-clamp-2 text-sm hover:text-primary hover:underline" href={`/products/${p.asin}`}>{purchaseTitle(p)}</Link>
              : <Link className="line-clamp-2 text-sm hover:text-primary hover:underline" href={p.stock_item_id ? `/stock/levels?item=${p.stock_item_id}` : `/products/${p.asin}`}>{purchaseTitle(p)}</Link>}
            <p className="num text-xs text-muted-foreground">{p.asin ?? p.stock?.sku ?? "—"} · {p.supplier_name ?? "—"} · {p.ordered_on}{p.received_bucket ? ` · in Stock (${p.received_bucket === "home" ? "self-ship" : "TikTok FBT"})` : ""}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1"><OrderLine p={p} /><OrderEditButton p={p} onSaved={reload} /><OrderDeleteButton p={p} name={purchaseTitle(p)} onDeleted={reload} />{p.stock_item_id && <Link className="text-xs text-primary hover:underline" href={`/stock/levels?item=${p.stock_item_id}`}>Stock →</Link>}</div>
          </div>
        </div>
      ),
    },
    {
      // Status sorts in pipeline order.
      id: "status", header: "Status", mobile: 1, sortValue: (p) => PURCHASE_STATUSES.findIndex((x) => x.id === p.status),
      cell: (p) => (
        <NativeSelect className="h-8 w-36" value={p.status} onChange={(e) => setStatus(p, e.target.value as PurchaseStatus)} aria-label="Status">
          {PURCHASE_STATUSES.map((s) => <NativeSelectOption key={s.id} value={s.id}>{s.label}</NativeSelectOption>)}
        </NativeSelect>
      ),
    },
    { id: "units", header: "Units", numeric: true, mobile: 2, sortValue: (p) => p.units, cell: (p) => p.units },
    { id: "landed", header: "Landed", numeric: true, sortValue: (p) => p.landed_gbp, cell: (p) => gbp(p.landed_gbp) },
    // The predicted · actual columns sort by the actual figure.
    { id: "profit", header: "Profit / unit", numeric: true, sortValue: (p) => p.actuals?.profitPerUnit ?? null, cell: (p) => <span className="whitespace-nowrap">{gbp(p.prediction.profitPerUnit)} · {p.actuals ? gbp(p.actuals.profitPerUnit) : "—"}</span> },
    {
      id: "sales", header: "Sales / mo", numeric: true, sortValue: (p) => p.actuals?.unitsPerMonth ?? null,
      cell: (p) => {
        const salesOff = pctOff(p.prediction.sharePerMonth, p.actuals?.unitsPerMonth);
        return (
          <span className="whitespace-nowrap">
            {p.prediction.sharePerMonth ?? "—"} · {p.actuals?.unitsPerMonth ?? "—"}
            {salesOff != null && <span className={cn("ml-1 text-xs", Math.abs(salesOff) < 15 ? "text-muted-foreground" : salesOff > 0 ? "text-success" : "text-danger")}>{salesOff > 0 ? "+" : ""}{salesOff}%</span>}
          </span>
        );
      },
    },
    { id: "sold", header: "Sold", numeric: true, sortValue: (p) => p.actuals?.unitsSold ?? null, cell: (p) => <span className="whitespace-nowrap">{p.actuals ? `${p.actuals.unitsSold} / ${p.units}` : "—"}</span> },
    { id: "profitToDate", header: "Profit to date", numeric: true, mobile: 3, sortValue: (p) => p.actuals?.profitToDate ?? null, cell: (p) => (p.actuals ? gbp(p.actuals.profitToDate) : "—") },
  ];

  return (
    <div className="space-y-6">
      {header}
      {stockNew && <StockPurchaseDialog open itemId={stockNew.item || null} qty={stockNew.qty} supplierId={stockNew.supplier} onOpenChange={(o) => { if (!o) { setStockNew(null); window.history.replaceState(null, "", "/stock/purchases"); } }} onSaved={() => setNonce((n) => n + 1)} />}
      {editing && <OrderEditDialog p={editing} onClose={closeEdit} onSaved={reload} />}
      {receiving && <ReceiveDialog open units={receiving.units} onOpenChange={(o) => { if (!o) setReceiving(null); }} onReceive={(bucket) => { const p = receiving; setReceiving(null); setStatus(p, "received", bucket); }} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Money in stock" value={gbp(invested, 0)} hint={`${open.length} open purchase${open.length === 1 ? "" : "s"}, landed`} />
        <Kpi label={<>Predicted profit / month <VatTag registered={vatReg} /></>} value={gbp(predictedMonth, 0)} hint="next month at your share, up to the units held" />
        <Kpi label={<>Profit to date <VatTag registered={vatReg} /></>} value={gbp(profitToDate, 0)} hint="from Amazon's reports" />
        <Kpi label="Pipeline" value={open.length} hint={PURCHASE_STATUSES.filter((s) => counts.get(s.id)).map((s) => `${counts.get(s.id)} ${s.label.toLowerCase()}`).join(" · ") || "nothing open"} />
      </div>

      <CalibrationPanel nonce={nonce} />

      {rows.length > 0 && (
        <ToggleGroup type="single" variant="outline" size="sm" value={show} onValueChange={(v) => v && setShow(v as "open" | "all")}>
          <ToggleGroupItem value="open">Open</ToggleGroupItem>
          <ToggleGroupItem value="all">All, with closed</ToggleGroupItem>
        </ToggleGroup>
      )}
      <DataTable
        rows={filtered}
        columns={columns}
        getRowId={(p) => p.id}
        storageKey="stock.purchases"
        caption="Purchases"
        rowAttrs={(p) => ({ id: `purchase-${p.id}`, "data-verdict": p.actuals?.profitPerUnit != null ? (p.actuals.profitPerUnit > 0 ? "pass" : "fail") : "empty" })}
        rowClassName={(p) => (p.id === editId ? "bg-primary-soft/60" : undefined)}
        empty={rows.length === 0
          ? { icon: <PackageIcon />, title: "Nothing bought yet", description: "Record a purchase here, from a product's page or from the Plan; its prediction is frozen then.", action: <Button variant="secondary" onClick={() => setStockNew({ item: "", qty: null, supplier: null })}>Record a stock order</Button> }
          : { icon: <PackageIcon />, title: "Nothing open", description: "Every purchase is closed.", action: <Button variant="secondary" onClick={() => setShow("all")}>Show all, with closed</Button> }}
      />
    </div>
  );
}
