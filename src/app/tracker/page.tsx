"use client";

import Link from "next/link";
import { VatTag } from "@/components/VatTag";
import { useEffect, useMemo, useState } from "react";
import { usePageCrumbs } from "@/components/Crumbs";
import { ProductThumb } from "@/components/ProductThumb";
import { EmptyState, ErrorState } from "@/components/States";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SortTableHead, useSortable } from "@/components/SortableTable";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
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
import { OrderDeleteButton, OrderEditButton, OrderLine } from "@/components/tracker/OrderDetails";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Row = Purchase & { actuals?: Actuals | null };
/** A purchase's title and image: its stock item's, else (older rows) the catalogue product's. */
const purchaseTitle = (p: Purchase) => p.stock?.name ?? p.product?.title ?? p.asin ?? "—";
const purchaseImage = (p: Purchase) => p.stock?.image_url || p.product?.image_url || null;
const label = (s: PurchaseStatus) => PURCHASE_STATUSES.find((x) => x.id === s)?.label ?? s;

function Tile({ label, value, hint }: { label: React.ReactNode; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <Card size="sm"><CardContent>
      <p className="eyebrow">{label}</p>
      <p className="stat-value">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </CardContent></Card>
  );
}

function pctOff(pred: number | null | undefined, act: number | null | undefined) {
  if (pred == null || act == null || pred === 0) return null;
  return Math.round(((act - pred) / Math.abs(pred)) * 100);
}

/** Everything you've bought: status, money in, the prediction and (once live) how it's going. */
export default function TrackerPage() {
  usePageCrumbs([{ label: "Tracker" }]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState<"open" | "all">("open");
  const [nonce, setNonce] = useState(0);
  const [vatReg, setVatReg] = useState<boolean | null>(null);
  // From Stock → Reorder: ?new=stock&item=<id>&qty=<n>&supplier=<id> opens a prefilled purchase.
  const [stockNew, setStockNew] = useState<{ item: string; qty: number | null; supplier: string | null } | null>(() => {
    if (typeof window === "undefined") return null;
    const q = new URLSearchParams(window.location.search);
    return q.get("new") === "stock" && q.get("item") ? { item: q.get("item")!, qty: Number(q.get("qty")) || null, supplier: q.get("supplier") || null } : null;
  });
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
  // Status sorts in pipeline order; the predicted · actual columns by the actual figure.
  const sorting = useSortable("wholesale.tracker", filtered, {
    product: { value: (p) => p.product?.title ?? p.stock?.name ?? p.asin, kind: "text" },
    status: { value: (p) => `${String(PURCHASE_STATUSES.findIndex((x) => x.id === p.status)).padStart(2, "0")} ${p.status}`, kind: "text" },
    units: { value: (p) => p.units, kind: "number" },
    landed: { value: (p) => p.landed_gbp, kind: "number" },
    profit: { value: (p) => p.actuals?.profitPerUnit ?? null, kind: "number" },
    sales: { value: (p) => p.actuals?.unitsPerMonth ?? null, kind: "number" },
    sold: { value: (p) => p.actuals?.unitsSold ?? null, kind: "number" },
    profitToDate: { value: (p) => p.actuals?.profitToDate ?? null, kind: "number" },
  });
  const shown = sorting.rows;

  if (error) return <ErrorState title="Couldn't load the tracker" message={error} />;
  if (!rows) return <Skeleton className="h-64" />;

  const open = rows.filter((p) => p.status !== "closed");
  const invested = open.reduce((s, p) => s + p.units * p.landed_gbp, 0);
  // A month at your share, but never more units than you hold.
  const predictedMonth = open.reduce((s, p) => s + (p.prediction.profitPerUnit ?? 0) * Math.min(p.prediction.sharePerMonth ?? 0, p.units), 0);
  const profitToDate = rows.reduce((s, p) => s + (p.actuals?.profitToDate ?? 0), 0);
  const counts = new Map<PurchaseStatus, number>();
  for (const p of open) counts.set(p.status, (counts.get(p.status) ?? 0) + 1);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Tracker</h1>
          <p className="text-sm text-muted-foreground">What you&apos;ve bought, the app&apos;s prediction when you bought it, and what Amazon says actually happened.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SyncStatus onSynced={() => setNonce((n) => n + 1)} />
          <Button variant="outline" onClick={() => setStockNew({ item: "", qty: null, supplier: null })}>Record a stock order</Button>
          <RecordPurchaseDialog />
        </div>
      </div>
      {stockNew && <StockPurchaseDialog open itemId={stockNew.item || null} qty={stockNew.qty} supplierId={stockNew.supplier} onOpenChange={(o) => { if (!o) { setStockNew(null); window.history.replaceState(null, "", "/tracker"); } }} onSaved={() => setNonce((n) => n + 1)} />}
      {receiving && <ReceiveDialog open units={receiving.units} onOpenChange={(o) => { if (!o) setReceiving(null); }} onReceive={(bucket) => { const p = receiving; setReceiving(null); setStatus(p, "received", bucket); }} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Money in stock" value={gbp(invested, 0)} hint={`${open.length} open purchase${open.length === 1 ? "" : "s"}, landed`} />
        <Tile label={<>Predicted profit / month <VatTag registered={vatReg} /></>} value={gbp(predictedMonth, 0)} hint="next month at your share, up to the units held" />
        <Tile label={<>Profit to date <VatTag registered={vatReg} /></>} value={gbp(profitToDate, 0)} hint="from Amazon's reports" />
        <Tile label="Pipeline" value={open.length} hint={PURCHASE_STATUSES.filter((s) => counts.get(s.id)).map((s) => `${counts.get(s.id)} ${s.label.toLowerCase()}`).join(" · ") || "nothing open"} />
      </div>

      <CalibrationPanel nonce={nonce} />

      {rows.length === 0 ? (
        <EmptyState icon={<PackageIcon />} title="Nothing bought yet">
          Record a purchase from a product&apos;s page (Your purchases) or, after ordering, from the Plan (Record as bought). The app freezes its prediction then, and compares it with Amazon&apos;s real figures once the stock is live.
        </EmptyState>
      ) : (
        <>
          <ToggleGroup type="single" variant="outline" size="sm" value={show} onValueChange={(v) => v && setShow(v as "open" | "all")}>
            <ToggleGroupItem value="open">Open</ToggleGroupItem>
            <ToggleGroupItem value="all">All, with closed</ToggleGroupItem>
          </ToggleGroup>
          <div className="panel overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortTableHead {...sorting.th("product")} className="pl-4">Product</SortTableHead>
                  <SortTableHead {...sorting.th("status")} title="In pipeline order">Status</SortTableHead>
                  <SortTableHead {...sorting.th("units")} numeric>Units</SortTableHead>
                  <SortTableHead {...sorting.th("landed")} numeric>Landed</SortTableHead>
                  <SortTableHead {...sorting.th("profit")} numeric title="Sorts by the actual figure">Profit / unit<br /><span className="font-normal text-muted-foreground">predicted · actual</span></SortTableHead>
                  <SortTableHead {...sorting.th("sales")} numeric title="Sorts by the actual figure">Sales / mo<br /><span className="font-normal text-muted-foreground">predicted · actual</span></SortTableHead>
                  <SortTableHead {...sorting.th("sold")} numeric>Sold</SortTableHead>
                  <SortTableHead {...sorting.th("profitToDate")} numeric className="pr-4">Profit to date</SortTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((p) => {
                  const a = p.actuals;
                  const salesOff = pctOff(p.prediction.sharePerMonth, a?.unitsPerMonth);
                  return (
                    <TableRow key={p.id} data-verdict={a?.profitPerUnit != null ? (a.profitPerUnit > 0 ? "pass" : "fail") : "empty"}>
                      <TableCell className="max-w-80 pl-4 whitespace-normal">
                        <div className="flex gap-2.5">
                          <ProductThumb url={purchaseImage(p)} asin={p.asin} title={purchaseTitle(p)} brand={p.stock?.brand ?? p.product?.brand ?? null} size={36} />
                          <div className="min-w-0">
                            {p.asin && p.product
                              ? <Link className="line-clamp-2 text-sm hover:text-brand hover:underline" href={`/products/${p.asin}`}>{purchaseTitle(p)}</Link>
                              : <Link className="line-clamp-2 text-sm hover:text-brand hover:underline" href={p.stock_item_id ? `/stock/levels?item=${p.stock_item_id}` : `/products/${p.asin}`}>{purchaseTitle(p)}</Link>}
                            <p className="num text-2xs text-muted-foreground">{p.asin ?? p.stock?.sku ?? "—"} · {p.supplier_name ?? "—"} · {p.ordered_on}{p.received_bucket ? ` · in Stock (${p.received_bucket === "home" ? "self-ship" : "TikTok FBT"})` : ""}</p>
                            <div className="flex flex-wrap items-center gap-1"><OrderLine p={p} /><OrderEditButton p={p} onSaved={() => setNonce((n) => n + 1)} /><OrderDeleteButton p={p} onDeleted={() => setNonce((n) => n + 1)} />{p.stock_item_id && <Link className="text-2xs text-brand hover:underline" href={`/stock/levels?item=${p.stock_item_id}`}>Stock →</Link>}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <NativeSelect className="h-8 w-36" value={p.status} onChange={(e) => setStatus(p, e.target.value as PurchaseStatus)} aria-label="Status">
                          {PURCHASE_STATUSES.map((s) => <NativeSelectOption key={s.id} value={s.id}>{s.label}</NativeSelectOption>)}
                        </NativeSelect>
                      </TableCell>
                      <TableCell className="num text-right">{p.units}</TableCell>
                      <TableCell className="num text-right">{gbp(p.landed_gbp)}</TableCell>
                      <TableCell className="num text-right">{gbp(p.prediction.profitPerUnit)} · {a ? gbp(a.profitPerUnit) : "—"}</TableCell>
                      <TableCell className="num text-right">
                        {p.prediction.sharePerMonth ?? "—"} · {a?.unitsPerMonth ?? "—"}
                        {salesOff != null && <span className={cn("ml-1 text-2xs", Math.abs(salesOff) < 15 ? "text-muted-foreground" : salesOff > 0 ? "text-pass" : "text-fail")}>{salesOff > 0 ? "+" : ""}{salesOff}%</span>}
                      </TableCell>
                      <TableCell className="num text-right">{a ? `${a.unitsSold} / ${p.units}` : "—"}</TableCell>
                      <TableCell className="num pr-4 text-right">{a ? gbp(a.profitToDate) : "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
