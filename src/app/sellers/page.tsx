"use client";

import { ExternalLinkIcon, ScanSearchIcon, StoreIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ErrorState } from "@/components/States";
import { VerdictBar } from "@/components/VerdictBar";
import { Button } from "@/components/ui/button";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { storefrontUrl } from "@/lib/check/seller";
import type { ScannedSeller } from "@/lib/server/sellerScan";
import { api, when } from "@/lib/ui/client";

const n = (x: number) => x.toLocaleString("en-GB");

export default function SellersPage() {
  const [sellers, setSellers] = useState<ScannedSeller[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ sellers: ScannedSeller[] }>("/api/sellers").then((r) => setSellers(r.sellers)).catch((e) => setError(e.message));
  }, []);

  const columns: DataColumn<ScannedSeller>[] = [
    {
      id: "seller", header: "Seller", mobile: "title", className: "max-w-64", sortValue: (s) => s.name ?? s.sellerId,
      cell: (s) => <>
        <a className="inline-flex items-center gap-1 font-medium hover:underline" href={storefrontUrl(s.sellerId)} target="_blank" rel="noreferrer">
          {s.name ?? s.sellerId} <ExternalLinkIcon className="size-3 text-muted-foreground" />
        </a>
        <p className="text-xs font-normal text-muted-foreground">{s.businessName && s.businessName !== s.name ? `${s.businessName} · ` : ""}{s.sellerId}</p>
      </>,
    },
    {
      id: "rating", header: "Rating", numeric: true, mobile: 2, sortValue: (s) => s.ratingPct,
      cell: (s) => <>{s.ratingPct != null ? `${s.ratingPct}%` : "—"}<p className="text-xs text-muted-foreground">{s.ratingCount != null ? `${n(s.ratingCount)} ratings` : ""}</p></>,
    },
    {
      id: "storefront", header: "Storefront", numeric: true, sortValue: (s) => s.storefrontSize,
      cell: (s) => <>{s.storefrontSize != null ? n(s.storefrontSize) : "—"}<p className="text-xs text-muted-foreground">{s.buyBoxOwnershipPct != null ? `holds ${s.buyBoxOwnershipPct}% of its Buy Boxes` : ""}</p></>,
    },
    {
      id: "brands", header: "Brand mix", className: "max-w-80", sortValue: (s) => s.brands[0]?.brand ?? null,
      cell: (s) => (
        <div className="flex flex-wrap gap-1">
          {s.brands.slice(0, 5).map((b) => <StatusChip key={b.brand} tone="neutral" icon={false} className="font-normal">{b.brand} <span className="num opacity-80">{n(b.count)}</span></StatusChip>)}
          {!s.brands.length && <span className="text-xs text-muted-foreground">—</span>}
        </div>
      ),
    },
    {
      id: "lastScan", header: "Last scan", mobile: 1, className: "min-w-56", sortValue: (s) => s.lastScan?.at ?? null,
      cell: (s) => {
        const r = s.results;
        const screened = r ? r.pass + r.warn + r.fail : 0;
        return s.lastScan ? (
          <div className="space-y-1">
            <Link className="text-sm text-primary hover:underline" href={`/runs/${s.lastScan.runId}`}>{when(s.lastScan.at)}</Link>
            {r && (screened > 0 || r.pending > 0) && (
              <>
                <VerdictBar counts={{ pass: r.pass, warn: r.warn, fail: r.fail, error: 0, pending: r.pending }} legend={false} />
                <p className="num text-xs text-muted-foreground">
                  {r.pass} Buy · {r.warn} Check · {r.fail} Skip{r.pending ? ` · ${n(r.pending)} to go` : ""}
                  {` · holds Buy Box on ${n(r.holdsBuyBox)}`}
                </p>
              </>
            )}
          </div>
        ) : <span className="text-xs text-muted-foreground">Looked up, not scanned</span>;
      },
    },
    {
      id: "act", header: <span className="sr-only">Actions</span>, mobile: 3, className: "text-right",
      cell: (s) => <Button size="sm" variant="secondary" asChild><Link href={`/new-run?tab=seller&seller=${s.sellerId}`}>{s.lastScan ? "Re-scan" : "Scan"}</Link></Button>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sellers"
        crumbs={[{ label: "Wholesale", href: "/runs" }, { label: "Sellers" }]}
        subtitle="Storefronts you've scanned: who they are, what they sell, and how their listings screened."
        actions={<Button asChild><Link href="/new-run?tab=seller"><ScanSearchIcon /> Scan a seller</Link></Button>}
      />

      {error ? <ErrorState title="Couldn't load sellers" message={error} onRetry={() => window.location.reload()} />
        : sellers == null ? <Skeleton className="h-64 rounded-xl" />
        : (
          <DataTable
            rows={sellers}
            columns={columns}
            getRowId={(s) => s.sellerId}
            storageKey="wholesale.sellers"
            caption="Sellers"
            empty={{
              icon: <StoreIcon />, title: "No sellers scanned yet",
              description: "Paste a seller ID or storefront link, or use “Scan this seller” on a row's Buy Box sellers.",
              action: <Button variant="secondary" asChild><Link href="/new-run?tab=seller">Scan a seller</Link></Button>,
            }}
          />
        )}
    </div>
  );
}
