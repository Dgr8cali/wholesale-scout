"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useDialogs } from "@/components/Dialogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { Purchase } from "@/lib/server/purchases";
import { PURCHASE_STATUSES, type PurchaseStatus } from "@/lib/tracker";
import { api, gbp } from "@/lib/ui/client";
import type { Actuals } from "@/lib/actuals";
import { PurchaseOutcome } from "./PurchaseOutcome";

export interface SupplierChoice { id: string | null; name: string; landedGbp: number | null; unitCostGbp: number | null }

/** Today in the UK, as YYYY-MM-DD. */
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });

/**
 * Your purchases of this product: record one (the app's prediction is frozen with it), move it
 * from ordered to live, and see how it's going against what was predicted.
 */
export function Tracker({ asin, suppliers, defaultLanded, openForm = false }: { asin: string; suppliers: SupplierChoice[]; defaultLanded: number | null; openForm?: boolean }) {
  const { confirm } = useDialogs();
  const [rows, setRows] = useState<(Purchase & { actuals?: Actuals | null })[] | null>(null);
  const [adding, setAdding] = useState(openForm);
  const [form, setForm] = useState({ units: "", landed: defaultLanded != null ? defaultLanded.toFixed(2) : "", supplier: suppliers[0]?.id ?? "", other: "", date: today(), note: "" });
  const [busy, setBusy] = useState(false);
  // Arrived from "Record a purchase": the form is open, and scrolled into view.
  useEffect(() => {
    if (openForm) setTimeout(() => document.getElementById("purchases")?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
  }, [openForm]);
  const load = useCallback(() => {
    api<{ purchases: (Purchase & { actuals?: Actuals | null })[] }>(`/api/purchases?asin=${asin}&actuals=1`).then((r) => setRows(r.purchases)).catch((e: Error) => toast.error(e.message));
  }, [asin]);
  useEffect(load, [load]);

  const chosen = suppliers.find((s) => (s.id ?? s.name) === form.supplier) ?? null;
  async function save() {
    setBusy(true);
    try {
      await api("/api/purchases", {
        method: "POST",
        json: {
          asin, units: Number(form.units), landedGbp: Number(form.landed.replace(",", ".")), orderedOn: form.date, note: form.note || null,
          supplierId: form.supplier === "__other" ? null : chosen?.id ?? null,
          supplierName: form.supplier === "__other" ? form.other : chosen?.name ?? null,
          unitCostGbp: form.supplier === "__other" ? null : chosen?.unitCostGbp ?? null,
        },
      });
      toast.success("Recorded, with the app's prediction as it stands now");
      setAdding(false);
      setForm((f) => ({ ...f, units: "", note: "" }));
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function move(p: Purchase, status: PurchaseStatus) {
    try {
      await api(`/api/purchases/${p.id}`, { method: "PATCH", json: { status } });
      load();
    } catch (e) { toast.error((e as Error).message); }
  }
  async function remove(p: Purchase) {
    if (!(await confirm({ title: "Delete this purchase?", description: `${p.units} units on ${p.ordered_on}. Its frozen prediction goes with it.`, confirmLabel: "Delete", destructive: true }))) return;
    try { await api(`/api/purchases/${p.id}`, { method: "DELETE" }); load(); } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <section id="purchases" className="panel min-w-0 scroll-mt-16 space-y-3 p-4" aria-label="Your purchases">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="section-label">Your purchases <span>· the prediction is frozen when you record one, to compare with what happens</span></h2>
        {!adding && <Button variant="outline" size="sm" onClick={() => setAdding(true)}><PlusIcon /> Record a purchase</Button>}
      </div>

      {adding && (
        <div className="grid gap-2 rounded-lg bg-muted/60 p-3 sm:grid-cols-6">
          <label className="space-y-1"><span className="field-label">Units</span>
            <Input className="num" type="number" min={1} value={form.units} onChange={(e) => setForm({ ...form, units: e.target.value })} autoFocus /></label>
          <label className="space-y-1"><span className="field-label">Landed per unit (£)</span>
            <Input className="num" inputMode="decimal" value={form.landed} onChange={(e) => setForm({ ...form, landed: e.target.value })} /></label>
          <label className="space-y-1 sm:col-span-2"><span className="field-label">Supplier</span>
            <NativeSelect className="w-full" value={form.supplier} onChange={(e) => {
              const s = suppliers.find((x) => (x.id ?? x.name) === e.target.value);
              setForm({ ...form, supplier: e.target.value, landed: s?.landedGbp != null ? s.landedGbp.toFixed(2) : form.landed });
            }}>
              {suppliers.map((s) => <NativeSelectOption key={s.id ?? s.name} value={s.id ?? s.name}>{s.name}{s.landedGbp != null ? ` · ${gbp(s.landedGbp)} landed` : ""}</NativeSelectOption>)}
              <NativeSelectOption value="__other">Another supplier…</NativeSelectOption>
            </NativeSelect></label>
          <label className="space-y-1"><span className="field-label">Ordered on</span>
            <Input className="num" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
          {form.supplier === "__other"
            ? <label className="space-y-1"><span className="field-label">Supplier name</span><Input value={form.other} onChange={(e) => setForm({ ...form, other: e.target.value })} /></label>
            : <span />}
          <label className="space-y-1 sm:col-span-5"><span className="field-label">Note (optional)</span>
            <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. PO 1043, test order" /></label>
          <div className="flex items-end gap-2">
            <Button disabled={busy || !(Number(form.units) > 0) || !(Number(form.landed.replace(",", ".")) >= 0) || form.landed === ""} onClick={save}>Save purchase</Button>
            <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {rows == null ? <p className="text-sm text-muted-foreground">Loading…</p> : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Not bought yet. When you order it, record it here: the tracker then compares the prediction with Amazon&apos;s real sales, price and fees.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((p) => (
            <li key={p.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="num font-medium">{p.units} units × {gbp(p.landed_gbp)}</span>
                <span className="num text-muted-foreground">= {gbp(p.units * p.landed_gbp)}</span>
                <span>{p.supplier_name ?? "—"}</span>
                <span className="num text-muted-foreground">ordered {p.ordered_on}</span>
                <NativeSelect className="h-8 w-44" value={p.status} aria-label="Status" title={PURCHASE_STATUSES.filter((s) => p.status_dates[s.id]).map((s) => `${s.label}: ${p.status_dates[s.id]}`).join("\n")}
                  onChange={(e) => move(p, e.target.value as PurchaseStatus)}>
                  {PURCHASE_STATUSES.map((s) => <NativeSelectOption key={s.id} value={s.id}>{s.label}</NativeSelectOption>)}
                </NativeSelect>
                {p.status_dates[p.status] && <span className="num text-xs text-muted-foreground">since {p.status_dates[p.status]}</span>}
                <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label="Delete purchase" onClick={() => remove(p)}><Trash2Icon /></Button>
              </div>
              {p.note && <p className="mt-1 text-xs text-muted-foreground">{p.note}</p>}
              <PurchaseOutcome p={p} actuals={p.actuals ?? null} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
