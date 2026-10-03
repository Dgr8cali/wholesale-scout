"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { ItemLevels } from "@/lib/server/stock";
import { ADJUST_REASONS, BUCKET_LABEL, MANUAL_BUCKETS, SALE_CHANNELS, type Bucket } from "@/lib/stock/levels";
import { api } from "@/lib/ui/client";
import { emptyOrder, OrderFields, orderJson, SupplierPicker, type OrderDraft } from "./orderBits";

export type StockAction = "sale" | "receive" | "adjust" | "transfer" | "return";
export const ACTION_LABEL: Record<StockAction, string> = { sale: "Record sale", receive: "Receive", adjust: "Adjust", transfer: "Transfer", return: "Return" };

export interface Listing { id: string; marketplace: string; marketplace_sku: string | null; title: string | null; url: string | null; price: number | null; fee_pct: number | null; default_bucket: Bucket | null; status: string }
export interface Sale { id: string; item_id: string; channel: string; order_id: string | null; date: string; quantity: number; price_each: number; returned_quantity: number }

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
const gbp = (v: number) => `£${v.toFixed(2)}`;

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return <label className="block space-y-1"><span className="field-label">{label}</span>{children}{hint && <span className="block text-2xs text-muted-foreground">{hint}</span>}</label>;
}

function BucketSelect({ value, onChange, levels }: { value: Bucket; onChange: (b: Bucket) => void; levels?: Record<Bucket, number> }) {
  return (
    <NativeSelect className="w-full" value={value} onChange={(e) => onChange(e.target.value as Bucket)}>
      {MANUAL_BUCKETS.map((b) => <NativeSelectOption key={b} value={b}>{BUCKET_LABEL[b]}{levels ? ` (${levels[b]} held)` : ""}</NativeSelectOption>)}
    </NativeSelect>
  );
}

/**
 * One stock action on an item: a sale (outside Amazon), goods in, a correction, a move between your
 * own buckets, or a return. Amazon FBA isn't offered: SP-API keeps it.
 */
export function ActionDialog({ action, item, items, onClose, onDone }: {
  action: StockAction | null;
  /** The item acted on; for a sale from the Sales page, pick one of `items`. */
  item: ItemLevels | null; items?: ItemLevels[];
  onClose: () => void; onDone: () => void;
}) {
  const [itemId, setItemId] = useState(item?.item.id ?? items?.[0]?.item.id ?? "");
  const cur = item ?? items?.find((i) => i.item.id === itemId) ?? null;
  const [listings, setListings] = useState<Listing[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [f, setF] = useState({ bucket: "home" as Bucket, to: "tiktok_fbt" as Bucket, quantity: "", date: today(), price: "", channel: "eBay", listing: "", order: "", reason: "Stock count", sign: "-", unitCost: "", note: "", sale: "" });
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  // Receive: the supplier (the item's by default) and its order.
  const [supplier, setSupplier] = useState(item?.item.supplier_id ?? "");
  const [order, setOrder] = useState<OrderDraft>(() => emptyOrder());

  useEffect(() => {
    if (!action || !cur || (action !== "sale" && action !== "return")) return;
    api<{ listings: Listing[]; sales: Sale[] }>(`/api/stock/items/${cur.item.id}`).then((r) => { setListings(r.listings); setSales(r.sales); }).catch(() => {});
  }, [action, cur]);

  if (!action) return null;
  const q = Number(f.quantity);
  const listing = listings.find((l) => l.id === f.listing) ?? null;
  const returnable = sales.filter((s) => s.quantity - s.returned_quantity > 0);
  const submit = async () => {
    if (!cur) return;
    setBusy(true);
    try {
      const id = cur.item.id;
      if (action === "sale") {
        const r = await api<{ snapshot: { cost_each: number; profit_each: number } }>("/api/stock/sales", { method: "POST", json: { itemId: id, listingId: f.listing || null, bucket: f.bucket, channel: f.channel, orderId: f.order || null, date: f.date, quantity: q, priceEach: Number(f.price), note: f.note || null } });
        toast.success(`Sale recorded: cost ${gbp(r.snapshot.cost_each)} each, profit ${gbp(r.snapshot.profit_each)} each`);
      } else if (action === "receive") {
        await api(`/api/stock/items/${id}/receive`, { method: "POST", json: { bucket: f.bucket, quantity: q, date: f.date, unitCost: f.unitCost === "" ? null : Number(f.unitCost), note: f.note || null, supplierId: supplier || null, ...orderJson(order) } });
        toast.success(`${q} received into ${BUCKET_LABEL[f.bucket]}`);
      } else if (action === "adjust") {
        await api(`/api/stock/items/${id}/adjust`, { method: "POST", json: { bucket: f.bucket, quantity: f.sign === "-" ? -q : q, reason: f.reason, date: f.date, note: f.note || null } });
        toast.success(`${BUCKET_LABEL[f.bucket]} ${f.sign}${q} (${f.reason.toLowerCase()})`);
      } else if (action === "transfer") {
        await api(`/api/stock/items/${id}/transfer`, { method: "POST", json: { from: f.bucket, to: f.to, quantity: q, date: f.date, note: f.note || null } });
        toast.success(`${q} moved from ${BUCKET_LABEL[f.bucket]} to ${BUCKET_LABEL[f.to]}`);
      } else {
        await api(`/api/stock/sales/${f.sale}/return`, { method: "POST", json: { quantity: q, bucket: f.bucket, reason: f.reason === "Stock count" ? null : f.reason, date: f.date } });
        toast.success(`${q} returned into ${BUCKET_LABEL[f.bucket]}`);
      }
      onDone();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const ok = q > 0 && !!cur && (action !== "sale" || f.price !== "") && (action !== "return" || !!f.sale) && (action !== "transfer" || f.bucket !== f.to);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ACTION_LABEL[action]}{cur ? `: ${cur.item.name}` : ""}</DialogTitle>
          <DialogDescription>
            {action === "sale" ? "A sale outside Amazon (Amazon's own orders come from the orders sync). The bucket must hold it; the cost at this moment is kept with the sale."
              : action === "receive" ? "Goods in: a delivery, an opening count. (Stock you send to Amazon shows in FBA once SP-API sees it.)"
              : action === "adjust" ? "A correction with a reason: a stock count, damage, a loss, a sample."
              : action === "transfer" ? "Between your own buckets."
              : "Units of an earlier sale coming back."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {!item && items && (
            <div className="col-span-2"><Field label="Item">
              <NativeSelect className="w-full" value={itemId} onChange={(e) => setItemId(e.target.value)}>
                {items.map((i) => <NativeSelectOption key={i.item.id} value={i.item.id}>{i.item.sku} · {i.item.name}</NativeSelectOption>)}
              </NativeSelect></Field></div>
          )}
          {action === "return" && (
            <div className="col-span-2"><Field label="The sale">
              <NativeSelect className="w-full" value={f.sale} onChange={(e) => set({ sale: e.target.value })}>
                <NativeSelectOption value="">{returnable.length ? "Pick a sale…" : "No sale with units left to return"}</NativeSelectOption>
                {returnable.map((s) => <NativeSelectOption key={s.id} value={s.id}>{s.date} · {s.channel}{s.order_id ? ` · ${s.order_id}` : ""} · {s.quantity - s.returned_quantity} of {s.quantity} returnable</NativeSelectOption>)}
              </NativeSelect></Field></div>
          )}
          <Field label={action === "transfer" ? "From" : action === "sale" ? "Sell from" : action === "adjust" ? "Bucket" : "Into"}>
            <BucketSelect value={f.bucket} onChange={(b) => set({ bucket: b })} levels={cur?.levels} />
          </Field>
          {action === "transfer" && <Field label="To"><BucketSelect value={f.to} onChange={(b) => set({ to: b })} levels={cur?.levels} /></Field>}
          {action === "adjust" && (
            <Field label="Change">
              <NativeSelect className="w-full" value={f.sign} onChange={(e) => set({ sign: e.target.value })}>
                <NativeSelectOption value="-">Take off (−)</NativeSelectOption><NativeSelectOption value="+">Add (+)</NativeSelectOption>
              </NativeSelect>
            </Field>
          )}
          <Field label="Quantity"><Input className="num" type="number" min={1} step={1} value={f.quantity} onChange={(e) => set({ quantity: e.target.value })} autoFocus /></Field>
          <Field label="Date"><Input type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} /></Field>
          {action === "sale" && (
            <>
              <Field label="Channel">
                <NativeSelect className="w-full" value={f.channel} onChange={(e) => set({ channel: e.target.value })}>
                  {SALE_CHANNELS.map((c) => <NativeSelectOption key={c} value={c}>{c}</NativeSelectOption>)}
                </NativeSelect>
              </Field>
              <Field label="Listing" hint={listing?.fee_pct != null ? `Fee ${listing.fee_pct}% of the price` : "No listing: no marketplace fee in the cost"}>
                <NativeSelect className="w-full" value={f.listing} onChange={(e) => {
                  const l = listings.find((x) => x.id === e.target.value);
                  set({ listing: e.target.value, ...(l?.price != null && f.price === "" ? { price: String(l.price) } : {}), ...(l?.default_bucket && l.default_bucket !== "fba" ? { bucket: l.default_bucket } : {}), ...(l && (SALE_CHANNELS as readonly string[]).includes(l.marketplace) ? { channel: l.marketplace } : {}) });
                }}>
                  <NativeSelectOption value="">None</NativeSelectOption>
                  {listings.map((l) => <NativeSelectOption key={l.id} value={l.id}>{l.marketplace}{l.marketplace_sku ? ` · ${l.marketplace_sku}` : ""}{l.price != null ? ` · ${gbp(Number(l.price))}` : ""}</NativeSelectOption>)}
                </NativeSelect>
              </Field>
              <Field label="Price each (£)"><Input className="num" type="number" min={0} step="0.01" value={f.price} onChange={(e) => set({ price: e.target.value })} /></Field>
              <Field label="Order id"><Input value={f.order} onChange={(e) => set({ order: e.target.value })} /></Field>
            </>
          )}
          {action === "receive" && (
            <>
              <Field label={`Unit cost (${order.currency === "GBP" ? "£" : order.currency})`} hint={order.currency === "GBP" ? "Optional: what these cost each" : `Turned into £ at the rate below`}><Input className="num" type="number" min={0} step="0.01" value={f.unitCost} onChange={(e) => set({ unitCost: e.target.value })} /></Field>
              <div className="col-span-2"><Field label="Supplier"><SupplierPicker value={supplier} onChange={(v) => setSupplier(v)} /></Field></div>
              <details className="col-span-2 text-sm">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">The order: number and link, tracking, currency</summary>
                <div className="mt-2 grid grid-cols-2 gap-3"><OrderFields value={order} onChange={setOrder} expected={false} /></div>
              </details>
            </>
          )}
          {(action === "adjust" || action === "return") && (
            <Field label="Reason">
              {action === "adjust" ? (
                <NativeSelect className="w-full" value={f.reason} onChange={(e) => set({ reason: e.target.value })}>
                  {ADJUST_REASONS.map((r) => <NativeSelectOption key={r} value={r}>{r}</NativeSelectOption>)}
                </NativeSelect>
              ) : <Input value={f.reason === "Stock count" ? "" : f.reason} onChange={(e) => set({ reason: e.target.value })} placeholder="e.g. damaged in post" />}
            </Field>
          )}
          {action !== "return" && <div className="col-span-2"><Field label="Note"><Input value={f.note} onChange={(e) => set({ note: e.target.value })} /></Field></div>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!ok || busy}>{ACTION_LABEL[action]}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface SupplierChoice { id: string; name: string; delivery_days: number | null }

/** A new stock item. */
export function NewItemDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (id: string) => void }) {
  const [f, setF] = useState({ sku: "", name: "", asin: "", unit_cost: "", packaging_cost: "", reorder_level: "", lead_time_days: "", supplier_id: "" });
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const save = async () => {
    setBusy(true);
    try {
      const r = await api<{ item: { id: string } }>("/api/stock/items", { method: "POST", json: { ...f, supplier_id: f.supplier_id || null } });
      toast.success(`${f.sku.toUpperCase()} added`);
      onDone(r.item.id);
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New stock item</DialogTitle>
          <DialogDescription>Receive its stock afterwards (Receive). With an ASIN, its Amazon FBA stock and sales join it from SP-API.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="SKU"><Input value={f.sku} onChange={(e) => set({ sku: e.target.value })} autoFocus /></Field>
          <Field label="ASIN" hint="Optional"><Input className="num uppercase" value={f.asin} onChange={(e) => set({ asin: e.target.value })} /></Field>
          <div className="col-span-2"><Field label="Name"><Input value={f.name} onChange={(e) => set({ name: e.target.value })} /></Field></div>
          <Field label="Unit cost (£)"><Input className="num" type="number" min={0} step="0.01" value={f.unit_cost} onChange={(e) => set({ unit_cost: e.target.value })} /></Field>
          <Field label="Packaging (£)"><Input className="num" type="number" min={0} step="0.01" value={f.packaging_cost} onChange={(e) => set({ packaging_cost: e.target.value })} /></Field>
          <Field label="Low-stock level" hint="Blank: Settings → Stock's default"><Input className="num" type="number" min={0} value={f.reorder_level} onChange={(e) => set({ reorder_level: e.target.value })} /></Field>
          <Field label="Lead time (days)" hint="Blank: the supplier's delivery days"><Input className="num" type="number" min={0} value={f.lead_time_days} onChange={(e) => set({ lead_time_days: e.target.value })} /></Field>
          <div className="col-span-2"><Field label="Supplier"><SupplierPicker value={f.supplier_id} onChange={(v) => set({ supplier_id: v })} /></Field></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy || !f.sku.trim() || !f.name.trim()}>Add item</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
