"use client";

import { CheckIcon, ExternalLinkIcon, PackageSearchIcon, ScanSearchIcon, StoreIcon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ProductThumb } from "@/components/ProductThumb";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { SectionTitle } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductDecision, StatusChip, type Tone } from "@/components/ui/status-chip";
import { GATING_LABELS, GATING_VARIANT, type BrandProduct, type BrandSummary } from "@/lib/brandMap";
import { APPROVAL_STATUSES, STATUS_LABELS, type ApprovalStatus } from "@/lib/brands";
import { api, gbp, when } from "@/lib/ui/client";
import { cn } from "@/lib/utils";
import { ApplyKit } from "@/components/documents/ApplyKit";
import { DocumentUploader } from "@/components/documents/Documents";

type Product = BrandProduct & { bestOffer: { supplier: string; unitCostGbp: number; moq: number | null; seenAt: string } | null; runId: string | null };

const RESTRICTION: Record<string, { label: string; tone: Tone }> = {
  open: { label: "Open", tone: "good" },
  approval_required: { label: "Approval", tone: "warn" },
  blocked: { label: "Blocked", tone: "bad" },
};
/** The brand map's gating colours (lib/brandMap's badge variants) as chip tones. */
const GATING_TONE: Record<(typeof GATING_VARIANT)[keyof typeof GATING_VARIANT], Tone> = { pass: "good", warn: "warn", fail: "bad", muted: "neutral", brand: "info" };
const cap = (x: string) => x[0].toUpperCase() + x.slice(1);

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div title={hint}>
      <p className="eyebrow">{label}</p>
      <p className="stat-value">{value}</p>
    </div>
  );
}

export default function BrandPage() {
  const { key } = useParams<{ key: string }>();
  const [data, setData] = useState<{ summary: BrandSummary; products: Product[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      const r = await api<{ rescored?: number }>("/api/brands", { method: "PUT", json: body });
      const again = r.rescored ? `; ${r.rescored} row${r.rescored === 1 ? "" : "s"} re-scored` : "";
      toast.success(patch.status === "approved" ? `${data.summary.brand} marked approved${again}` : `Saved${again}`);
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
      <div className="space-y-2">
        <PageHeader
          crumbs={[{ label: "Wholesale", href: "/runs" }, { label: "Brands", href: "/brands" }, { label: b.brand }]}
          title={<span className="flex items-center gap-3">
            {b.brand}
            <span className={cn("num rounded-md px-2 py-0.5 text-sm font-semibold", b.score >= 70 ? "bg-success-soft text-success" : b.score >= 50 ? "bg-warn-soft text-warn-ink" : "bg-subtle text-muted-foreground")}
              title="Wholesale-friendly score, 0–100">{b.score}</span>
          </span>}
          subtitle={<span className="inline-flex flex-wrap items-center gap-2">
            <StatusChip tone={GATING_TONE[GATING_VARIANT[b.gating]]}>{GATING_LABELS[b.gating]}</StatusChip>
            {b.suppliers.length ? `Carried by ${b.suppliers.map((s) => s.name).join(", ")}` : "No supplier offers it yet"}
          </span>}
          actions={<>
            {b.applyUrl && (
              <>
                <ApplyKit brand={b.brand} applyUrl={b.applyUrl} />
                <Button asChild variant="secondary"><a href={b.applyUrl} target="_blank" rel="noreferrer noopener">Apply on Amazon <ExternalLinkIcon /></a></Button>
              </>
            )}
            {approval?.status !== "approved" && (
              <Button onClick={() => saveApproval({ status: "approved", status_date: new Date().toISOString().slice(0, 10) })}><CheckIcon /> Mark approved</Button>
            )}
          </>}
        />
        {b.ipRisk && (
          <p className={cn("text-sm", b.ipRisk.level === "high" ? "text-danger" : "text-warn-ink")}>
            IP risk ({b.ipRisk.level}){b.ipRisk.note ? `: ${b.ipRisk.note}` : ""}{b.ipRisk.source ? ` (${b.ipRisk.source})` : ""}
            {b.ipRisk.level === "high" && " · score halved"}
            {" · "}<Link className="underline-offset-2 hover:underline" href="/settings?tab=ip">edit</Link>
          </p>
        )}
      </div>

      <section className="panel grid grid-cols-2 gap-4 p-4 sm:grid-cols-4 lg:grid-cols-7">
        <Stat label="ASINs" value={b.asins} />
        <Stat label="Buy / Check" value={<span className="num"><span className="text-success">{b.pass}</span> / <span className="text-warn-ink">{b.warn}</span></span>} hint="On your default profile" />
        <Stat label="Avg sellers" value={b.avgSellers ?? "—"} />
        <Stat label="Amazon" value={b.amazonSharePct == null ? "—" : `${b.amazonSharePct}%`} hint="Share of its listings Amazon sells or sold" />
        <Stat label="Avg Buy Box" value={gbp(b.avgBuyBox)} />
        <Stat label="Median max landed" value={gbp(b.medianMaxLanded)} hint="The most a unit can cost landed and clear the floors, median across its products" />
        <Stat label="IP risk" value={b.ipRisk
          ? <span className={b.ipRisk.level === "high" ? "text-danger" : b.ipRisk.level === "medium" ? "text-warn-ink" : ""}>{cap(b.ipRisk.level)}</span>
          : "—"} hint={b.ipRisk ? [b.ipRisk.note, b.ipRisk.source && `Source: ${b.ipRisk.source}`].filter(Boolean).join(" · ") : "Not on your IP-risk list"} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel space-y-3 p-4" aria-label="Approval">
          <SectionTitle title="Your approval">Marking a brand approved re-scores its rows in every current run.</SectionTitle>
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
          <SectionTitle title="Top sellers of this brand">Buy Box sellers are looked up for products that pass every gate. Scan one to screen its storefront as a run.</SectionTitle>
          {!topSellers.length ? <p className="text-sm text-muted-foreground">No Buy Box sellers known yet: they&apos;re looked up for products that pass every gate.</p> : (
            <ul className="space-y-1.5">
              {topSellers.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">
                    <StoreIcon className="mr-1 inline size-3.5 text-muted-foreground" />
                    {s.name ?? s.id} <span className="text-xs text-muted-foreground">· on {s.count} of its listings</span>
                  </span>
                  <Button size="sm" variant="ghost" asChild>
                    <Link href={`/new-run?tab=seller&seller=${s.id}`}><ScanSearchIcon /> Scan</Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <DocumentUploader brand={{ name: b.brand }} />

      <section className="space-y-2">
        <SectionTitle title={<>Products across all runs <span>· best offer per EAN</span></>} />
        <DataTable
          rows={data.products}
          getRowId={(p) => p.product_id}
          caption={`${b.brand} products`}
          storageKey="wholesale.brandProducts"
          rowAttrs={(p) => ({ "data-verdict": p.priced && p.verdict ? p.verdict : "empty" })}
          empty={{ icon: <PackageSearchIcon />, title: "No products yet", description: "Products of this brand appear once a run screens them." }}
          columns={[
            {
              id: "product", header: "Product", mobile: "title", className: "max-w-96 min-w-[16rem]", sortValue: (p) => p.title ?? p.ean,
              cell: (p) => (
                <div className="flex gap-2.5">
                  <ProductThumb url={p.image_url} asin={p.asin} title={p.title ?? p.ean} brand={b.brand} size={36} />
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm">{p.asin ? <Link className="hover:text-primary hover:underline" href={`/products/${p.asin}`}>{p.title ?? p.ean}</Link> : p.title ?? p.ean}</p>
                    <p className="num text-xs font-normal text-muted-foreground">
                      {p.ean !== p.asin ? p.ean : ""}
                      {p.asin && <> · <a className="text-primary hover:underline" href={`https://www.amazon.co.uk/dp/${p.asin}`} target="_blank" rel="noreferrer">{p.asin}</a></>}
                      {p.runId && <> · <Link className="text-primary hover:underline" href={`/runs/${p.runId}`}>latest run</Link></>}
                    </p>
                  </div>
                </div>
              ),
            },
            {
              // Buy, Check, Skip; never priced last.
              id: "verdict", header: "Verdict", mobile: 1, sortValue: (p) => (p.priced && p.verdict ? { pass: 1, warn: 2, fail: 3 }[p.verdict] : null),
              cell: (p) => (p.priced && p.verdict ? <ProductDecision verdict={p.verdict} /> : <span className="text-xs text-muted-foreground" title="Never priced: not judged">—</span>),
            },
            { id: "buyBox", header: "Buy Box", numeric: true, mobile: 2, sortValue: (p) => p.buy_box, cell: (p) => gbp(p.buy_box) },
            { id: "sellers", header: "Sellers", numeric: true, sortValue: (p) => p.fba_sellers, cell: (p) => p.fba_sellers ?? "—" },
            { id: "amazon", header: "Amazon", sortValue: (p) => (p.amazon == null ? null : p.amazon ? "sells / sold" : "no"), cell: (p) => <span className={cn("text-meta", p.amazon && "text-danger")}>{p.amazon == null ? "—" : p.amazon ? "sells / sold" : "no"}</span> },
            { id: "maxLanded", header: <span title="The most a unit can cost landed and clear the floors">Max landed</span>, numeric: true, mobile: 3, sortValue: (p) => p.max_landed, cell: (p) => gbp(p.max_landed) },
            {
              id: "offer", header: <span title="Sorts by the best unit cost">Best offer</span>, sortValue: (p) => p.bestOffer?.unitCostGbp ?? null,
              cell: (p) => (p.bestOffer ? (
                <span className="text-meta" title={`Seen ${when(p.bestOffer.seenAt)}`}>
                  <span className="num font-medium">{gbp(p.bestOffer.unitCostGbp)}</span> ex-VAT · {p.bestOffer.supplier}{p.bestOffer.moq ? ` · MOQ ${p.bestOffer.moq}` : ""}
                </span>
              ) : <span className="text-meta text-muted-foreground">no costed offer</span>),
            },
            {
              id: "gating", header: "Gating", sortValue: (p) => (p.restriction ? RESTRICTION[p.restriction]?.label ?? p.restriction : null),
              cell: (p) => {
                const r = p.restriction ? RESTRICTION[p.restriction] : undefined;
                return (
                  <span className="inline-flex items-center gap-1">
                    {r ? <StatusChip tone={r.tone}>{r.label}</StatusChip> : <span className="text-muted-foreground">—</span>}
                    {p.apply_url && p.restriction === "approval_required" && (
                      <a className="text-primary" href={p.apply_url} target="_blank" rel="noreferrer" aria-label="Apply on Amazon"><ExternalLinkIcon className="inline size-3" /></a>
                    )}
                  </span>
                );
              },
            },
          ]}
        />
      </section>
    </div>
  );
}
