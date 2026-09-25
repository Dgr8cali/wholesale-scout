"use client";

import { ExternalLinkIcon, SearchIcon, TruckIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePageCrumbs } from "@/components/Crumbs";
import { EmptyState, ErrorState } from "@/components/States";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SupplierRecord, SupplierStats } from "@/lib/server/suppliers";
import { api, when } from "@/lib/ui/client";

type Row = SupplierRecord & { stats: SupplierStats };
const SOURCE: Record<SupplierRecord["source_type"], string> = { upload: "Upload", qogita: "Qogita", manual: "Manual" };
const yn = (b: boolean | null) => (b == null ? "—" : b ? "yes" : "no");

/** The supplier ledger: one record per supplier, with how its products screen. */
export default function SuppliersPage() {
  usePageCrumbs([{ label: "Suppliers" }]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    api<{ suppliers: Row[] }>("/api/suppliers?stats=1").then((r) => setRows(r.suppliers)).catch((e) => setError(e.message));
  }, []);
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (rows ?? []).filter((s) => !n || s.name.toLowerCase().includes(n) || s.stats.brands.some((b) => b.brand.toLowerCase().includes(n)));
  }, [rows, q]);

  const header = (
    <div>
      <h1 className="page-title">Suppliers</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
        One record per supplier: terms, paperwork and how their products screen on your default profile. A supplier&apos;s MOV counts in the
        budget gate for lines with no MOQ of their own.
      </p>
    </div>
  );
  if (error) return <div className="space-y-5">{header}<ErrorState title="Couldn't load suppliers" message={error} onRetry={() => window.location.reload()} /></div>;
  if (!rows) return <div className="space-y-5">{header}<Skeleton className="h-64 rounded-lg" /></div>;

  return (
    <div className="space-y-5">
      {header}
      {!rows.length ? (
        <EmptyState icon={<TruckIcon />} title="No suppliers yet">Suppliers appear with your first upload or Qogita pull.</EmptyState>
      ) : (
        <>
          <div className="relative w-72">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Find a supplier or brand" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a supplier or brand" />
          </div>
          <div className="panel overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Supplier</TableHead>
                  <TableHead className="text-right">Runs</TableHead>
                  <TableHead className="text-right">Products</TableHead>
                  <TableHead className="text-right" title="On your default profile">Pass / warn</TableHead>
                  <TableHead>Brands</TableHead>
                  <TableHead>Terms</TableHead>
                  <TableHead title="Importer of record · labelling · invoice accepted for brand approval">Paperwork</TableHead>
                  <TableHead className="pr-4 text-right">Rating</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="pl-4">
                      <Link className="font-medium hover:underline" href={`/suppliers/${s.id}`}>{s.name}</Link>
                      {s.website && <a className="ml-1 inline-block text-muted-foreground" href={s.website} target="_blank" rel="noreferrer" aria-label="Website"><ExternalLinkIcon className="size-3" /></a>}
                      <p className="text-xs text-muted-foreground">{SOURCE[s.source_type]}{s.stats.lastSeen ? ` · last offer ${when(s.stats.lastSeen)}` : ""}</p>
                    </TableCell>
                    <TableCell className="num text-right">{s.stats.runs}</TableCell>
                    <TableCell className="num text-right">{s.stats.products.toLocaleString("en-GB")}</TableCell>
                    <TableCell className="num text-right">
                      <span className={s.stats.pass ? "font-semibold text-pass" : "text-muted-foreground"}>{s.stats.pass}</span>
                      <span className="text-muted-foreground"> / </span>
                      <span className={s.stats.warn ? "text-warn" : "text-muted-foreground"}>{s.stats.warn}</span>
                    </TableCell>
                    <TableCell className="max-w-72 text-xs whitespace-normal text-muted-foreground">
                      {s.stats.brands.slice(0, 3).map((b) => b.brand).join(", ") || "—"}
                      {s.stats.brands.length > 3 && ` +${s.stats.brands.length - 3}`}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {s.currency} · {s.vat_basis === "inc_vat" ? "inc VAT" : "ex VAT"}
                      {s.mov != null && ` · MOV ${s.mov.toLocaleString("en-GB")}`}
                      {s.delivery_days != null && ` · ${s.delivery_days} days`}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      IoR {yn(s.importer_of_record)} · {s.labelling ?? "—"} · invoice {yn(s.invoice_accepted_for_approval)}
                    </TableCell>
                    <TableCell className="pr-4 text-right">{s.rating ? <Badge variant="outline" className="num">{"★".repeat(s.rating)}</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
