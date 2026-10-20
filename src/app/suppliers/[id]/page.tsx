"use client";

import { BoxIcon, CheckIcon, ExternalLinkIcon, PackageSearchIcon, TruckIcon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/States";
import { DataTable } from "@/components/ui/data-table";
import { SectionTitle } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductDecision, StatusChip } from "@/components/ui/status-chip";
import { Textarea } from "@/components/ui/textarea";
import type { BestProduct, SupplierOrder, SupplierRecord, SupplierStats } from "@/lib/server/suppliers";
import { OrderLink } from "@/components/stock/orderBits";
import { MARKETPLACES, SUPPLIER_KIND_LABEL, SUPPLIER_KINDS, trackingText } from "@/lib/stock/orders";
import { BUCKET_LABEL, type Bucket } from "@/lib/stock/levels";
import { PURCHASE_STATUSES } from "@/lib/tracker";
import { api, gbp, when } from "@/lib/ui/client";
import { DocumentUploader } from "@/components/documents/Documents";

interface Detail {
  supplier: SupplierRecord;
  stats: SupplierStats;
  best: BestProduct[];
  runs: { id: string; name: string | null; source: string; started_at: string; row_count: number }[];
  stockItems: { id: string; sku: string; name: string; asin: string | null; status: string; unit_cost: number | null }[];
  purchases: SupplierOrder[];
  receipts: { id: string; date: string; quantity: number; bucket: string; unit_cost: number | null; order_id: string | null; order_url: string | null; item_id: string; item: { sku: string; name: string } | null }[];
}

const SOURCE: Record<SupplierRecord["source_type"], string> = { upload: "Uploaded price lists", qogita: "Qogita", manual: "Check ASINs / seller scans", stock: "Added from Stock" };

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="field-label" title={hint}>{label}</Label>
      {children}
    </div>
  );
}

/** Yes / no / unknown for a boolean ledger field. */
function YesNo({ value, onChange, label }: { value: boolean | null; onChange: (v: boolean | null) => void; label: string }) {
  return (
    <NativeSelect value={value == null ? "" : value ? "yes" : "no"} aria-label={label} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value === "yes")}>
      <NativeSelectOption value="">Unknown</NativeSelectOption>
      <NativeSelectOption value="yes">Yes</NativeSelectOption>
      <NativeSelectOption value="no">No</NativeSelectOption>
    </NativeSelect>
  );
}

export default function SupplierPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(() => { api<Detail>(`/api/suppliers/${id}`).then(setData).catch((e) => setError(e.message)); }, [id]);
  useEffect(() => { load(); }, [load]);

  async function save(patch: Partial<SupplierRecord>) {
    try {
      const { supplier } = await api<{ supplier: SupplierRecord }>(`/api/suppliers/${id}`, { method: "PATCH", json: patch });
      setData((d) => d && { ...d, supplier });
      setSaved(Object.keys(patch)[0] ?? null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (error) return <ErrorState title="Couldn't load this supplier" message={error} onRetry={load} />;
  if (!data) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-72" /><Skeleton className="h-48" /></div>;
  const s = data.supplier;
  const text = (k: keyof SupplierRecord, placeholder?: string, type = "text") => (
    <Input type={type} defaultValue={(s[k] as string | number | null) ?? ""} placeholder={placeholder} aria-label={k}
      onBlur={(e) => e.target.value !== String(s[k] ?? "") && save({ [k]: e.target.value === "" ? null : type === "number" ? Number(e.target.value) : e.target.value } as Partial<SupplierRecord>)} />
  );

  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={[{ label: "Wholesale", href: "/runs" }, { label: "Suppliers", href: "/suppliers" }, { label: s.name }]}
        title={<span className="flex items-center gap-2">
          {s.name}
          {s.website && <a className="text-primary" href={s.website} target="_blank" rel="noreferrer" aria-label="Website"><ExternalLinkIcon className="size-4" /></a>}
        </span>}
        subtitle={<>
          {SOURCE[s.source_type]} · {data.stats.runs} run{data.stats.runs === 1 ? "" : "s"} · {data.stats.products.toLocaleString("en-GB")} products seen
          {" · "}<span className="text-success">{data.stats.pass} Buy</span> · <span className="text-warn-ink">{data.stats.warn} Check</span> on your default profile
        </>}
        actions={saved ? <span className="inline-flex items-center gap-1 text-meta text-success" role="status"><CheckIcon className="size-3.5" /> Saved</span> : undefined}
      />

      <section className="panel grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Record">
        <Field label="Type">
          <NativeSelect value={s.kind ?? ""} aria-label="Type" onChange={(e) => save({ kind: (e.target.value || null) as SupplierRecord["kind"] })}>
            <NativeSelectOption value="">Not set</NativeSelectOption>
            {SUPPLIER_KINDS.map((k) => <NativeSelectOption key={k} value={k}>{SUPPLIER_KIND_LABEL[k]}</NativeSelectOption>)}
          </NativeSelect>
        </Field>
        {s.kind === "marketplace" ? (
          <Field label="Marketplace">
            <Input list="supplier-marketplaces" defaultValue={s.marketplace ?? ""} placeholder="Alibaba, 1688, eBay…" aria-label="Marketplace"
              onBlur={(e) => e.target.value !== (s.marketplace ?? "") && save({ marketplace: e.target.value || null })} />
            <datalist id="supplier-marketplaces">{MARKETPLACES.map((m) => <option key={m} value={m} />)}</datalist>
          </Field>
        ) : null}
        <Field label="Website">{text("website", "https://…")}</Field>
        <Field label="Contact">{text("contact", "Name, email, phone")}</Field>
        <Field label="Payment terms">{text("payment_terms", "e.g. pro forma, 30 days")}</Field>
        <Field label="Rating (1–5)">
          <NativeSelect value={s.rating ?? ""} aria-label="Rating" onChange={(e) => save({ rating: e.target.value ? Number(e.target.value) : null })}>
            <NativeSelectOption value="">Not rated</NativeSelectOption>
            {[1, 2, 3, 4, 5].map((n) => <NativeSelectOption key={n} value={n}>{"★".repeat(n)}</NativeSelectOption>)}
          </NativeSelect>
        </Field>
        <Field label="Supplier prices are" hint="Inc-VAT prices are divided by 1 + the VAT rate to the ex-VAT cost every profit uses (VAT registered: that's the cost; not: the VAT is added back as a cost).">
          <NativeSelect value={s.vat_basis} aria-label="VAT basis" onChange={(e) => save({ vat_basis: e.target.value as SupplierRecord["vat_basis"] })}>
            <NativeSelectOption value="ex_vat">ex-VAT</NativeSelectOption>
            <NativeSelectOption value="inc_vat">inc-VAT</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Field label="Currency">{text("currency", "GBP")}</Field>
        <Field label={`MOV (${s.currency})`} hint="Minimum order value. With no line MOQ, the budget gate sizes the first order to reach it.">{text("mov", "none", "number")}</Field>
        <Field label="Delivery (days)">{text("delivery_days", "—", "number")}</Field>
        <Field label="Importer of record"><YesNo label="Importer of record" value={s.importer_of_record} onChange={(v) => save({ importer_of_record: v })} /></Field>
        <Field label="Labelling">
          <NativeSelect value={s.labelling ?? ""} aria-label="Labelling" onChange={(e) => save({ labelling: (e.target.value || null) as SupplierRecord["labelling"] })}>
            <NativeSelectOption value="">Unknown</NativeSelectOption>
            <NativeSelectOption value="UK">UK</NativeSelectOption>
            <NativeSelectOption value="EU">EU</NativeSelectOption>
            <NativeSelectOption value="mixed">Mixed</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Field label="Invoice name matches your account"><YesNo label="Invoice name matches" value={s.invoice_name_matches} onChange={(v) => save({ invoice_name_matches: v })} /></Field>
        <Field label="Invoice accepted for brand approval"><YesNo label="Invoice accepted for approval" value={s.invoice_accepted_for_approval} onChange={(v) => save({ invoice_accepted_for_approval: v })} /></Field>
        <div className="sm:col-span-2">
          <Field label="Invoice notes">
            <Textarea rows={2} defaultValue={s.invoice_notes ?? ""} aria-label="Invoice notes" onBlur={(e) => e.target.value !== (s.invoice_notes ?? "") && save({ invoice_notes: e.target.value || null })} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Notes">
            <Textarea rows={2} defaultValue={s.notes ?? ""} aria-label="Notes" onBlur={(e) => e.target.value !== (s.notes ?? "") && save({ notes: e.target.value || null })} />
          </Field>
        </div>
      </section>

      <StockSection data={data} />

      <DocumentUploader supplier={{ id: s.id, name: s.name }} />

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="min-w-0 space-y-2 lg:col-span-2" aria-label="Best products">
          <SectionTitle title={<>Best products <span>· Buy or Check, most room under the max landed cost</span></>} />
          <DataTable
            rows={data.best}
            getRowId={(b) => b.productId}
            caption="Best products"
            storageKey="wholesale.supplierProducts"
            rowAttrs={(b) => ({ "data-verdict": b.verdict })}
            empty={{ icon: <PackageSearchIcon />, title: "No Buy or Check products", description: "None of its costed products pass or warn on your default profile." }}
            columns={[
              {
                id: "product", header: "Product", mobile: "title", className: "max-w-80", sortValue: (b) => b.title ?? b.ean,
                cell: (b) => <>
                  <p className="line-clamp-2 text-sm">{b.title ?? b.ean}</p>
                  <p className="num text-xs font-normal text-muted-foreground">{b.brand} · {b.asin ? <a className="text-primary hover:underline" href={`https://www.amazon.co.uk/dp/${b.asin}`} target="_blank" rel="noreferrer">{b.asin}</a> : b.ean}</p>
                </>,
              },
              { id: "verdict", header: "Verdict", mobile: 1, sortValue: (b) => (b.verdict === "pass" ? 1 : b.verdict === "warn" ? 2 : 3), cell: (b) => <ProductDecision verdict={b.verdict} /> },
              { id: "buyBox", header: "Buy Box", numeric: true, sortValue: (b) => b.buyBox, cell: (b) => gbp(b.buyBox) },
              { id: "landed", header: "Landed", numeric: true, mobile: 2, sortValue: (b) => b.landed, cell: (b) => gbp(b.landed) },
              { id: "maxLanded", header: "Max landed", numeric: true, sortValue: (b) => b.maxLanded, cell: (b) => gbp(b.maxLanded) },
              { id: "room", header: "Room", numeric: true, mobile: 3, sortValue: (b) => b.headroom, cell: (b) => <span className="font-medium text-success">{gbp(b.headroom)}</span> },
            ]}
          />
        </section>
        <div className="space-y-4">
          <section className="panel space-y-2 p-4" aria-label="Brands carried">
            <h2 className="section-label">Brands carried <span className="num">· {data.stats.brands.length}</span></h2>
            <div className="flex flex-wrap gap-1">
              {data.stats.brands.slice(0, 30).map((b) => <StatusChip key={b.brand} tone="neutral" icon={false} className="font-normal">{b.brand} <span className="num opacity-80">{b.count}</span></StatusChip>)}
              {!data.stats.brands.length && <span className="text-sm text-muted-foreground">—</span>}
            </div>
          </section>
          <section className="panel space-y-2 p-4" aria-label="Runs">
            <h2 className="section-label">Runs</h2>
            <ul className="space-y-1 text-sm">
              {data.runs.map((r) => (
                <li key={r.id} className="flex items-baseline justify-between gap-2">
                  <Link className="min-w-0 truncate hover:underline" href={`/runs/${r.id}`}>{r.name || r.source}</Link>
                  <span className="flex-none text-meta text-muted-foreground">{when(r.started_at)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

const statusLabel = (st: string) => PURCHASE_STATUSES.find((x) => x.id === st)?.label ?? st;

/** What Stock holds from this supplier: its items, its purchases (orders) and receipts typed on Receive. */
function StockSection({ data }: { data: Detail }) {
  if (!data.stockItems.length && !data.purchases.length && !data.receipts.length) {
    return <section className="panel px-4 py-3 text-sm text-muted-foreground" aria-label="Stock">No stock items, orders or receipts from this supplier yet. Pick it as an item&apos;s supplier, or on an order (Stock → Levels → Record a new order).</section>;
  }
  return (
    <section className="space-y-3" aria-label="Stock">
      <SectionTitle title={<>Stock <span>· {data.stockItems.length} item{data.stockItems.length === 1 ? "" : "s"}, {data.purchases.length} order{data.purchases.length === 1 ? "" : "s"}</span></>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <DataTable
          rows={data.stockItems}
          getRowId={(i) => i.id}
          caption="Stock items"
          storageKey="suppliers.stockItems"
          className="min-w-0 self-start"
          empty={{ icon: <BoxIcon />, title: "No items", description: "No items name this supplier." }}
          columns={[
            {
              id: "item", header: "Item", mobile: "title", sortValue: (i) => i.name,
              cell: (i) => <><Link className="text-sm hover:underline" href={`/stock/levels?item=${i.id}`}>{i.name}</Link><p className="num text-xs font-normal text-muted-foreground">{i.sku}{i.asin ? ` · ${i.asin}` : ""}{i.status === "discontinued" ? " · discontinued" : ""}</p></>,
            },
            { id: "cost", header: "Unit cost", numeric: true, mobile: 1, sortValue: (i) => i.unit_cost, cell: (i) => gbp(i.unit_cost) },
          ]}
        />
        <DataTable
          rows={data.purchases}
          getRowId={(p) => p.id}
          caption="Orders"
          storageKey="suppliers.orders"
          initialSort={{ id: "date", desc: true }}
          className="min-w-0 self-start lg:col-span-2"
          empty={{ icon: <TruckIcon />, title: "No orders yet", description: "Orders from this supplier show here once recorded in Stock." }}
          columns={[
            { id: "date", header: "Ordered", sortValue: (p) => p.ordered_on, cell: (p) => <span className="num whitespace-nowrap">{p.ordered_on}</span> },
            {
              id: "item", header: "Item", mobile: "title", className: "max-w-64", sortValue: (p) => p.item?.name ?? p.product?.title ?? p.asin,
              cell: (p) => (p.stock_item_id ? <Link className="hover:underline" href={`/stock/levels?item=${p.stock_item_id}`}>{p.item?.name ?? p.asin}</Link> : <Link className="hover:underline" href={`/products/${p.asin}`}>{p.product?.title ?? p.asin}</Link>),
            },
            {
              id: "order", header: "Order", sortValue: (p) => p.order_id,
              cell: (p) => <span className="text-meta"><OrderLink id={p.order_id} url={p.order_url} />{trackingText(p.tracking_carrier, p.tracking_number) && <span className="block text-xs text-muted-foreground">{trackingText(p.tracking_carrier, p.tracking_number)}</span>}</span>,
            },
            { id: "units", header: "Units", numeric: true, mobile: 2, sortValue: (p) => p.units, cell: (p) => p.units },
            { id: "landed", header: "Landed", numeric: true, mobile: 3, sortValue: (p) => p.landed_gbp, cell: (p) => <>{gbp(p.landed_gbp)}{p.currency !== "GBP" && p.unit_cost_ccy != null && <span className="block text-xs text-muted-foreground">{p.currency} {Number(p.unit_cost_ccy).toFixed(2)}</span>}</> },
            { id: "status", header: "Status", mobile: 1, sortValue: (p) => PURCHASE_STATUSES.findIndex((x) => x.id === p.status), cell: (p) => <span className="text-meta">{statusLabel(p.status)}</span> },
            { id: "expected", header: "Expected", sortValue: (p) => p.expected_date, cell: (p) => <span className="num text-meta">{p.status === "ordered" ? p.expected_date ?? "—" : ""}</span> },
          ]}
        />
      </div>
      {data.receipts.length > 0 && (
        <div className="space-y-2">
          <SectionTitle title="Receipts">Receipts typed on Receive (not from an order in the Tracker).</SectionTitle>
          <DataTable
            rows={data.receipts}
            getRowId={(r) => r.id}
            caption="Receipts"
            storageKey="suppliers.receipts"
            initialSort={{ id: "date", desc: true }}
            columns={[
              { id: "date", header: "Received", sortValue: (r) => r.date, cell: (r) => <span className="num whitespace-nowrap">{r.date}</span> },
              { id: "item", header: "Item", mobile: "title", sortValue: (r) => r.item?.name ?? "", cell: (r) => <><Link className="text-sm hover:underline" href={`/stock/levels?item=${r.item_id}`}>{r.item?.name ?? ""}</Link> <span className="text-xs font-normal text-muted-foreground">into {BUCKET_LABEL[r.bucket as Bucket] ?? r.bucket}</span></> },
              { id: "order", header: "Order", sortValue: (r) => r.order_id, cell: (r) => <span className="text-meta"><OrderLink id={r.order_id} url={r.order_url} /></span> },
              { id: "quantity", header: "Quantity", numeric: true, mobile: 1, sortValue: (r) => r.quantity, cell: (r) => r.quantity },
              { id: "cost", header: "Unit cost", numeric: true, mobile: 2, sortValue: (r) => r.unit_cost, cell: (r) => gbp(r.unit_cost) },
            ]}
          />
        </div>
      )}
    </section>
  );
}
