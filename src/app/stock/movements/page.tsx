"use client";

import { ArrowLeftRightIcon, DownloadIcon, MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { toast } from "sonner";
import { useDialogs } from "@/components/Dialogs";
import { AuditTable, deleteConsequence, EditMovementDialog, NegativeChip, type AuditRow } from "@/components/stock/corrections";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { BUCKET_LABEL, BUCKETS, KIND_LABEL, MOVEMENT_KINDS, type Bucket, type MovementKind } from "@/lib/stock/levels";
import { OrderLink } from "@/components/stock/orderBits";
import { trackingText } from "@/lib/stock/orders";
import { api } from "@/lib/ui/client";
import { cn } from "@/lib/utils";
import { TableSkeleton } from "@/components/ui/skeletons";

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
  if (error) return <ErrorState title="Couldn't load the movements" message={error} />;
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const remove = async (r: Row) => {
    if (!(await confirm({ title: `Delete the ${KIND_LABEL[r.kind].toLowerCase()} of ${r.quantity > 0 ? "+" : ""}${r.quantity} × ${r.item?.sku ?? "item"}?`, description: `${r.quantity > 0 ? "+" : ""}${r.quantity} × ${r.item?.sku ?? "item"} in ${BUCKET_LABEL[r.bucket]} on ${r.date}. ${deleteConsequence(r)} The audit log keeps a copy.`, confirmLabel: "Delete", destructive: true }))) return;
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
  const shownIds = (rows ?? []).map((r) => r.id);
  const allShown = shownIds.length > 0 && shownIds.every((id) => selected.has(id));
  const toggle = (id: string) => setSelected((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const negatives = (rows ?? []).filter((r) => r.negative).length;
  const stop = (e: MouseEvent) => e.stopPropagation();
  const columns: DataColumn<Row>[] = [
    {
      id: "select", mobileHidden: true, headerClassName: "w-8", className: "w-8",
      header: <input type="checkbox" aria-label="Select all" checked={allShown} onChange={() => setSelected(allShown ? new Set() : new Set(shownIds))} />,
      cell: (r) => <input type="checkbox" aria-label="Select" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />,
    },
    { id: "date", header: "Date", mobile: 1, sortValue: (r) => r.date, cell: (r) => <span className="num whitespace-nowrap">{r.date}</span> },
    { id: "item", header: "Item", mobile: "title", sortValue: (r) => r.item?.sku ?? "", cell: (r) => <span><span className="num">{r.item?.sku}</span> <span className="text-xs text-muted-foreground">{r.item?.name.slice(0, 50)}</span></span> },
    { id: "bucket", header: "Bucket", sortValue: (r) => BUCKET_LABEL[r.bucket], cell: (r) => BUCKET_LABEL[r.bucket] },
    { id: "kind", header: "Kind", mobile: 2, sortValue: (r) => KIND_LABEL[r.kind], cell: (r) => KIND_LABEL[r.kind] },
    {
      id: "quantity", header: "Quantity", numeric: true, mobile: 3, sortValue: (r) => r.quantity,
      cell: (r) => <span className={cn("font-medium whitespace-nowrap", r.quantity > 0 ? "text-success" : "text-danger")}>{r.quantity > 0 ? `+${r.quantity}` : r.quantity}{r.negative && <NegativeChip title={`${BUCKET_LABEL[r.bucket]} is below 0 after this movement`} />}</span>,
    },
    { id: "reason", header: "Reason", sortValue: (r) => r.reason, cell: (r) => <span className="text-meta">{r.reason ?? "—"}</span> },
    { id: "unitCost", header: "Unit cost", numeric: true, sortValue: (r) => r.unit_cost, cell: (r) => <>{r.unit_cost != null ? `£${Number(r.unit_cost).toFixed(2)}` : "—"}{r.currency && r.unit_cost_ccy != null && <span className="block text-xs text-muted-foreground">{r.currency} {Number(r.unit_cost_ccy).toFixed(2)}</span>}</> },
    { id: "order", header: "Order", sortValue: (r) => r.order_id ?? (r.order_url ? "order" : null), cell: (r) => <span className="text-meta"><OrderLink id={r.order_id} url={r.order_url} />{trackingText(r.tracking_carrier, r.tracking_number) && <span className="block text-xs text-muted-foreground">{trackingText(r.tracking_carrier, r.tracking_number)}</span>}</span> },
    { id: "supplier", header: "Supplier", sortValue: (r) => r.supplier?.name ?? null, cell: (r) => (r.supplier ? <Link className="text-meta hover:underline" href={`/suppliers/${r.supplier.id}`}>{r.supplier.name}</Link> : "") },
    { id: "note", header: "Note", sortValue: (r) => r.note, cell: (r) => <span className="text-meta text-muted-foreground">{r.note ?? ""}</span> },
    {
      id: "actions", header: "", className: "text-right",
      cell: (r) => (
        <span onClick={stop}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for this ${KIND_LABEL[r.kind].toLowerCase()}`}><MoreHorizontalIcon /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onSelect={() => setEditing(r)}><PencilIcon /> Edit</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => remove(r)}><Trash2Icon /> Delete…</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      ),
    },
  ];
  return (
    <div className="space-y-4">
      <PageHeader
        title="Movements"
        crumbs={[{ label: "Stock", href: "/stock/levels" }, { label: "Movements" }]}
        subtitle="Every receipt, sale, return, adjustment and transfer; the levels are their sums."
        info={<>
          <p>Each movement is signed into or out of its bucket, and the levels are their sums. Amazon FBA follows SP-API, so FBA has no movements here.</p>
          <p>A mistake? Edit or delete the row: the levels follow. Every change is in the Audit log.</p>
        </>}
        actions={view === "ledger" && <Button variant="secondary" asChild><a href={`/api/stock/movements?${query}${query ? "&" : ""}format=csv`}><DownloadIcon /> Export CSV</a></Button>}
      />
      <ToggleGroup type="single" variant="outline" size="sm" value={view} onValueChange={(v) => v && setView(v as "ledger" | "audit")}>
        <ToggleGroupItem value="ledger">Ledger</ToggleGroupItem>
        <ToggleGroupItem value="audit">Audit log</ToggleGroupItem>
      </ToggleGroup>
      {view === "audit" ? (audit ? <AuditTable rows={audit} /> : <TableSkeleton rows={6} columns={6} />) : <>
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
        <label className="space-y-1"><span className="field-label">From</span><Input type="date" className="w-auto" value={f.from} onChange={(e) => set({ from: e.target.value })} /></label>
        <label className="space-y-1"><span className="field-label">To</span><Input type="date" className="w-auto" value={f.to} onChange={(e) => set({ to: e.target.value })} /></label>
      </div>
      {(selected.size > 0 || negatives > 0) && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {selected.size > 0 && <><span>{selected.size} selected</span><Button size="sm" variant="danger" onClick={removeSelected}><Trash2Icon /> Delete selected</Button><Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button></>}
          {negatives > 0 && <span className="text-meta text-danger">{negatives} row{negatives === 1 ? "" : "s"} leave{negatives === 1 ? "s" : ""} a bucket below 0: correct them (edit, receive or adjust).</span>}
        </div>
      )}
      {!rows ? <TableSkeleton rows={8} columns={7} /> : (
        <DataTable
          rows={rows}
          columns={columns}
          getRowId={(r) => r.id}
          storageKey="stock.movements"
          caption="Stock movements"
          initialSort={{ id: "date", desc: true }}
          rowClassName={(r) => cn(selected.has(r.id) && "bg-primary-soft/30", r.negative && "bg-danger-soft/30")}
          empty={{ icon: <ArrowLeftRightIcon />, title: "No movements match", description: "Change the filters, or record a receipt, sale or adjustment from an item on Levels.", action: <Button variant="secondary" onClick={() => setF({ item: "", bucket: "", kind: "", from: "", to: "" })}>Clear filters</Button> }}
        />
      )}
      </>}
      {editing && <EditMovementDialog m={editing} onClose={() => setEditing(null)} onDone={load} />}
    </div>
  );
}
