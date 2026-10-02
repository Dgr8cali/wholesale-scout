"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { api } from "@/lib/ui/client";

interface Supplier { id: string; name: string; delivery_days: number | null }
interface Item { id: string; sku: string; name: string; asin: string | null; unit_cost: number | null; supplier_id: string | null }
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });

/** A purchase of a stock item (from Stock → Reorder): prefilled with the item, its supplier and the suggested quantity. */
export function StockPurchaseDialog({ itemId, qty, supplierId, open, onOpenChange, onSaved }: {
  itemId: string; qty: number | null; supplierId: string | null; open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void;
}) {
  const [item, setItem] = useState<Item | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [f, setF] = useState({ units: qty ? String(qty) : "", landed: "", supplier: supplierId ?? "", date: today(), note: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    api<{ item: Item }>(`/api/stock/items/${itemId}`).then((r) => {
      setItem(r.item);
      setF((x) => ({ ...x, landed: x.landed || (r.item.unit_cost != null ? r.item.unit_cost.toFixed(2) : ""), supplier: x.supplier || r.item.supplier_id || "" }));
    }).catch((e: Error) => toast.error(e.message));
    api<{ suppliers: Supplier[] }>("/api/suppliers").then((r) => setSuppliers(r.suppliers)).catch(() => {});
  }, [open, itemId]);
  const save = async () => {
    setBusy(true);
    try {
      await api("/api/stock/purchases", { method: "POST", json: { itemId, units: Number(f.units), landedGbp: Number(f.landed.replace(",", ".")), supplierId: f.supplier || null, orderedOn: f.date, note: f.note || null } });
      toast.success(`Purchase recorded: ${f.units} × ${item?.sku ?? "item"}. Mark it Received here when it arrives, and it goes into Stock.`);
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a purchase{item ? `: ${item.name}` : ""}</DialogTitle>
          <DialogDescription>{item ? `${item.sku}${item.asin ? ` · ${item.asin}` : ""}. ` : ""}When it arrives, set it to Received and choose the bucket: its units go into Stock.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1"><span className="field-label">Units</span><Input className="num" type="number" min={1} value={f.units} onChange={(e) => setF({ ...f, units: e.target.value })} autoFocus /></label>
          <label className="space-y-1"><span className="field-label">Landed cost per unit (£)</span><Input className="num" type="number" step="0.01" min={0} value={f.landed} onChange={(e) => setF({ ...f, landed: e.target.value })} /></label>
          <label className="space-y-1"><span className="field-label">Supplier</span>
            <NativeSelect className="w-full" value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })}>
              <NativeSelectOption value="">—</NativeSelectOption>
              {suppliers.map((s) => <NativeSelectOption key={s.id} value={s.id}>{s.name}{s.delivery_days ? ` · ${s.delivery_days} days` : ""}</NativeSelectOption>)}
            </NativeSelect></label>
          <label className="space-y-1"><span className="field-label">Ordered on</span><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
          <label className="col-span-2 space-y-1"><span className="field-label">Note</span><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
        </div>
        <DialogFooter><Button disabled={busy || !(Number(f.units) > 0) || f.landed === ""} onClick={save}>Save purchase</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Received: which bucket its units go into (or not into Stock at all). */
export function ReceiveDialog({ open, units, onOpenChange, onReceive }: { open: boolean; units: number; onOpenChange: (o: boolean) => void; onReceive: (bucket: "home" | "tiktok_fbt" | null) => void }) {
  const [bucket, setBucket] = useState<"home" | "tiktok_fbt" | "">("home");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Received: into which bucket?</DialogTitle>
          <DialogDescription>{units} units go into Stock as a receipt at the landed cost. Stock you send to Amazon shows in FBA once SP-API sees it, so receive it here first if it comes to you.</DialogDescription>
        </DialogHeader>
        <NativeSelect className="w-full" value={bucket} onChange={(e) => setBucket(e.target.value as "home")}>
          <NativeSelectOption value="home">Self-ship (at home)</NativeSelectOption>
          <NativeSelectOption value="tiktok_fbt">TikTok FBT</NativeSelectOption>
          <NativeSelectOption value="">Don&apos;t add to Stock (it went straight to Amazon)</NativeSelectOption>
        </NativeSelect>
        <DialogFooter><Button onClick={() => onReceive(bucket || null)}>Mark received</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
