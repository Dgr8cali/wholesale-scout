"use client";

import { CheckIcon, ExternalLinkIcon, ScanSearchIcon, StoreIcon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { usePageCrumbs } from "@/components/Crumbs";
import { ProductThumb } from "@/components/ProductThumb";
import { ErrorState } from "@/components/States";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GATING_LABELS, GATING_VARIANT, type BrandProduct, type BrandSummary } from "@/lib/brandMap";
import { APPROVAL_STATUSES, STATUS_LABELS, type ApprovalStatus } from "@/lib/brands";
import { api, gbp, when } from "@/lib/ui/client";
import { cn } from "@/lib/utils";

type Product = BrandProduct & { bestOffer: { supplier: string; unitCostGbp: number; moq: number | null; seenAt: string } | null; runId: string | null };

const RESTRICTION: Record<string, { label: string; className: string }> = {
  open: { label: "Open", className: "text-pass" },
  approval_required: { label: "Approval", className: "text-warn" },
  blocked: { label: "Blocked", className: "text-fail" },
};

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div title={hint}>
      <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="num text-base font-semibold">{value}</p>
    </div>
  );
}

export default function BrandPage() {
  const { key } = useParams<{ key: string }>();
  const [data, setData] = useState<{ summary: BrandSummary; products: Product[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  usePageCrumbs([{ label: "Brands", href: "/brands" }, { label: data?.summary.brand ?? "…" }]);

  const load = useCallback(() => {
    api<{ summary: BrandSummary; products: Product[] }>(`/api/brands/${encodeURIComponent(key)}`).then(setData).catch((e) => setError(e.message));
  }, [key]);
  useEffect(() => { load(); }, [load]);

  async function saveApproval(patch: { status?: ApprovalStatus; requirement?: string; status_date?: string }) {
    if (!data) return;
    const a = data.summary.approval;
    const body = {
      brand: data.summary.brand,
      status: patch.status ?? a?.status ?? "not_applied",
      requirement: patch.requirement ?? a?.requirement ?? "",
      status_date: patch.status_date ?? a?.status_date ?? (patch.status ? new Date().toISOString().slice(0, 10) : ""),
    };
    try {
      await api("/api/brands", { method: "PUT", json: body });
      toast.success(patch.status === "approved" ? `${data.summary.brand} marked approved; runs treat it as open when next screened` : "Saved");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (error) return <ErrorState title="Couldn't load this brand" message={error} onRetry={load} />;
  if (!data) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-32" /><Skeleton className="h-64" /></div>;
  const b = data.summary;
  const approval = b.approval;
  const topSellers = b.sellers.slice(0, 3);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-3">
            {b.brand}
            <span className={cn("num rounded px-2 py-0.5 text-sm font-semibold", b.score >= 70 ? "bg-pass-soft text-pass" : b.score >= 50 ? "bg-warn-soft text-warn" : "bg-muted text-muted-foreground")}
              title="Wholesale-friendly score, 0–100">{b.score}</span>
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant={GATING_VARIANT[b.gating]}>{GATING_LABELS[b.gating]}</Badge>
            {b.suppliers.length ? `Carried by ${b.suppliers.map((s) => s.name).join(", ")}` : "No supplier offers it yet"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {b.applyUrl && (
            <Button asChild variant="outline"><a href={b.applyUrl} target="_blank" rel="noreferrer noopener">Apply on Amazon <ExternalLinkIcon /></a></Button>
          )}
          {approval?.status !== "approved" && (
            <Button onClick={() => saveApproval({ status: "approved", status_date: new Date().toISOString().slice(0, 10) })}><CheckIcon /> Mark approved</Button>
          )}
        </div>
      </div>

      <section className="panel grid grid-cols-2 gap-4 p-4 sm:grid-cols-4 lg:grid-cols-7">
        <Stat label="ASINs" value={b.asins} />
        <Stat label="Pass / warn" value={<><span className="text-pass">{b.pass}</span> / <span className="text-warn">{b.warn}</span></>} hint="On your default profile" />
        <Stat label="Avg sellers" value={b.avgSellers ?? "—"} />
        <Stat label="Amazon" value={b.amazonSharePct == null ? "—" : `${b.amazonSharePct}%`} hint="Share of its listings Amazon sells or sold" />
        <Stat label="Avg Buy Box" value={gbp(b.avgBuyBox)} />
        <Stat label="Median max landed" value={gbp(b.medianMaxLanded)} hint="The most a unit can cost landed and clear the floors, median across its products" />
        <Stat label="IP risk" value="—" hint="Coming next" />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel space-y-3 p-4" aria-label="Approval">
          <h2 className="text-sm font-semibold">Your approval</h2>
          <div className="grid gap-3 sm:grid-cols-[10rem_1fr_10rem]">
            <NativeSelect value={approval?.status ?? "not_applied"} aria-label="Status" onChange={(e) => saveApproval({ status: e.target.value as ApprovalStatus })}>
              {APPROVAL_STATUSES.map((s) => <NativeSelectOption key={s} value={s}>{STATUS_LABELS[s]}</NativeSelectOption>)}
            </NativeSelect>
            <Input placeholder="Requirement, e.g. 3 invoices, 30 units" defaultValue={approval?.requirement ?? ""} aria-label="Requirement"
              onBlur={(e) => e.target.value !== (approval?.requirement ?? "") && saveApproval({ requirement: e.target.value })} />
            <Input type="date" className="num" defaultValue={approval?.status_date ?? ""} aria-label="Date" onChange={(e) => saveApproval({ status_date: e.target.value })} />
          </div>
        </section>
        <section className="panel space-y-2 p-4" aria-label="Top sellers">
          <h2 className="text-sm font-semibold">Top sellers of this brand</h2>
          {!topSellers.length ? <p className="text-sm text-muted-foreground">No Buy Box sellers known yet: they&apos;re looked up for products that pass every gate.</p> : (
            <ul className="space-y-1.5">
              {topSellers.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">
                    <StoreIcon className="mr-1 inline size-3.5 text-muted-foreground" />
                    {s.name ?? s.id} <span className="text-xs text-muted-foreground">· on {s.count} of its listings</span>
                  </span>
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/sellers/scan?seller=${s.id}`}><ScanSearchIcon /> Scan</Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Products across all runs <span className="font-normal text-muted-foreground">· best offer per EAN</span></h2>
        <div className="panel overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Product</TableHead>
                <TableHead>Verdict</TableHead>
                <TableHead className="text-right">Buy Box</TableHead>
                <TableHead className="text-right">Sellers</TableHead>
                <TableHead>Amazon</TableHead>
                <TableHead className="text-right" title="The most a unit can cost landed and clear the floors">Max landed</TableHead>
                <TableHead>Best offer</TableHead>
                <TableHead className="pr-4">Gating</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.products.map((p) => {
                const r = p.restriction ? RESTRICTION[p.restriction] : undefined;
                return (
                  <TableRow key={p.product_id}>
                    <TableCell className="max-w-96 pl-4 whitespace-normal">
                      <div className="flex gap-2.5">
                        <ProductThumb url={p.image_url} asin={p.asin} title={p.title ?? p.ean} brand={b.brand} size={36} />
                        <div className="min-w-0">
                          <p className="line-clamp-2 text-sm">{p.title ?? p.ean}</p>
                          <p className="num text-2xs text-muted-foreground">
                            {p.ean !== p.asin ? p.ean : ""}
                            {p.asin && <> · <a className="text-brand hover:underline" href={`https://www.amazon.co.uk/dp/${p.asin}`} target="_blank" rel="noreferrer">{p.asin}</a></>}
                            {p.runId && <> · <Link className="text-brand hover:underline" href={`/runs/${p.runId}`}>latest run</Link></>}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {p.priced && p.verdict ? <Badge variant={p.verdict}>{p.verdict}</Badge> : <span className="text-xs text-muted-foreground" title="Never priced: not judged">—</span>}
                    </TableCell>
                    <TableCell className="num text-right">{gbp(p.buy_box)}</TableCell>
                    <TableCell className="num text-right">{p.fba_sellers ?? "—"}</TableCell>
                    <TableCell className={cn("text-xs", p.amazon && "text-fail")}>{p.amazon == null ? "—" : p.amazon ? "sells / sold" : "no"}</TableCell>
                    <TableCell className="num text-right">{gbp(p.max_landed)}</TableCell>
                    <TableCell className="text-xs">
                      {p.bestOffer ? (
                        <span title={`Seen ${when(p.bestOffer.seenAt)}`}>
                          <span className="num font-medium">{gbp(p.bestOffer.unitCostGbp)}</span> ex-VAT · {p.bestOffer.supplier}{p.bestOffer.moq ? ` · MOQ ${p.bestOffer.moq}` : ""}
                        </span>
                      ) : <span className="text-muted-foreground">no costed offer</span>}
                    </TableCell>
                    <TableCell className="pr-4 text-xs">
                      {r ? <span className={r.className}>{r.label}</span> : <span className="text-muted-foreground">—</span>}
                      {p.apply_url && p.restriction === "approval_required" && (
                        <a className="ml-1 text-brand" href={p.apply_url} target="_blank" rel="noreferrer" aria-label="Apply on Amazon"><ExternalLinkIcon className="inline size-3" /></a>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
