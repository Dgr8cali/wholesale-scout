"use client";

import { PencilIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useDialogs } from "@/components/Dialogs";
import { OrderFields, OrderLink, orderJson, SupplierPicker, type OrderDraft } from "@/components/stock/orderBits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { trackingText } from "@/lib/stock/orders";
import { api } from "@/lib/ui/client";

/** What an order row needs, whichever page shows it (a Purchase from the API). */
export interface OrderLike {
  id: string; status: string; units: number; landed_gbp: number; ordered_on: string; note: string | null;
  stock_item_id?: string | null; supplier_id?: string | null; supplier_name?: string | null;
  order_id?: string | null; order_url?: string | null; expected_date?: string | null; tracking_carrier?: string | null; tracking_number?: string | null;
  currency?: string | null; fx_rate?: number | null; unit_cost_ccy?: number | null;
}

/** The order on one line: number (a link when its page is known), expected date while ordered, tracking. */
export function OrderLine({ p }: { p: OrderLike }) {
  const track = trackingText(p.tracking_carrier, p.tracking_number);
  if (!p.order_id && !p.order_url && !track && !p.expected_date && (!p.currency || p.currency === "GBP")) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 text-2xs text-muted-foreground">
      {(p.order_id || p.order_url) && <span>Order <OrderLink id={p.order_id} url={p.order_url} /></span>}
      {p.expected_date && p.status === "ordered" && <span>· expected {p.expected_date}</span>}
      {track && <span>· {track}</span>}
      {p.currency && p.currency !== "GBP" && p.unit_cost_ccy != null && <span className="num">· {p.currency} {Number(p.unit_cost_ccy).toFixed(2)} a unit at {p.fx_rate}</span>}
    </span>
  );
}

/**
 * Edit an order: item, supplier, quantity, unit cost (£ landed, or a price in another currency at its
 * rate), the order's number, link, dates and tracking, and notes. The same record from every page;
 * once received, its Stock receipt follows.
 */
export function OrderEditButton({ p, onSaved, label = "Edit" }: { p: OrderLike; onSaved: () => void; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="xs" onClick={(e) => { e.stopPropagation(); setOpen(true); }} title="Item, supplier, quantity, cost, order number and link, dates, tracking"><PencilIcon /> {label}</Button>
      {open && <OrderEditDialog p={p} onClose={() => setOpen(false)} onSaved={onSaved} />}
    </>
  );
}

function OrderEditDialog({ p, onClose, onSaved }: { p: OrderLike; onClose: () => void; onSaved: () => void }) {
  const [items, setItems] = useState<{ id: string; sku: string; name: string }[]>([]);
  const [item, setItem] = useState(p.stock_item_id ?? "");
  const [supplier, setSupplier] = useState(p.supplier_id ?? "");
  const [units, setUnits] = useState(String(p.units));
  const [o, setO] = useState<OrderDraft>({
    orderId: p.order_id ?? "", orderUrl: p.order_url ?? "", orderedDate: p.ordered_on, expectedDate: p.expected_date ?? "",
    trackingCarrier: p.tracking_carrier ?? "", trackingNumber: p.tracking_number ?? "", currency: p.currency ?? "GBP", fxRate: p.fx_rate == null ? "" : String(p.fx_rate),
  });
  const [cost, setCost] = useState(p.currency && p.currency !== "GBP" && p.unit_cost_ccy != null ? String(p.unit_cost_ccy) : Number(p.landed_gbp).toFixed(2));
  const [note, setNote] = useState(p.note ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<{ items: { item: { id: string; sku: string; name: string } }[] }>("/api/stock/levels").then((r) => setItems(r.items.map((x) => x.item))).catch(() => {}); }, []);
  const gbp = o.currency === "GBP";
  const save = async () => {
    setBusy(true);
    try {
      const r = await api<{ receiptUpdated: boolean }>(`/api/purchases/${p.id}`, { method: "PATCH", json: {
        ...(item ? { stockItemId: item } : {}), supplierId: supplier || null, units, note: note || null,
        ...orderJson(o), orderedOn: o.orderedDate || undefined,
        ...(gbp ? { landedGbp: cost, unitCostCcy: null } : { unitCostCcy: cost }),
      } });
      toast.success(r.receiptUpdated ? "Order saved; its Stock receipt follows" : "Order saved");
      onClose();
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Edit order</DialogTitle>
          <DialogDescription>The same order on Stock → Orders, the item&apos;s drawer, the Tracker and the product page.{p.status !== "ordered" ? " It's been received: its Stock receipt changes with it." : ""}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 space-y-1"><span className="field-label">Item</span>
            <NativeSelect className="w-full" value={item} onChange={(e) => setItem(e.target.value)}>
              {!item && <NativeSelectOption value="">No stock item yet</NativeSelectOption>}
              {items.map((i) => <NativeSelectOption key={i.id} value={i.id}>{i.sku} · {i.name.slice(0, 50)}</NativeSelectOption>)}
            </NativeSelect></label>
          <div className="col-span-2 space-y-1"><span className="field-label">Supplier</span><SupplierPicker value={supplier} onChange={(v) => setSupplier(v)} /></div>
          <label className="space-y-1"><span className="field-label">Quantity</span><Input className="num" type="number" min={1} value={units} onChange={(e) => setUnits(e.target.value)} /></label>
          <label className="space-y-1"><span className="field-label">{gbp ? "Landed cost per unit (£)" : `Unit cost (${o.currency})`}</span><Input className="num" type="number" step="0.01" min={0} value={cost} onChange={(e) => setCost(e.target.value)} />
            {!gbp && Number(o.fxRate) > 0 && cost !== "" && <span className="block text-2xs text-muted-foreground">£{(Number(cost) * Number(o.fxRate)).toFixed(2)} a unit landed at the rate</span>}</label>
          <OrderFields value={o} onChange={(v) => { if (v.currency !== o.currency) setCost(v.currency === "GBP" ? Number(p.landed_gbp).toFixed(2) : ""); setO(v); }} />
          <label className="col-span-2 space-y-1"><span className="field-label">Notes</span><Input value={note} onChange={(e) => setNote(e.target.value)} /></label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !(Number(units) > 0) || cost === "" || (!gbp && !(Number(o.fxRate) > 0))} onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Delete an order that hasn't been received (one that has needs its receipt deleted first). */
export function OrderDeleteButton({ p, onDeleted }: { p: OrderLike; onDeleted: () => void }) {
  const { confirm } = useDialogs();
  if (p.status !== "ordered") return null;
  const remove = async () => {
    if (!(await confirm({ title: "Delete this order?", description: `${p.units} units${p.order_id ? `, order ${p.order_id}` : ""}${p.supplier_name ? ` from ${p.supplier_name}` : ""}, ordered ${p.ordered_on}. It leaves the Tracker and Stock. The audit log keeps a copy.`, confirmLabel: "Delete order", destructive: true }))) return;
    try {
      await api(`/api/purchases/${p.id}`, { method: "DELETE" });
      toast.success("Order deleted");
      onDeleted();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return <Button variant="ghost" size="xs" className="text-muted-foreground hover:text-fail" onClick={(e) => { e.stopPropagation(); remove(); }} title="Delete (not received yet)"><Trash2Icon /> Delete</Button>;
}
