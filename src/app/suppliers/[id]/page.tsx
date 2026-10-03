"use client";

import { CheckIcon, ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { usePageCrumbs } from "@/components/Crumbs";
import { ErrorState } from "@/components/States";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { SortTableHead, useSortable } from "@/components/SortableTable";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { BestProduct, SupplierOrder, SupplierRecord, SupplierStats } from "@/lib/server/suppliers";
import { OrderLink } from "@/components/stock/orderBits";
import { MARKETPLACES, SUPPLIER_KIND_LABEL, SUPPLIER_KINDS, trackingText } from "@/lib/stock/orders";
import { BUCKET_LABEL, type Bucket } from "@/lib/stock/levels";
import { PURCHASE_STATUSES } from "@/lib/tracker";
import { api, gbp, when } from "@/lib/ui/client";
import { Documents } from "@/components/documents/Documents";

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
      <Label className="text-xs text-muted-foreground" title={hint}>{label}</Label>
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
  const sorting = useSortable("wholesale.supplierProducts", data?.best ?? [], {
    product: { value: (b) => b.title ?? b.ean, kind: "text" },
    verdict: { value: (b) => `${b.verdict === "pass" ? 1 : b.verdict === "warn" ? 2 : 3} ${b.verdict}`, kind: "text" },
    buyBox: { value: (b) => b.buyBox, kind: "number" },
    landed: { value: (b) => b.landed, kind: "number" },
    maxLanded: { value: (b) => b.maxLanded, kind: "number" },
    room: { value: (b) => b.headroom, kind: "number" },
  });
  usePageCrumbs([{ label: "Suppliers", href: "/suppliers" }, { label: data?.supplier.name ?? "…" }]);

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2">
            {s.name}
            {s.website && <a className="text-brand" href={s.website} target="_blank" rel="noreferrer" aria-label="Website"><ExternalLinkIcon className="size-4" /></a>}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {SOURCE[s.source_type]} · {data.stats.runs} run{data.stats.runs === 1 ? "" : "s"} · {data.stats.products.toLocaleString("en-GB")} products seen
            {" · "}<span className="text-pass">{data.stats.pass} pass</span> · <span className="text-warn">{data.stats.warn} warn</span> on your default profile
          </p>
        </div>
        {saved && <span className="inline-flex items-center gap-1 text-xs text-pass"><CheckIcon className="size-3" /> Saved</span>}
      </div>

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
        <Field label="VAT basis of prices">
          <NativeSelect value={s.vat_basis} aria-label="VAT basis" onChange={(e) => save({ vat_basis: e.target.value as SupplierRecord["vat_basis"] })}>
            <NativeSelectOption value="ex_vat">Ex VAT</NativeSelectOption>
            <NativeSelectOption value="inc_vat">Inc VAT</NativeSelectOption>
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

      <Documents supplier={{ id: s.id, name: s.name }} />

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="min-w-0 space-y-2 lg:col-span-2" aria-label="Best products">
          <h2 className="section-label">Best products <span className="font-normal text-muted-foreground">· pass or warn, most room under the max landed cost</span></h2>
          {!data.best.length ? <p className="panel px-4 py-6 text-center text-sm text-muted-foreground">None of its costed products pass or warn on your default profile.</p> : (
            <div className="panel overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortTableHead {...sorting.th("product")} className="pl-4">Product</SortTableHead>
                    <SortTableHead {...sorting.th("verdict")}>Verdict</SortTableHead>
                    <SortTableHead {...sorting.th("buyBox")} numeric>Buy Box</SortTableHead>
                    <SortTableHead {...sorting.th("landed")} numeric>Landed</SortTableHead>
                    <SortTableHead {...sorting.th("maxLanded")} numeric>Max landed</SortTableHead>
                    <SortTableHead {...sorting.th("room")} numeric className="pr-4">Room</SortTableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorting.rows.map((b) => (
                    <TableRow key={b.productId} data-verdict={b.verdict}>
                      <TableCell className="max-w-80 pl-4 whitespace-normal">
                        <p className="line-clamp-2 text-sm">{b.title ?? b.ean}</p>
                        <p className="num text-2xs text-muted-foreground">{b.brand} · {b.asin ? <a className="text-brand hover:underline" href={`https://www.amazon.co.uk/dp/${b.asin}`} target="_blank" rel="noreferrer">{b.asin}</a> : b.ean}</p>
                      </TableCell>
                      <TableCell><Badge variant={b.verdict as "pass" | "warn"}>{b.verdict}</Badge></TableCell>
                      <TableCell className="num text-right">{gbp(b.buyBox)}</TableCell>
                      <TableCell className="num text-right">{gbp(b.landed)}</TableCell>
                      <TableCell className="num text-right">{gbp(b.maxLanded)}</TableCell>
                      <TableCell className="num pr-4 text-right font-medium text-pass">{gbp(b.headroom)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
        <div className="space-y-4">
          <section className="panel space-y-2 p-4" aria-label="Brands carried">
            <h2 className="section-label">Brands carried <span className="font-normal text-muted-foreground">{data.stats.brands.length}</span></h2>
            <div className="flex flex-wrap gap-1">
              {data.stats.brands.slice(0, 30).map((b) => <Badge key={b.brand} variant="outline" className="font-normal">{b.brand} <span className="num text-muted-foreground">{b.count}</span></Badge>)}
              {!data.stats.brands.length && <span className="text-sm text-muted-foreground">—</span>}
            </div>
          </section>
          <section className="panel space-y-2 p-4" aria-label="Runs">
            <h2 className="section-label">Runs</h2>
            <ul className="space-y-1 text-sm">
              {data.runs.map((r) => (
                <li key={r.id} className="flex items-baseline justify-between gap-2">
                  <Link className="min-w-0 truncate hover:underline" href={`/runs/${r.id}`}>{r.name || r.source}</Link>
                  <span className="flex-none text-xs text-muted-foreground">{when(r.started_at)}</span>
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
  const items = useSortable("suppliers.stockItems", data.stockItems, {
    item: { value: (i) => i.name, kind: "text" }, sku: { value: (i) => i.sku, kind: "text" }, cost: { value: (i) => i.unit_cost, kind: "number" },
  });
  const orders = useSortable("suppliers.orders", data.purchases, {
    date: { value: (p) => p.ordered_on, kind: "date" }, item: { value: (p) => p.item?.name ?? p.product?.title ?? p.asin, kind: "text" },
    order: { value: (p) => p.order_id, kind: "text" }, units: { value: (p) => p.units, kind: "number" }, landed: { value: (p) => p.landed_gbp, kind: "number" },
    status: { value: (p) => `${String(PURCHASE_STATUSES.findIndex((x) => x.id === p.status)).padStart(2, "0")}`, kind: "text" }, expected: { value: (p) => p.expected_date, kind: "date" },
  }, { key: "date", dir: "desc" });
  const receipts = useSortable("suppliers.receipts", data.receipts, {
    date: { value: (r) => r.date, kind: "date" }, item: { value: (r) => r.item?.name ?? "", kind: "text" }, order: { value: (r) => r.order_id, kind: "text" },
    quantity: { value: (r) => r.quantity, kind: "number" }, cost: { value: (r) => r.unit_cost, kind: "number" },
  }, { key: "date", dir: "desc" });
  if (!data.stockItems.length && !data.purchases.length && !data.receipts.length) {
    return <section className="panel px-4 py-3 text-sm text-muted-foreground" aria-label="Stock">No stock items, orders or receipts from this supplier yet. Pick it as an item&apos;s supplier, or on an order (Stock → Levels → Record a new order).</section>;
  }
  return (
    <section className="space-y-3" aria-label="Stock">
      <h2 className="section-label">Stock <span className="font-normal text-muted-foreground">· {data.stockItems.length} item{data.stockItems.length === 1 ? "" : "s"}, {data.purchases.length} order{data.purchases.length === 1 ? "" : "s"}</span></h2>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="panel overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <SortTableHead {...items.th("item")} className="pl-4">Item</SortTableHead>
              <SortTableHead {...items.th("cost")} numeric className="pr-4">Unit cost</SortTableHead>
            </TableRow></TableHeader>
            <TableBody>{items.rows.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="pl-4 whitespace-normal"><Link className="text-sm hover:underline" href={`/stock/levels?item=${i.id}`}>{i.name}</Link><p className="num text-2xs text-muted-foreground">{i.sku}{i.asin ? ` · ${i.asin}` : ""}{i.status === "discontinued" ? " · discontinued" : ""}</p></TableCell>
                <TableCell className="num pr-4 text-right">{gbp(i.unit_cost)}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
          {!data.stockItems.length && <p className="px-4 py-3 text-xs text-muted-foreground">No items name this supplier.</p>}
        </div>
        <div className="panel overflow-x-auto lg:col-span-2">
          <Table>
            <TableHeader><TableRow>
              <SortTableHead {...orders.th("date")} className="pl-4">Ordered</SortTableHead>
              <SortTableHead {...orders.th("item")}>Item</SortTableHead>
              <SortTableHead {...orders.th("order")}>Order</SortTableHead>
              <SortTableHead {...orders.th("units")} numeric>Units</SortTableHead>
              <SortTableHead {...orders.th("landed")} numeric>Landed</SortTableHead>
              <SortTableHead {...orders.th("status")} title="In pipeline order">Status</SortTableHead>
              <SortTableHead {...orders.th("expected")} className="pr-4">Expected</SortTableHead>
            </TableRow></TableHeader>
            <TableBody>{orders.rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="num pl-4">{p.ordered_on}</TableCell>
                <TableCell className="max-w-64 text-sm whitespace-normal">{p.stock_item_id ? <Link className="hover:underline" href={`/stock/levels?item=${p.stock_item_id}`}>{p.item?.name ?? p.asin}</Link> : <Link className="hover:underline" href={`/products/${p.asin}`}>{p.product?.title ?? p.asin}</Link>}</TableCell>
                <TableCell className="text-xs"><OrderLink id={p.order_id} url={p.order_url} />{trackingText(p.tracking_carrier, p.tracking_number) && <span className="block text-2xs text-muted-foreground">{trackingText(p.tracking_carrier, p.tracking_number)}</span>}</TableCell>
                <TableCell className="num text-right">{p.units}</TableCell>
                <TableCell className="num text-right">{gbp(p.landed_gbp)}{p.currency !== "GBP" && p.unit_cost_ccy != null && <span className="block text-2xs text-muted-foreground">{p.currency} {Number(p.unit_cost_ccy).toFixed(2)}</span>}</TableCell>
                <TableCell className="text-xs">{statusLabel(p.status)}</TableCell>
                <TableCell className="num pr-4 text-xs">{p.status === "ordered" ? p.expected_date ?? "—" : ""}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
          {!data.purchases.length && <p className="px-4 py-3 text-xs text-muted-foreground">No orders yet.</p>}
        </div>
      </div>
      {data.receipts.length > 0 && (
        <div className="panel overflow-x-auto">
          <p className="px-4 pt-3 text-xs text-muted-foreground">Receipts typed on Receive (not from an order in the Tracker):</p>
          <Table>
            <TableHeader><TableRow>
              <SortTableHead {...receipts.th("date")} className="pl-4">Received</SortTableHead>
              <SortTableHead {...receipts.th("item")}>Item</SortTableHead>
              <SortTableHead {...receipts.th("order")}>Order</SortTableHead>
              <SortTableHead {...receipts.th("quantity")} numeric>Quantity</SortTableHead>
              <SortTableHead {...receipts.th("cost")} numeric className="pr-4">Unit cost</SortTableHead>
            </TableRow></TableHeader>
            <TableBody>{receipts.rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="num pl-4">{r.date}</TableCell>
                <TableCell className="text-sm"><Link className="hover:underline" href={`/stock/levels?item=${r.item_id}`}>{r.item?.name ?? ""}</Link> <span className="text-2xs text-muted-foreground">into {BUCKET_LABEL[r.bucket as Bucket] ?? r.bucket}</span></TableCell>
                <TableCell className="text-xs"><OrderLink id={r.order_id} url={r.order_url} /></TableCell>
                <TableCell className="num text-right">{r.quantity}</TableCell>
                <TableCell className="num pr-4 text-right">{gbp(r.unit_cost)}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
