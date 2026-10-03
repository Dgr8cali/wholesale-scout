"use client";

import { PencilIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { OrderFields, OrderLink, orderJson, type OrderDraft } from "@/components/stock/orderBits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Purchase } from "@/lib/server/purchases";
import { trackingText } from "@/lib/stock/orders";
import { api } from "@/lib/ui/client";

/** The order on one line: number (a link when its page is known), expected date while ordered, tracking. */
export function OrderLine({ p }: { p: Purchase }) {
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

/** Edit a purchase's order: number and link, dates, tracking, currency and rate, notes. */
export function OrderDetailsButton({ p, onSaved }: { p: Purchase; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const draft = (): OrderDraft => ({
    orderId: p.order_id ?? "", orderUrl: p.order_url ?? "", orderedDate: p.ordered_on, expectedDate: p.expected_date ?? "",
    trackingCarrier: p.tracking_carrier ?? "", trackingNumber: p.tracking_number ?? "", currency: p.currency ?? "GBP", fxRate: p.fx_rate == null ? "" : String(p.fx_rate),
  });
  const [o, setO] = useState<OrderDraft>(draft);
  const [ccy, setCcy] = useState(p.unit_cost_ccy == null ? "" : String(p.unit_cost_ccy));
  const [note, setNote] = useState(p.note ?? "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api(`/api/purchases/${p.id}`, { method: "PATCH", json: { ...orderJson(o), orderedOn: o.orderedDate || undefined, unitCostCcy: o.currency === "GBP" || ccy === "" ? null : ccy, note: note || null } });
      toast.success("Order details saved");
      setOpen(false);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button variant="ghost" size="xs" onClick={() => { setO(draft()); setCcy(p.unit_cost_ccy == null ? "" : String(p.unit_cost_ccy)); setNote(p.note ?? ""); setOpen(true); }} title="Order number and link, expected date, tracking, currency"><PencilIcon /> Order</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Order details</DialogTitle>
            <DialogDescription>The supplier&apos;s order number and link, when it&apos;s expected and how it&apos;s tracked. Receiving it carries the order number onto the Stock receipt.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <OrderFields value={o} onChange={setO} />
            {o.currency !== "GBP" && <label className="space-y-1"><span className="field-label">Unit cost ({o.currency})</span><Input className="num" type="number" step="0.01" min={0} value={ccy} onChange={(e) => setCcy(e.target.value)} /></label>}
            <label className="col-span-2 space-y-1"><span className="field-label">Notes</span><Input value={note} onChange={(e) => setNote(e.target.value)} /></label>
          </div>
          <p className="text-2xs text-muted-foreground">The landed cost per unit (£) stays as recorded; the currency and rate are kept for reference.</p>
          <DialogFooter><Button disabled={busy} onClick={save}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
