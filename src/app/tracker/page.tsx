"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePageCrumbs } from "@/components/Crumbs";
import { ProductThumb } from "@/components/ProductThumb";
import { EmptyState, ErrorState } from "@/components/States";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

type Row = Purchase & { actuals?: Actuals | null };
const label = (s: PurchaseStatus) => PURCHASE_STATUSES.find((x) => x.id === s)?.label ?? s;

function Tile({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
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
  useEffect(() => {
    api<{ purchases: Row[] }>("/api/purchases?actuals=1")
      .then((r) => setRows(r.purchases))
      .catch((e: Error) => setError(e.message));
  }, [nonce]);
  const shown = useMemo(() => (rows ?? []).filter((p) => show === "all" || p.status !== "closed"), [rows, show]);

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
          <RecordPurchaseDialog />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Money in stock" value={gbp(invested, 0)} hint={`${open.length} open purchase${open.length === 1 ? "" : "s"}, landed`} />
        <Tile label="Predicted profit / month" value={gbp(predictedMonth, 0)} hint="next month at your share, up to the units held" />
        <Tile label="Profit to date" value={gbp(profitToDate, 0)} hint="from Amazon's reports" />
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
                  <TableHead className="pl-4">Product</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  <TableHead className="text-right">Landed</TableHead>
                  <TableHead className="text-right">Profit / unit<br /><span className="font-normal text-muted-foreground">predicted · actual</span></TableHead>
                  <TableHead className="text-right">Sales / mo<br /><span className="font-normal text-muted-foreground">predicted · actual</span></TableHead>
                  <TableHead className="text-right">Sold</TableHead>
                  <TableHead className="pr-4 text-right">Profit to date</TableHead>
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
                          <ProductThumb url={p.product?.image_url ?? null} asin={p.asin} title={p.product?.title ?? p.asin} brand={p.product?.brand ?? null} size={36} />
                          <div className="min-w-0">
                            <Link className="line-clamp-2 text-sm hover:text-brand hover:underline" href={`/products/${p.asin}`}>{p.product?.title ?? p.asin}</Link>
                            <p className="num text-2xs text-muted-foreground">{p.asin} · {p.supplier_name ?? "—"} · {p.ordered_on}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell><Badge variant={p.status === "live" ? "pass" : p.status === "closed" ? "muted" : "brand"}>{label(p.status)}</Badge></TableCell>
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
