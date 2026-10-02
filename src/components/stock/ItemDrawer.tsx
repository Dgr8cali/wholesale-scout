"use client";

import { ExternalLinkIcon, PlusIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Sparkline } from "@/components/results/Sparkline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ItemLevels } from "@/lib/server/stock";
import { BUCKET_LABEL, BUCKETS, KIND_LABEL, type Bucket, type MovementKind } from "@/lib/stock/levels";
import { api } from "@/lib/ui/client";
import { cn } from "@/lib/utils";
import { ACTION_LABEL, ActionDialog, type Listing, type StockAction, type SupplierChoice } from "./actions";

interface MovementRow { id: string; bucket: Bucket; quantity: number; kind: MovementKind; date: string; reason: string | null; note: string | null }

const gbp = (v: number | null | undefined) => (v == null ? "—" : `£${Number(v).toFixed(2)}`);

/** An item: its details (editable), listings, the last 30 days' level, its movements, and the stock actions. */
export function ItemDrawer({ row, onClose, onChanged }: { row: ItemLevels | null; onClose: () => void; onChanged: () => void }) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [moves, setMoves] = useState<MovementRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierChoice[]>([]);
  const [action, setAction] = useState<StockAction | null>(null);
  const [d, setD] = useState<Record<string, string>>({});
  const [newL, setNewL] = useState({ marketplace: "", marketplace_sku: "", price: "", fee_pct: "", default_bucket: "home", url: "" });
  const id = row?.item.id;

  const load = useCallback(() => {
    if (!id) return;
    api<{ listings: Listing[]; movements: MovementRow[] }>(`/api/stock/items/${id}`).then((r) => { setListings(r.listings); setMoves(r.movements); }).catch((e: Error) => toast.error(e.message));
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api<{ suppliers: SupplierChoice[] }>("/api/suppliers").then((r) => setSuppliers(r.suppliers)).catch(() => {}); }, []);
  // The editable details follow the item shown.
  const [shownId, setShownId] = useState<string | null>(null);
  if (row && shownId !== row.item.id) {
    setShownId(row.item.id);
    const it = row.item;
    setD({ sku: it.sku, name: it.name, asin: it.asin ?? "", barcode: it.barcode ?? "", category: it.category ?? "", unit_cost: it.unit_cost?.toString() ?? "", packaging_cost: it.packaging_cost?.toString() ?? "", reorder_level: it.reorder_level?.toString() ?? "", lead_time_days: it.lead_time_days?.toString() ?? "", supplier_id: it.supplier_id ?? "", status: it.status, notes: it.notes ?? "" });
  }

  if (!row) return null;
  const it = row.item;
  const saveDetails = async () => {
    try {
      await api(`/api/stock/items/${it.id}`, { method: "PATCH", json: d });
      toast.success("Saved");
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const addListing = async () => {
    try {
      await api(`/api/stock/items/${it.id}/listings`, { method: "POST", json: newL });
      setNewL({ marketplace: "", marketplace_sku: "", price: "", fee_pct: "", default_bucket: "home", url: "" });
      load();
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const removeListing = async (l: Listing) => {
    await api(`/api/stock/items/${it.id}/listings?listing=${l.id}`, { method: "DELETE" });
    load();
    onChanged();
  };
  const field = (k: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block space-y-0.5"><span className="field-label">{label}</span><Input className="h-8" value={d[k] ?? ""} onChange={(e) => setD({ ...d, [k]: e.target.value })} {...props} /></label>
  );

  return (
    <>
      <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-xl">
          <SheetHeader className="border-b">
            <SheetTitle>{it.name}</SheetTitle>
            <SheetDescription><span className="num">{it.sku}</span>{it.asin && <> · <a className="num text-brand hover:underline" href={`https://www.amazon.co.uk/dp/${it.asin}`} target="_blank" rel="noreferrer">{it.asin}</a></>}{it.supplier_name ? ` · ${it.supplier_name}` : ""}</SheetDescription>
          </SheetHeader>
          <div className="space-y-5 p-4">
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(ACTION_LABEL) as StockAction[]).map((a) => <Button key={a} size="sm" variant={a === "sale" ? "default" : "outline"} onClick={() => setAction(a)}>{ACTION_LABEL[a]}</Button>)}
            </div>

            <section className="grid grid-cols-4 gap-2 text-center">
              {BUCKETS.map((b) => (
                <div key={b} className="rounded-lg bg-surface-2 px-2 py-1.5">
                  <div className="text-[10.5px] tracking-wide text-muted-foreground uppercase">{BUCKET_LABEL[b]}</div>
                  <div className="num text-lg font-medium">{b === "fba" && !row.fba.matched ? "—" : row.levels[b]}</div>
                </div>
              ))}
              <div className="rounded-lg bg-surface-2 px-2 py-1.5"><div className="text-[10.5px] tracking-wide text-muted-foreground uppercase">Total</div><div className="num text-lg font-semibold">{row.total}</div></div>
            </section>
            <section className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground"><span>Level, last 30 days</span><span>{row.demand.total ? `${row.demand.total.toFixed(2)} a day sold` : "nothing sold in 30 days"}</span></div>
              <Sparkline values={row.spark} width={520} height={44} label="Stock level, last 30 days" className="w-full" />
              {it.asin && <p className="text-2xs text-muted-foreground">Amazon FBA {row.fba.matched ? `is SP-API's fulfillable count${row.fba.synced ? `, synced ${new Date(row.fba.synced).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}` : "has no SP-API stock for this SKU or ASIN"}; Amazon sales come from the orders sync.</p>}
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Details</h3>
              <div className="grid grid-cols-2 gap-2">
                {field("sku", "SKU")}{field("asin", "ASIN", { className: "num h-8 uppercase" })}
                <div className="col-span-2">{field("name", "Name")}</div>
                {field("barcode", "Barcode")}{field("category", "Category")}
                {field("unit_cost", "Unit cost (£)", { type: "number", step: "0.01" })}{field("packaging_cost", "Packaging (£)", { type: "number", step: "0.01" })}
                {field("reorder_level", "Low-stock level", { type: "number" })}{field("lead_time_days", "Lead time (days)", { type: "number" })}
                <label className="block space-y-0.5"><span className="field-label">Supplier</span>
                  <NativeSelect className="h-8 w-full" value={d.supplier_id ?? ""} onChange={(e) => setD({ ...d, supplier_id: e.target.value })}>
                    <NativeSelectOption value="">None</NativeSelectOption>
                    {suppliers.map((s) => <NativeSelectOption key={s.id} value={s.id}>{s.name}</NativeSelectOption>)}
                  </NativeSelect></label>
                <label className="block space-y-0.5"><span className="field-label">Status</span>
                  <NativeSelect className="h-8 w-full" value={d.status ?? "active"} onChange={(e) => setD({ ...d, status: e.target.value })}>
                    <NativeSelectOption value="active">Active</NativeSelectOption><NativeSelectOption value="discontinued">Discontinued</NativeSelectOption>
                  </NativeSelect></label>
                <div className="col-span-2">{field("notes", "Notes")}</div>
              </div>
              <div className="flex items-center gap-3">
                <Button size="sm" variant="outline" onClick={saveDetails}>Save details</Button>
                {it.supplier_id && <Link href={`/suppliers/${it.supplier_id}`} className="text-xs text-brand hover:underline">Supplier →</Link>}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Listings</h3>
              {!listings.length ? <p className="text-xs text-muted-foreground">None yet. A listing&apos;s fee % goes into each sale&apos;s cost.</p> : (
                <ul className="divide-y rounded-lg border text-sm">{listings.map((l) => (
                  <li key={l.id} className="flex items-center gap-2 px-2.5 py-1.5">
                    <span className="font-medium">{l.marketplace}</span>
                    <span className="num text-xs text-muted-foreground">{l.marketplace_sku ?? ""}</span>
                    <span className="num ml-auto">{gbp(l.price)}</span>
                    <span className="text-xs text-muted-foreground">{l.fee_pct != null ? `${l.fee_pct}% fee` : "no fee"}{l.default_bucket ? ` · from ${BUCKET_LABEL[l.default_bucket]}` : ""}</span>
                    {l.url && <a href={l.url} target="_blank" rel="noreferrer" aria-label="Open listing"><ExternalLinkIcon className="size-3.5 text-muted-foreground" /></a>}
                    <button type="button" onClick={() => removeListing(l)} aria-label="Remove listing"><Trash2Icon className="size-3.5 text-muted-foreground hover:text-fail" /></button>
                  </li>
                ))}</ul>
              )}
              <div className="grid grid-cols-6 gap-1.5">
                <Input className="col-span-2 h-8" placeholder="Marketplace" value={newL.marketplace} onChange={(e) => setNewL({ ...newL, marketplace: e.target.value })} />
                <Input className="col-span-2 h-8" placeholder="Its SKU" value={newL.marketplace_sku} onChange={(e) => setNewL({ ...newL, marketplace_sku: e.target.value })} />
                <Input className="num h-8" placeholder="£" type="number" step="0.01" value={newL.price} onChange={(e) => setNewL({ ...newL, price: e.target.value })} />
                <Input className="num h-8" placeholder="fee %" type="number" step="0.1" value={newL.fee_pct} onChange={(e) => setNewL({ ...newL, fee_pct: e.target.value })} />
                <Input className="col-span-4 h-8" placeholder="URL" value={newL.url} onChange={(e) => setNewL({ ...newL, url: e.target.value })} />
                <NativeSelect className="col-span-2 h-8 w-full" value={newL.default_bucket} onChange={(e) => setNewL({ ...newL, default_bucket: e.target.value })}>
                  {BUCKETS.map((b) => <NativeSelectOption key={b} value={b}>from {BUCKET_LABEL[b]}</NativeSelectOption>)}
                </NativeSelect>
              </div>
              <Button size="xs" variant="outline" disabled={!newL.marketplace.trim()} onClick={addListing}><PlusIcon /> Add listing</Button>
            </section>

            <section className="space-y-2">
              <div className="flex items-center"><h3 className="text-sm font-semibold">Movements</h3><Link href={`/stock/movements?item=${it.id}`} className="ml-auto text-xs text-brand hover:underline">All →</Link></div>
              {!moves.length ? <p className="text-xs text-muted-foreground">None yet.</p> : (
                <table className="w-full text-xs"><tbody>{moves.slice(0, 30).map((m) => (
                  <tr key={m.id} className="border-t">
                    <td className="py-1 pr-2 whitespace-nowrap">{m.date}</td>
                    <td className="pr-2">{KIND_LABEL[m.kind]}</td>
                    <td className="pr-2 text-muted-foreground">{BUCKET_LABEL[m.bucket]}</td>
                    <td className={cn("num pr-2 text-right font-medium", m.quantity > 0 ? "text-pass" : "text-fail")}>{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</td>
                    <td className="text-muted-foreground">{[m.reason, m.note].filter(Boolean).join(" · ")}</td>
                  </tr>
                ))}</tbody></table>
              )}
            </section>
          </div>
        </SheetContent>
      </Sheet>
      {action && <ActionDialog action={action} item={row} onClose={() => setAction(null)} onDone={() => { load(); onChanged(); }} />}
    </>
  );
}
