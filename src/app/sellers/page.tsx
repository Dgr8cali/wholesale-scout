"use client";

import { ExternalLinkIcon, ScanSearchIcon, StoreIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePageCrumbs } from "@/components/Crumbs";
import { EmptyState, ErrorState } from "@/components/States";
import { VerdictBar } from "@/components/VerdictBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { storefrontUrl } from "@/lib/check/seller";
import type { ScannedSeller } from "@/lib/server/sellerScan";
import { api, when } from "@/lib/ui/client";

const n = (x: number) => x.toLocaleString("en-GB");

export default function SellersPage() {
  usePageCrumbs([{ label: "Sellers" }]);
  const [sellers, setSellers] = useState<ScannedSeller[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ sellers: ScannedSeller[] }>("/api/sellers").then((r) => setSellers(r.sellers)).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Sellers</h1>
          <p className="mt-1 text-sm text-muted-foreground">Storefronts you&apos;ve scanned: who they are, what they sell, and how their listings screened.</p>
        </div>
        <Button asChild><Link href="/sellers/scan"><ScanSearchIcon /> Scan a seller</Link></Button>
      </div>

      {error ? <ErrorState title="Couldn't load sellers" message={error} onRetry={() => window.location.reload()} />
        : sellers == null ? <p className="text-sm text-muted-foreground">Loading…</p>
        : !sellers.length ? (
          <EmptyState icon={<StoreIcon />} title="No sellers scanned yet"
            action={<Button variant="outline" asChild><Link href="/sellers/scan">Scan a seller</Link></Button>}>
            Paste a seller ID or storefront link, or use “Scan this seller” on a row&apos;s Buy Box sellers.
          </EmptyState>
        ) : (
          <div className="panel overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Seller</TableHead>
                  <TableHead className="text-right">Rating</TableHead>
                  <TableHead className="text-right">Storefront</TableHead>
                  <TableHead>Brand mix</TableHead>
                  <TableHead>Last scan</TableHead>
                  <TableHead className="pr-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sellers.map((s) => {
                  const r = s.results;
                  const screened = r ? r.pass + r.warn + r.fail : 0;
                  return (
                    <TableRow key={s.sellerId}>
                      <TableCell className="max-w-64 whitespace-normal pl-4">
                        <a className="inline-flex items-center gap-1 font-medium hover:underline" href={storefrontUrl(s.sellerId)} target="_blank" rel="noreferrer">
                          {s.name ?? s.sellerId} <ExternalLinkIcon className="size-3 text-muted-foreground" />
                        </a>
                        <p className="text-xs text-muted-foreground">{s.businessName && s.businessName !== s.name ? `${s.businessName} · ` : ""}{s.sellerId}</p>
                      </TableCell>
                      <TableCell className="num text-right">
                        {s.ratingPct != null ? `${s.ratingPct}%` : "—"}
                        <p className="text-2xs text-muted-foreground">{s.ratingCount != null ? `${n(s.ratingCount)} ratings` : ""}</p>
                      </TableCell>
                      <TableCell className="num text-right">
                        {s.storefrontSize != null ? n(s.storefrontSize) : "—"}
                        <p className="text-2xs text-muted-foreground">
                          {s.buyBoxOwnershipPct != null ? `holds ${s.buyBoxOwnershipPct}% of its Buy Boxes` : ""}
                        </p>
                      </TableCell>
                      <TableCell className="max-w-80 whitespace-normal">
                        <div className="flex flex-wrap gap-1">
                          {s.brands.slice(0, 5).map((b) => <Badge key={b.brand} variant="outline" className="font-normal">{b.brand} <span className="num text-muted-foreground">{n(b.count)}</span></Badge>)}
                          {!s.brands.length && <span className="text-xs text-muted-foreground">—</span>}
                        </div>
                      </TableCell>
                      <TableCell className="min-w-56">
                        {s.lastScan ? (
                          <div className="space-y-1">
                            <Link className="text-sm text-brand hover:underline" href={`/runs/${s.lastScan.runId}`}>{when(s.lastScan.at)}</Link>
                            {r && (screened > 0 || r.pending > 0) && (
                              <>
                                <VerdictBar counts={{ pass: r.pass, warn: r.warn, fail: r.fail, error: 0, pending: r.pending }} legend={false} />
                                <p className="num text-2xs text-muted-foreground">
                                  {r.pass} pass · {r.warn} warn · {r.fail} fail{r.pending ? ` · ${n(r.pending)} to go` : ""}
                                  {` · holds Buy Box on ${n(r.holdsBuyBox)}`}
                                </p>
                              </>
                            )}
                          </div>
                        ) : <span className="text-xs text-muted-foreground">Looked up, not scanned</span>}
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <Button size="sm" variant="outline" asChild><Link href={`/sellers/scan?seller=${s.sellerId}`}>{s.lastScan ? "Re-scan" : "Scan"}</Link></Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
    </div>
  );
}
