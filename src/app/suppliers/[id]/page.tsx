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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { BestProduct, SupplierRecord, SupplierStats } from "@/lib/server/suppliers";
import { api, gbp, when } from "@/lib/ui/client";
import { Documents } from "@/components/documents/Documents";

interface Detail {
  supplier: SupplierRecord;
  stats: SupplierStats;
  best: BestProduct[];
  runs: { id: string; name: string | null; source: string; started_at: string; row_count: number }[];
}

const SOURCE: Record<SupplierRecord["source_type"], string> = { upload: "Uploaded price lists", qogita: "Qogita", manual: "Check ASINs / seller scans" };

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

      <Documents supplier={{ id: s.id, name: s.name }} />

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="space-y-2 lg:col-span-2" aria-label="Best products">
          <h2 className="text-sm font-semibold">Best products <span className="font-normal text-muted-foreground">· pass or warn, most room under the max landed cost</span></h2>
          {!data.best.length ? <p className="panel px-4 py-6 text-center text-sm text-muted-foreground">None of its costed products pass or warn on your default profile.</p> : (
            <div className="panel overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Product</TableHead>
                    <TableHead>Verdict</TableHead>
                    <TableHead className="text-right">Buy Box</TableHead>
                    <TableHead className="text-right">Landed</TableHead>
                    <TableHead className="text-right">Max landed</TableHead>
                    <TableHead className="pr-4 text-right">Room</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.best.map((b) => (
                    <TableRow key={b.productId}>
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
            <h2 className="text-sm font-semibold">Brands carried <span className="font-normal text-muted-foreground">{data.stats.brands.length}</span></h2>
            <div className="flex flex-wrap gap-1">
              {data.stats.brands.slice(0, 30).map((b) => <Badge key={b.brand} variant="outline" className="font-normal">{b.brand} <span className="num text-muted-foreground">{b.count}</span></Badge>)}
              {!data.stats.brands.length && <span className="text-sm text-muted-foreground">—</span>}
            </div>
          </section>
          <section className="panel space-y-2 p-4" aria-label="Runs">
            <h2 className="text-sm font-semibold">Runs</h2>
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
