"use client";

import { DownloadIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { usePageCrumbs } from "@/components/Crumbs";
import { useDialogs } from "@/components/Dialogs";
import { AuditTable, deleteConsequence, EditMovementDialog, NegativeChip, type AuditRow } from "@/components/stock/corrections";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SortTh, useSortable } from "@/components/SortableTable";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { BUCKET_LABEL, BUCKETS, KIND_LABEL, MOVEMENT_KINDS, type Bucket, type MovementKind } from "@/lib/stock/levels";
import { OrderLink } from "@/components/stock/orderBits";
import { trackingText } from "@/lib/stock/orders";
import { api } from "@/lib/ui/client";
import { cn } from "@/lib/utils";

interface Row {
  id: string; item_id: string; bucket: Bucket; quantity: number; kind: MovementKind; date: string; reason: string | null; unit_cost: number | null; note: string | null; created_at: string;
  sale_id: string | null; purchase_id: string | null; transfer_id: string | null; negative: boolean;
  order_id: string | null; order_url: string | null; tracking_carrier: string | null; tracking_number: string | null; currency: string | null; unit_cost_ccy: number | null;
  item: { sku: string; name: string } | null; supplier: { id: string; name: string } | null;
}

/**
 * Stock → Movements: the ledger every level is the sum of, filtered and exported as CSV. Each row
 * can be edited or deleted (with what goes with it); several deleted at once; and the Audit log
 * lists every edit and delete.
 */
export default function StockMovementsPage() {
  usePageCrumbs([{ label: "Stock", href: "/stock/levels" }, { label: "Movements" }]);
  const [f, setF] = useState(() => ({ item: typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("item") ?? "", bucket: "", kind: "", from: "", to: "" }));
  const [rows, setRows] = useState<Row[] | null>(null);
  const [items, setItems] = useState<{ id: string; sku: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"ledger" | "audit">(() => (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("view") === "audit" ? "audit" : "ledger"));
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Row | null>(null);
  const { confirm } = useDialogs();
  const query = useMemo(() => new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString(), [f]);
  useEffect(() => { api<{ items: { item: { id: string; sku: string; name: string } }[] }>("/api/stock/levels").then((r) => setItems(r.items.map((i) => i.item))).catch(() => {}); }, []);
  const load = useCallback(() => {
    api<{ movements: Row[] }>(`/api/stock/movements?${query}`).then((r) => { setRows(r.movements); setSelected((sel) => new Set([...sel].filter((id) => r.movements.some((m) => m.id === id)))); }).catch((e: Error) => setError(e.message));
  }, [query]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (view === "audit") api<{ audit: AuditRow[] }>("/api/stock/audit").then((r) => setAudit(r.audit)).catch((e: Error) => toast.error(e.message)); }, [view, rows]);
  const s = useSortable("stock.movements", rows ?? [], {
    date: { value: (r) => r.date, kind: "date" }, item: { value: (r) => r.item?.sku ?? "" }, bucket: { value: (r) => BUCKET_LABEL[r.bucket] }, kind: { value: (r) => KIND_LABEL[r.kind] },
    quantity: { value: (r) => r.quantity, kind: "number" }, reason: { value: (r) => r.reason }, order: { value: (r) => r.order_id ?? (r.order_url ? "order" : null) }, supplier: { value: (r) => r.supplier?.name ?? null }, unitCost: { value: (r) => r.unit_cost, kind: "number" }, note: { value: (r) => r.note },
  }, { key: "date", dir: "desc" });
  if (error) return <ErrorState title="Couldn't load the movements" message={error} />;
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const remove = async (r: Row) => {
    if (!(await confirm({ title: `Delete this ${KIND_LABEL[r.kind].toLowerCase()}?`, description: `${r.quantity > 0 ? "+" : ""}${r.quantity} × ${r.item?.sku ?? "item"} in ${BUCKET_LABEL[r.bucket]} on ${r.date}. ${deleteConsequence(r)} The audit log keeps a copy.`, confirmLabel: "Delete", destructive: true }))) return;
    try {
      const res = await api<{ deleted: number; notes: string[] }>(`/api/stock/movements/${r.id}`, { method: "DELETE" });
      toast.success(`Deleted${res.notes.length ? `, with ${res.notes.join("; ")}` : ""}`);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const removeSelected = async () => {
    const ids = [...selected];
    if (!(await confirm({ title: `Delete ${ids.length} movement${ids.length === 1 ? "" : "s"}?`, description: "Each takes what goes with it: a sale's sale (and its returns), a transfer's other half; a receipt from an order sets the order back to Ordered. The levels become the sum of what's left. The audit log keeps a copy of each.", confirmLabel: `Delete ${ids.length}`, destructive: true }))) return;
    try {
      const res = await api<{ deleted: number; notes: string[] }>("/api/stock/movements", { method: "POST", json: { deleteIds: ids } });
      toast.success(`${res.deleted} movement${res.deleted === 1 ? "" : "s"} deleted${res.notes.length ? ` (${res.notes.join("; ")})` : ""}`);
      setSelected(new Set());
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const shownIds = s.rows.map((r) => r.id);
  const allShown = shownIds.length > 0 && shownIds.every((id) => selected.has(id));
  const toggle = (id: string) => setSelected((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const negatives = (rows ?? []).filter((r) => r.negative).length;
  return (
    <div className="space-y-4">
      <div className="max-w-3xl">
        <h1 className="page-title">Movements</h1>
        <p className="text-sm text-muted-foreground">Every receipt, sale, return, adjustment and transfer, signed into or out of its bucket. The levels are their sums. Amazon FBA follows SP-API, so FBA has no movements here. A mistake? Edit or delete the row: the levels follow. Every change is in the Audit log.</p>
      </div>
      <ToggleGroup type="single" variant="outline" size="sm" value={view} onValueChange={(v) => v && setView(v as "ledger" | "audit")}>
        <ToggleGroupItem value="ledger">Ledger</ToggleGroupItem>
        <ToggleGroupItem value="audit">Audit log</ToggleGroupItem>
      </ToggleGroup>
      {view === "audit" ? (audit ? <AuditTable rows={audit} /> : <Skeleton className="h-48 rounded-lg" />) : <>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1"><span className="field-label">Item</span>
          <NativeSelect value={f.item} onChange={(e) => set({ item: e.target.value })} className="max-w-xs">
            <NativeSelectOption value="">All items</NativeSelectOption>
            {items.map((i) => <NativeSelectOption key={i.id} value={i.id}>{i.sku} · {i.name.slice(0, 40)}</NativeSelectOption>)}
          </NativeSelect></label>
        <label className="space-y-1"><span className="field-label">Bucket</span>
          <NativeSelect value={f.bucket} onChange={(e) => set({ bucket: e.target.value })}>
            <NativeSelectOption value="">All</NativeSelectOption>
            {BUCKETS.map((b) => <NativeSelectOption key={b} value={b}>{BUCKET_LABEL[b]}</NativeSelectOption>)}
          </NativeSelect></label>
        <label className="space-y-1"><span className="field-label">Kind</span>
          <NativeSelect value={f.kind} onChange={(e) => set({ kind: e.target.value })}>
            <NativeSelectOption value="">All</NativeSelectOption>
            {MOVEMENT_KINDS.map((k) => <NativeSelectOption key={k} value={k}>{KIND_LABEL[k]}</NativeSelectOption>)}
          </NativeSelect></label>
        <label className="space-y-1"><span className="field-label">From</span><Input type="date" className="h-9 w-auto" value={f.from} onChange={(e) => set({ from: e.target.value })} /></label>
        <label className="space-y-1"><span className="field-label">To</span><Input type="date" className="h-9 w-auto" value={f.to} onChange={(e) => set({ to: e.target.value })} /></label>
        <Button variant="outline" asChild className="ml-auto"><a href={`/api/stock/movements?${query}${query ? "&" : ""}format=csv`}><DownloadIcon /> Export CSV</a></Button>
      </div>
      {(selected.size > 0 || negatives > 0) && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {selected.size > 0 && <><span>{selected.size} selected</span><Button size="sm" variant="outline" className="text-fail hover:text-fail" onClick={removeSelected}><Trash2Icon /> Delete selected</Button><button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => setSelected(new Set())}>Clear</button></>}
          {negatives > 0 && <span className="text-xs text-fail">{negatives} row{negatives === 1 ? "" : "s"} leave{negatives === 1 ? "s" : ""} a bucket below 0: correct them (edit, receive or adjust).</span>}
        </div>
      )}
      {!rows ? <Skeleton className="h-48 rounded-lg" /> : !rows.length ? <p className="text-sm text-muted-foreground">No movements match.</p> : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-[11px] tracking-wide text-muted-foreground uppercase">
              <th className="w-8 px-2 py-1.5"><input type="checkbox" aria-label="Select all shown" checked={allShown} onChange={() => setSelected(allShown ? new Set() : new Set(shownIds))} /></th>
              <SortTh {...s.th("date")} className="px-2 py-1.5">Date</SortTh>
              <SortTh {...s.th("item")} className="px-2 py-1.5">Item</SortTh>
              <SortTh {...s.th("bucket")} className="px-2 py-1.5">Bucket</SortTh>
              <SortTh {...s.th("kind")} className="px-2 py-1.5">Kind</SortTh>
              <SortTh {...s.th("quantity")} numeric className="px-2 py-1.5 text-right">Quantity</SortTh>
              <SortTh {...s.th("reason")} className="px-2 py-1.5">Reason</SortTh>
              <SortTh {...s.th("unitCost")} numeric className="px-2 py-1.5 text-right">Unit cost</SortTh>
              <SortTh {...s.th("order")} className="px-2 py-1.5">Order</SortTh>
              <SortTh {...s.th("supplier")} className="px-2 py-1.5">Supplier</SortTh>
              <SortTh {...s.th("note")} className="px-2 py-1.5">Note</SortTh>
              <th className="px-2 py-1.5" />
            </tr></thead>
            <tbody>{s.rows.map((r) => (
              <tr key={r.id} className={cn("border-b last:border-b-0", selected.has(r.id) && "bg-brand-soft/30", r.negative && "bg-fail-soft/30")}>
                <td className="px-2 py-1.5"><input type="checkbox" aria-label="Select" checked={selected.has(r.id)} onChange={() => toggle(r.id)} /></td>
                <td className="px-2 py-1.5 whitespace-nowrap">{r.date}</td>
                <td className="px-2 py-1.5"><span className="num">{r.item?.sku}</span> <span className="text-xs text-muted-foreground">{r.item?.name.slice(0, 50)}</span></td>
                <td className="px-2 py-1.5">{BUCKET_LABEL[r.bucket]}</td>
                <td className="px-2 py-1.5">{KIND_LABEL[r.kind]}</td>
                <td className={cn("num px-2 py-1.5 text-right font-medium whitespace-nowrap", r.quantity > 0 ? "text-pass" : "text-fail")}>{r.quantity > 0 ? `+${r.quantity}` : r.quantity}{r.negative && <NegativeChip title={`${BUCKET_LABEL[r.bucket]} is below 0 after this movement`} />}</td>
                <td className="px-2 py-1.5 text-xs">{r.reason ?? "—"}</td>
                <td className="num px-2 py-1.5 text-right">{r.unit_cost != null ? `£${Number(r.unit_cost).toFixed(2)}` : "—"}{r.currency && r.unit_cost_ccy != null && <span className="block text-2xs text-muted-foreground">{r.currency} {Number(r.unit_cost_ccy).toFixed(2)}</span>}</td>
                <td className="px-2 py-1.5 text-xs"><OrderLink id={r.order_id} url={r.order_url} />{trackingText(r.tracking_carrier, r.tracking_number) && <span className="block text-2xs text-muted-foreground">{trackingText(r.tracking_carrier, r.tracking_number)}</span>}</td>
                <td className="px-2 py-1.5 text-xs">{r.supplier ? <a className="hover:underline" href={`/suppliers/${r.supplier.id}`}>{r.supplier.name}</a> : ""}</td>
                <td className="px-2 py-1.5 text-xs text-muted-foreground">{r.note ?? ""}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  <button type="button" aria-label="Edit" title="Edit" onClick={() => setEditing(r)}><PencilIcon className="size-3.5 text-muted-foreground hover:text-foreground" /></button>
                  <button type="button" aria-label="Delete" title="Delete" className="ml-2" onClick={() => remove(r)}><Trash2Icon className="size-3.5 text-muted-foreground hover:text-fail" /></button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      </>}
      {editing && <EditMovementDialog m={editing} onClose={() => setEditing(null)} onDone={load} />}
    </div>
  );
}
