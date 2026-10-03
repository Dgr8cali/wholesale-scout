"use client";

import { ExternalLinkIcon, PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { CURRENCIES, MARKETPLACES, SUPPLIER_KIND_LABEL, SUPPLIER_KINDS, type OrderInput, type SupplierKind } from "@/lib/stock/orders";
import { api } from "@/lib/ui/client";
import { cn } from "@/lib/utils";

export interface SupplierOption { id: string; name: string; kind: SupplierKind | null; marketplace: string | null; delivery_days: number | null }

export const supplierLabel = (s: { name: string; kind?: SupplierKind | null; marketplace?: string | null; delivery_days?: number | null }) =>
  `${s.name}${s.kind === "marketplace" && s.marketplace ? ` (${s.marketplace})` : ""}${s.delivery_days ? ` · ${s.delivery_days} days` : ""}`;

/** The supplier's order number, a link when its page is known. */
export function OrderLink({ id, url, className }: { id: string | null | undefined; url: string | null | undefined; className?: string }) {
  if (!id && !url) return null;
  if (!url) return <span className={cn("num", className)}>{id}</span>;
  return (
    <a className={cn("num inline-flex items-center gap-0.5 text-brand hover:underline", className)} href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
      {id || "Order"} <ExternalLinkIcon className="size-3" />
    </a>
  );
}

/**
 * Pick a supplier, or add one here: "+ New supplier" opens a short form (name, type, marketplace,
 * website, contact, lead time, notes); saving creates it and selects it.
 */
export function SupplierPicker({ value, onChange, className }: { value: string; onChange: (id: string, s: SupplierOption | null) => void; className?: string }) {
  const [list, setList] = useState<SupplierOption[]>([]);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: "", kind: "", marketplace: "", website: "", contact: "", leadTimeDays: "", notes: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<{ suppliers: SupplierOption[] }>("/api/suppliers").then((r) => setList(r.suppliers)).catch(() => {}); }, []);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const create = async () => {
    setBusy(true);
    try {
      const r = await api<{ supplier: SupplierOption; existed: boolean }>("/api/suppliers", { method: "POST", json: f });
      setList((l) => (l.some((s) => s.id === r.supplier.id) ? l : [...l, r.supplier].sort((a, b) => a.name.localeCompare(b.name))));
      onChange(r.supplier.id, r.supplier);
      toast.success(r.existed ? `${r.supplier.name} is already a supplier: selected` : `${r.supplier.name} added`);
      setAdding(false);
      setF({ name: "", kind: "", marketplace: "", website: "", contact: "", leadTimeDays: "", notes: "" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex gap-1.5">
        <NativeSelect className="w-full min-w-0" value={value} onChange={(e) => onChange(e.target.value, list.find((s) => s.id === e.target.value) ?? null)} aria-label="Supplier">
          <NativeSelectOption value="">None</NativeSelectOption>
          {list.map((s) => <NativeSelectOption key={s.id} value={s.id}>{supplierLabel(s)}</NativeSelectOption>)}
        </NativeSelect>
        <Button type="button" size="sm" variant="outline" className="flex-none" onClick={() => setAdding((a) => !a)}><PlusIcon /> New supplier</Button>
      </div>
      {adding && (
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-dashed p-2.5">
          <label className="col-span-2 space-y-0.5"><span className="field-label">Name</span><Input className="h-8" value={f.name} onChange={(e) => set({ name: e.target.value })} autoFocus /></label>
          <label className="space-y-0.5"><span className="field-label">Type</span>
            <NativeSelect className="h-8 w-full" value={f.kind} onChange={(e) => set({ kind: e.target.value })}>
              <NativeSelectOption value="">—</NativeSelectOption>
              {SUPPLIER_KINDS.map((k) => <NativeSelectOption key={k} value={k}>{SUPPLIER_KIND_LABEL[k]}</NativeSelectOption>)}
            </NativeSelect></label>
          {f.kind === "marketplace"
            ? <label className="space-y-0.5"><span className="field-label">Marketplace</span><Input className="h-8" list="stock-marketplaces" placeholder="Alibaba, 1688, eBay…" value={f.marketplace} onChange={(e) => set({ marketplace: e.target.value })} />
                <datalist id="stock-marketplaces">{MARKETPLACES.map((m) => <option key={m} value={m} />)}</datalist></label>
            : <label className="space-y-0.5"><span className="field-label">Lead time (days)</span><Input className="num h-8" type="number" min={0} value={f.leadTimeDays} onChange={(e) => set({ leadTimeDays: e.target.value })} /></label>}
          <label className="space-y-0.5"><span className="field-label">Website</span><Input className="h-8" placeholder="https://…" value={f.website} onChange={(e) => set({ website: e.target.value })} /></label>
          <label className="space-y-0.5"><span className="field-label">Contact</span><Input className="h-8" placeholder="Name, email, phone" value={f.contact} onChange={(e) => set({ contact: e.target.value })} /></label>
          {f.kind === "marketplace" && <label className="space-y-0.5"><span className="field-label">Lead time (days)</span><Input className="num h-8" type="number" min={0} value={f.leadTimeDays} onChange={(e) => set({ leadTimeDays: e.target.value })} /></label>}
          <label className={cn("space-y-0.5", f.kind === "marketplace" ? "" : "col-span-2")}><span className="field-label">Notes</span><Input className="h-8" value={f.notes} onChange={(e) => set({ notes: e.target.value })} /></label>
          <div className="col-span-2 flex justify-end gap-1.5">
            <Button type="button" size="xs" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            <Button type="button" size="xs" disabled={busy || !f.name.trim()} onClick={create}>Add supplier</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The order fields as a form holds them (strings). */
export interface OrderDraft { orderId: string; orderUrl: string; orderedDate: string; expectedDate: string; trackingCarrier: string; trackingNumber: string; currency: string; fxRate: string }
export const emptyOrder = (orderedDate = ""): OrderDraft => ({ orderId: "", orderUrl: "", orderedDate, expectedDate: "", trackingCarrier: "", trackingNumber: "", currency: "GBP", fxRate: "" });
/** For the API: blanks as null. */
export const orderJson = (o: OrderDraft): OrderInput => ({
  orderId: o.orderId || null, orderUrl: o.orderUrl || null, orderedDate: o.orderedDate || null, expectedDate: o.expectedDate || null,
  trackingCarrier: o.trackingCarrier || null, trackingNumber: o.trackingNumber || null, currency: o.currency || "GBP", fxRate: o.fxRate === "" ? null : o.fxRate,
});

/** Order number and link, dates, tracking, and the currency with its rate when not GBP. */
export function OrderFields({ value, onChange, expected = true, ordered = true }: { value: OrderDraft; onChange: (o: OrderDraft) => void; expected?: boolean; ordered?: boolean }) {
  const set = (p: Partial<OrderDraft>) => onChange({ ...value, ...p });
  return (
    <>
      <label className="space-y-1"><span className="field-label">Order id</span><Input className="num" placeholder="The supplier's order or reference number" value={value.orderId} onChange={(e) => set({ orderId: e.target.value })} /></label>
      <label className="space-y-1"><span className="field-label">Order link</span><Input placeholder="https://… (the order on their site)" value={value.orderUrl} onChange={(e) => set({ orderUrl: e.target.value })} /></label>
      {ordered && <label className="space-y-1"><span className="field-label">Ordered on</span><Input type="date" value={value.orderedDate} onChange={(e) => set({ orderedDate: e.target.value })} /></label>}
      {expected && <label className="space-y-1"><span className="field-label">Expected</span><Input type="date" value={value.expectedDate} onChange={(e) => set({ expectedDate: e.target.value })} /></label>}
      <label className="space-y-1"><span className="field-label">Carrier</span><Input placeholder="Royal Mail, DPD, DHL…" value={value.trackingCarrier} onChange={(e) => set({ trackingCarrier: e.target.value })} /></label>
      <label className="space-y-1"><span className="field-label">Tracking number</span><Input className="num" value={value.trackingNumber} onChange={(e) => set({ trackingNumber: e.target.value })} /></label>
      <label className="space-y-1"><span className="field-label">Currency</span>
        <NativeSelect className="w-full" value={value.currency} onChange={(e) => set({ currency: e.target.value, ...(e.target.value === "GBP" ? { fxRate: "" } : {}) })}>
          {CURRENCIES.map((c) => <NativeSelectOption key={c} value={c}>{c}</NativeSelectOption>)}
        </NativeSelect></label>
      {value.currency !== "GBP"
        ? <label className="space-y-1"><span className="field-label">£ per {value.currency} 1</span><Input className="num" type="number" step="any" min={0} placeholder={value.currency === "USD" ? "e.g. 0.79" : ""} value={value.fxRate} onChange={(e) => set({ fxRate: e.target.value })} /></label>
        : <span />}
    </>
  );
}
