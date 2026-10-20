"use client";

import { ExternalLinkIcon, SearchIcon, TruckIcon, UploadIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EmptyState, ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import type { SupplierRecord, SupplierStats } from "@/lib/server/suppliers";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { SUPPLIER_KIND_LABEL, SUPPLIER_KINDS } from "@/lib/stock/orders";
import { api, when } from "@/lib/ui/client";
import { ChipToggle } from "@/components/ui/chip-toggle";
import { TableSkeleton } from "@/components/ui/skeletons";

type Row = SupplierRecord & { stats: SupplierStats; stock: { items: number; purchases: number } };
/** No price lists: never in an upload, a Qogita pull or a run. */
const stockOnly = (s: Row) => !s.stats.runs && !s.stats.products && s.source_type !== "qogita";
const SOURCE: Record<SupplierRecord["source_type"], string> = { upload: "Upload", qogita: "Qogita", manual: "Manual", stock: "From Stock" };
const yn = (b: boolean | null) => (b == null ? "—" : b ? "yes" : "no");

/** The supplier ledger: one record per supplier, with how its products screen. */
export default function SuppliersPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [onlyStock, setOnlyStock] = useState(false);
  useEffect(() => {
    api<{ suppliers: Row[] }>("/api/suppliers?stats=1").then((r) => setRows(r.suppliers)).catch((e) => setError(e.message));
  }, []);
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (rows ?? []).filter((s) => (!n || s.name.toLowerCase().includes(n) || (s.marketplace ?? "").toLowerCase().includes(n) || s.stats.brands.some((b) => b.brand.toLowerCase().includes(n)))
      && (!kind || (kind === "none" ? !s.kind : s.kind === kind)) && (!onlyStock || stockOnly(s)));
  }, [rows, q, kind, onlyStock]);

  const header = (
    <PageHeader
      title="Suppliers"
      crumbs={[{ label: "Wholesale", href: "/runs" }, { label: "Suppliers" }]}
      subtitle="One record per supplier: terms, paperwork and how their products screen on your default profile."
      info={<>
        <p>A supplier&apos;s MOV counts in the budget gate for lines with no MOQ of their own.</p>
        <p>Suppliers added from Stock (an item, an order, a receipt) have no price lists: <b>Stock only</b> shows them.</p>
      </>}
    />
  );
  const columns: DataColumn<Row>[] = [
    {
      id: "supplier", header: "Supplier", mobile: "title", sortValue: (s) => s.name,
      cell: (s) => <>
        <Link className="font-medium hover:underline" href={`/suppliers/${s.id}`}>{s.name}</Link>
        {s.website && <a className="ml-1 inline-block text-muted-foreground" href={s.website} target="_blank" rel="noreferrer" aria-label="Website"><ExternalLinkIcon className="size-3" /></a>}
        <p className="text-xs font-normal text-muted-foreground">{SOURCE[s.source_type]}{s.stats.lastSeen ? ` · last offer ${when(s.stats.lastSeen)}` : ""}</p>
      </>,
    },
    { id: "type", header: "Type", mobile: 3, sortValue: (s) => (s.kind ? `${SUPPLIER_KIND_LABEL[s.kind]} ${s.marketplace ?? ""}` : null), cell: (s) => <span className="text-meta">{s.kind ? <>{SUPPLIER_KIND_LABEL[s.kind]}{s.marketplace ? <span className="text-muted-foreground"> · {s.marketplace}</span> : null}</> : <span className="text-muted-foreground">—</span>}</span> },
    { id: "stock", header: <span title="Stock items · purchases">Stock</span>, numeric: true, sortValue: (s) => s.stock.items * 1000 + s.stock.purchases, cell: (s) => (s.stock.items || s.stock.purchases ? `${s.stock.items} · ${s.stock.purchases}` : <span className="text-muted-foreground">—</span>) },
    { id: "runs", header: "Runs", numeric: true, sortValue: (s) => s.stats.runs, cell: (s) => s.stats.runs },
    { id: "products", header: "Products", numeric: true, mobile: 1, sortValue: (s) => s.stats.products, cell: (s) => s.stats.products.toLocaleString("en-GB") },
    {
      id: "passing", header: <span title="On your default profile">Buy / Check</span>, numeric: true, mobile: 2, sortValue: (s) => s.stats.pass * 1000 + s.stats.warn,
      cell: (s) => <>
        <span className={s.stats.pass ? "font-semibold text-success" : "text-muted-foreground"}>{s.stats.pass}</span>
        <span className="text-muted-foreground"> / </span>
        <span className={s.stats.warn ? "text-warn-ink" : "text-muted-foreground"}>{s.stats.warn}</span>
      </>,
    },
    {
      id: "brands", header: "Brands", className: "max-w-72", sortValue: (s) => s.stats.brands[0]?.brand ?? null,
      cell: (s) => <span className="text-meta text-muted-foreground">{s.stats.brands.slice(0, 3).map((b) => b.brand).join(", ") || "—"}{s.stats.brands.length > 3 && ` +${s.stats.brands.length - 3}`}</span>,
    },
    {
      id: "terms", header: "Terms", sortValue: (s) => s.mov,
      cell: (s) => <span className="text-meta text-muted-foreground">{s.currency} · {s.vat_basis === "inc_vat" ? "inc VAT" : "ex VAT"}{s.mov != null && ` · MOV ${s.mov.toLocaleString("en-GB")}`}{s.delivery_days != null && ` · ${s.delivery_days} days`}</span>,
    },
    {
      id: "paperwork", header: <span title="Importer of record · labelling · invoice accepted for brand approval">Paperwork</span>, sortValue: (s) => (s.importer_of_record ? 1 : 0) + (s.invoice_accepted_for_approval ? 1 : 0),
      cell: (s) => <span className="text-meta text-muted-foreground">IoR {yn(s.importer_of_record)} · {s.labelling ?? "—"} · invoice {yn(s.invoice_accepted_for_approval)}</span>,
    },
    { id: "rating", header: "Rating", numeric: true, sortValue: (s) => s.rating || null, cell: (s) => (s.rating ? <span className="text-warn-ink" aria-label={`${s.rating} of 5`}>{"★".repeat(s.rating)}</span> : <span className="text-muted-foreground">—</span>) },
  ];

  if (error) return <div className="space-y-5">{header}<ErrorState title="Couldn't load suppliers" message={error} onRetry={() => window.location.reload()} /></div>;
  if (!rows) return <div className="space-y-5">{header}<TableSkeleton rows={8} columns={7} /></div>;

  return (
    <div className="space-y-5">
      {header}
      {!rows.length ? (
        <EmptyState icon={<TruckIcon />} title="No suppliers yet" action={<Button asChild><Link href="/new-run"><UploadIcon /> Upload a price list</Link></Button>}>
          Suppliers appear with your first upload or Qogita pull, or add one from Stock.
        </EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-72 max-w-full">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8" placeholder="Find a supplier or brand" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a supplier or brand" />
            </div>
            <NativeSelect value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Type">
              <NativeSelectOption value="">All types</NativeSelectOption>
              {SUPPLIER_KINDS.map((k) => <NativeSelectOption key={k} value={k}>{SUPPLIER_KIND_LABEL[k]}</NativeSelectOption>)}
              <NativeSelectOption value="none">Type not set</NativeSelectOption>
            </NativeSelect>
            <ChipToggle pressed={onlyStock} onPressedChange={setOnlyStock}>
              Stock only · {rows.filter(stockOnly).length}
            </ChipToggle>
            <span className="num text-meta text-muted-foreground">{filtered.length} of {rows.length}</span>
          </div>
          <DataTable
            rows={filtered}
            columns={columns}
            getRowId={(s) => s.id}
            storageKey="wholesale.suppliers"
            caption="Suppliers"
            empty={{ icon: <SearchIcon />, title: "No suppliers match", description: "Try another name or brand, or clear the filters." }}
          />
        </>
      )}
    </div>
  );
}
