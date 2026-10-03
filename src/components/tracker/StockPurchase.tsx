"use client";

import { PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { emptyOrder, OrderFields, orderJson, SupplierPicker, type OrderDraft } from "@/components/stock/orderBits";
import { api } from "@/lib/ui/client";

interface Item { id: string; sku: string; name: string; asin: string | null; unit_cost: number | null; supplier_id: string | null }
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });

/**
 * Record a new order of a stock item, in Ordered status: the item (picked, or added here), the
 * supplier (picked, or added here), quantity, unit cost (in any currency, with its rate), the
 * supplier's order number and link, and the expected date. When it arrives, Receive puts it into a
 * bucket. From Stock → Reorder it comes prefilled with the item, its supplier and the quantity.
 */
export function StockPurchaseDialog({ itemId, qty, supplierId, open, onOpenChange, onSaved }: {
  itemId?: string | null; qty?: number | null; supplierId?: string | null; open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [pick, setPick] = useState(itemId ?? "");
  const [newItem, setNewItem] = useState<{ sku: string; name: string; asin: string } | null>(null);
  const [supplier, setSupplier] = useState(supplierId ?? "");
  const [f, setF] = useState({ units: qty ? String(qty) : "", cost: "", note: "" });
  const [order, setOrder] = useState<OrderDraft>(() => emptyOrder(today()));
  const [busy, setBusy] = useState(false);
  const item = items.find((i) => i.id === pick) ?? null;
  useEffect(() => {
    if (!open) return;
    api<{ items: { item: Item }[] }>("/api/stock/levels").then((r) => setItems(r.items.map((x) => x.item))).catch((e: Error) => toast.error(e.message));
  }, [open]);
  // The item's own cost and supplier fill in once it's picked (never over what you typed).
  const [filledFor, setFilledFor] = useState<string | null>(null);
  if (item && filledFor !== item.id) {
    setFilledFor(item.id);
    setF((x) => ({ ...x, cost: x.cost || (item.unit_cost != null ? item.unit_cost.toFixed(2) : "") }));
    if (!supplier && item.supplier_id) setSupplier(item.supplier_id);
  }
  const gbpCost = order.currency === "GBP";
  const save = async () => {
    setBusy(true);
    try {
      let id = pick;
      if (newItem) {
        const r = await api<{ item: { id: string } }>("/api/stock/items", { method: "POST", json: { sku: newItem.sku, name: newItem.name, asin: newItem.asin, supplier_id: supplier || null, unit_cost: gbpCost && f.cost ? f.cost : "" } });
        id = r.item.id;
      }
      const cost = Number(f.cost.replace(",", "."));
      await api("/api/stock/purchases", { method: "POST", json: {
        itemId: id, units: Number(f.units), supplierId: supplier || null, note: f.note || null, ...orderJson(order),
        ...(gbpCost ? { landedGbp: cost } : { unitCostCcy: cost }),
      } });
      toast.success(`Order recorded: ${f.units} × ${newItem?.sku.toUpperCase() ?? item?.sku ?? "item"}, Ordered. When it arrives, Receive it (Tracker, or the item on Stock → Levels).`);
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const ready = (newItem ? newItem.sku.trim() && newItem.name.trim() : pick) && Number(f.units) > 0 && f.cost !== "" && (gbpCost || Number(order.fxRate) > 0);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Record a new order{item && !newItem ? `: ${item.name}` : ""}</DialogTitle>
          <DialogDescription>It goes in the Tracker as Ordered. When it arrives, Receive it and choose the bucket: its units go into Stock with this order&apos;s number on the receipt.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <span className="field-label">Item</span>
            {newItem ? (
              <div className="grid grid-cols-3 gap-2 rounded-lg border border-dashed p-2.5">
                <Input className="h-8" placeholder="SKU" value={newItem.sku} onChange={(e) => setNewItem({ ...newItem, sku: e.target.value })} autoFocus />
                <Input className="col-span-2 h-8" placeholder="Name" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} />
                <Input className="num h-8 uppercase" placeholder="ASIN (optional)" value={newItem.asin} onChange={(e) => setNewItem({ ...newItem, asin: e.target.value })} />
                <span className="col-span-2 self-center text-2xs text-muted-foreground">Added to Stock when you save the order.</span>
                <Button type="button" size="xs" variant="ghost" className="col-span-3 justify-self-end" onClick={() => setNewItem(null)}>Pick an existing item instead</Button>
              </div>
            ) : (
              <div className="flex gap-1.5">
                <NativeSelect className="w-full min-w-0" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Item">
                  <NativeSelectOption value="">Pick an item…</NativeSelectOption>
                  {items.map((i) => <NativeSelectOption key={i.id} value={i.id}>{i.sku} · {i.name.slice(0, 50)}</NativeSelectOption>)}
                </NativeSelect>
                <Button type="button" size="sm" variant="outline" className="flex-none" onClick={() => setNewItem({ sku: "", name: "", asin: "" })}><PlusIcon /> New item</Button>
              </div>
            )}
          </div>
          <div className="col-span-2 space-y-1"><span className="field-label">Supplier</span><SupplierPicker value={supplier} onChange={(v) => setSupplier(v)} /></div>
          <label className="space-y-1"><span className="field-label">Quantity</span><Input className="num" type="number" min={1} value={f.units} onChange={(e) => setF({ ...f, units: e.target.value })} /></label>
          <label className="space-y-1"><span className="field-label">{gbpCost ? "Landed cost per unit (£)" : `Unit cost (${order.currency})`}</span><Input className="num" type="number" step="0.01" min={0} value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} />
            {!gbpCost && Number(order.fxRate) > 0 && Number(f.cost) >= 0 && f.cost !== "" && <span className="block text-2xs text-muted-foreground">£{(Number(f.cost) * Number(order.fxRate)).toFixed(2)} a unit at the rate</span>}
          </label>
          <OrderFields value={order} onChange={setOrder} />
          <label className="col-span-2 space-y-1"><span className="field-label">Notes</span><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
        </div>
        <DialogFooter><Button disabled={busy || !ready} onClick={save}>Record order</Button></DialogFooter>
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
