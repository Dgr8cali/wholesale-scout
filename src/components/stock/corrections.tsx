"use client";

import { HistoryIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { StatusChip, type Tone } from "@/components/ui/status-chip";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { BUCKET_LABEL, KIND_LABEL, MANUAL_BUCKETS, type Bucket, type MovementKind } from "@/lib/stock/levels";
import { api } from "@/lib/ui/client";

export interface EditableMovement {
  id: string; bucket: Bucket; quantity: number; kind: MovementKind; date: string; reason: string | null; note: string | null; unit_cost: number | null;
  sale_id?: string | null; purchase_id?: string | null; transfer_id?: string | null; item?: { sku: string; name: string } | null;
}

/** The bucket stood below 0 after this movement (or now, on Levels): shown until it's corrected. */
export function NegativeChip({ title }: { title?: string }) {
  return <StatusChip tone="bad" className="ml-1 h-5 px-2 align-middle" title={title ?? "The bucket is below 0 here: a movement is missing or wrong. Correct it (receive, adjust, or edit the movement)."}>Negative</StatusChip>;
}

/** What deleting a movement takes with it, in words for the confirm. */
export function deleteConsequence(m: EditableMovement): string {
  if (m.kind === "sale" && m.sale_id) return "Its sale on Stock → Sales goes with it (and any returns of it), so the units are back in the bucket.";
  if (m.transfer_id) return "Both halves of the transfer go: the units are back where they came from.";
  if (m.kind === "receipt" && m.purchase_id) return "Its order goes back to Ordered in the Tracker (receive it again when it's right).";
  if (m.kind === "return" && m.sale_id) return "Its sale can take that return again.";
  return "The level becomes the sum of the movements left.";
}

/** Edit a movement: quantity (its sign follows the kind), date, bucket, reason, note, unit cost. */
export function EditMovementDialog({ m, onClose, onDone }: { m: EditableMovement; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ quantity: String(m.kind === "adjustment" ? m.quantity : Math.abs(m.quantity)), date: m.date, bucket: m.bucket, reason: m.reason ?? "", note: m.note ?? "", unit_cost: m.unit_cost == null ? "" : String(m.unit_cost) });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const r = await api<{ notes: string[] }>(`/api/stock/movements/${m.id}`, { method: "PATCH", json: { quantity: f.quantity, date: f.date, bucket: f.bucket, reason: f.reason, note: f.note, unit_cost: f.unit_cost } });
      toast.success(`Saved${r.notes.length ? `: ${r.notes.join(", ")}` : ""}`);
      onDone();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {KIND_LABEL[m.kind].toLowerCase()}{m.item ? `: ${m.item.sku}` : ""}</DialogTitle>
          <DialogDescription>
            {m.kind === "adjustment" ? "An adjustment keeps the sign you give it (−3 takes 3 off)." : `The quantity is ${m.quantity > 0 ? "into" : "out of"} the bucket, whatever sign you type.`}
            {m.sale_id && m.kind === "sale" ? " The sale's quantity and date change with it." : ""}{m.transfer_id ? " The transfer's other half changes quantity and date with it." : ""} The audit log keeps the before and after.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1"><span className="field-label">Quantity</span><Input className="num" type="number" step={1} value={f.quantity} onChange={(e) => set({ quantity: e.target.value })} autoFocus /></label>
          <label className="space-y-1"><span className="field-label">Date</span><Input type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} /></label>
          <label className="space-y-1"><span className="field-label">Bucket</span>
            <NativeSelect className="w-full" value={f.bucket} onChange={(e) => set({ bucket: e.target.value as Bucket })}>
              {MANUAL_BUCKETS.map((b) => <NativeSelectOption key={b} value={b}>{BUCKET_LABEL[b]}</NativeSelectOption>)}
            </NativeSelect></label>
          <label className="space-y-1"><span className="field-label">Unit cost (£)</span><Input className="num" type="number" min={0} step="0.01" value={f.unit_cost} onChange={(e) => set({ unit_cost: e.target.value })} /></label>
          <label className="space-y-1"><span className="field-label">Reason</span><Input value={f.reason} onChange={(e) => set({ reason: e.target.value })} /></label>
          <label className="space-y-1"><span className="field-label">Note</span><Input value={f.note} onChange={(e) => set({ note: e.target.value })} /></label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !f.quantity || Number(f.quantity) === 0} onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface AuditRow { id: string; entity: string; entity_id: string | null; action: string; summary: string; actor: string; before: unknown; after: unknown; created_at: string }

const ACTION_TONE: Record<string, Tone> = { delete: "bad", purge: "bad", edit: "info", archive: "warn", restore: "good" };

/** Movements → Audit log: every Stock edit and delete (the last 500), with the before and after. */
export function AuditTable({ rows }: { rows: AuditRow[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const columns: DataColumn<AuditRow>[] = [
    { id: "when", header: "When", mobile: 1, sortValue: (r) => r.created_at, cell: (r) => <span className="num text-meta whitespace-nowrap">{new Date(r.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span> },
    { id: "entity", header: "What", mobile: 2, sortValue: (r) => r.entity, cell: (r) => <span className="text-meta">{r.entity}</span> },
    { id: "action", header: "Action", mobile: 3, sortValue: (r) => r.action, cell: (r) => <StatusChip tone={ACTION_TONE[r.action] ?? "neutral"} icon={false}>{r.action.charAt(0).toUpperCase() + r.action.slice(1)}</StatusChip> },
    {
      id: "summary", header: "Change", mobile: "title", className: "align-top", sortValue: (r) => r.summary,
      cell: (r) => (
        <div className="text-meta">
          {r.summary}
          <button type="button" className="ml-2 cursor-pointer text-primary hover:underline" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "Hide" : "Before / after"}</button>
          {open === r.id && (
            <div className="mt-1 grid gap-2 md:grid-cols-2">
              <pre className="max-h-60 overflow-auto rounded-lg bg-subtle p-2 text-xs">{JSON.stringify(r.before, null, 1)}</pre>
              <pre className="max-h-60 overflow-auto rounded-lg bg-subtle p-2 text-xs">{r.after == null ? "(gone)" : JSON.stringify(r.after, null, 1)}</pre>
            </div>
          )}
        </div>
      ),
    },
    { id: "who", header: "Who", sortValue: (r) => r.actor, cell: (r) => <span className="text-meta text-muted-foreground">{r.actor}</span> },
  ];
  return (
    <DataTable rows={rows} columns={columns} getRowId={(r) => r.id} storageKey="stock.audit" caption="Stock audit log" initialSort={{ id: "when", desc: true }}
      empty={{ icon: <HistoryIcon />, title: "Nothing edited or deleted yet", description: "Every edit and delete in Stock shows here, with the before and after." }} />
  );
}

interface Impact { movements: number; sales: number; listings: number; orders: number }
const impactText = (i: Impact) => `${i.movements} movement${i.movements === 1 ? "" : "s"}, ${i.sales} sale${i.sales === 1 ? "" : "s"}, ${i.listings} listing${i.listings === 1 ? "" : "s"} and ${i.orders} order${i.orders === 1 ? "" : "s"}`;

/**
 * Delete an item: archive (the default: hidden, everything kept, Restore brings it back), restore,
 * or delete permanently (archived items only: everything goes). Each asks first, with the counts.
 */
export function itemActions(confirm: (o: { title: string; description?: string; confirmLabel?: string; destructive?: boolean }) => Promise<boolean>, onDone: () => void) {
  const impactOf = (id: string) => api<{ impact: Impact }>(`/api/stock/items/${id}?impact=1`).then((r) => r.impact);
  const act = async (id: string, action: "archive" | "restore" | "purge") => api(`/api/stock/items/${id}/archive`, { method: "POST", json: { action } });
  return {
    archive: async (it: { id: string; sku: string; name: string }) => {
      const i = await impactOf(it.id);
      if (!(await confirm({ title: `Delete ${it.sku}?`, description: `“${it.name}” has ${impactText(i)}. It's archived: hidden from Levels, Reorder and Home, with all of that kept. Show archived on Levels lists it, to Restore or delete permanently.`, confirmLabel: "Archive", destructive: true }))) return false;
      try { await act(it.id, "archive"); toast.success(`${it.sku} archived`); onDone(); return true; } catch (e) { toast.error((e as Error).message); return false; }
    },
    restore: async (it: { id: string; sku: string }) => {
      try { await act(it.id, "restore"); toast.success(`${it.sku} restored`); onDone(); } catch (e) { toast.error((e as Error).message); }
    },
    purge: async (it: { id: string; sku: string; name: string }) => {
      const i = await impactOf(it.id);
      if (!(await confirm({ title: `Delete ${it.sku} permanently?`, description: `“${it.name}” and its ${impactText(i)} are removed for good (its orders leave the Tracker too). The audit log keeps a copy. This can't be undone here.`, confirmLabel: "Delete permanently", destructive: true }))) return;
      try { await act(it.id, "purge"); toast.success(`${it.sku} deleted permanently`); onDone(); } catch (e) { toast.error((e as Error).message); }
    },
  };
}
