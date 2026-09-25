"use client";

import { ExternalLinkIcon, RefreshCwIcon, ShoppingCartIcon, Trash2Icon } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useDialogs } from "@/components/Dialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import type { CartAllocation, CartLine } from "@/lib/qogita/cart";
import type { Money } from "@/lib/qogita/client";
import { api } from "@/lib/ui/client";
import { cn } from "@/lib/utils";

interface CartState {
  openCart: () => void;
  /** Add an offer; opens the cart on success. */
  add: (offerQid: string, quantity: number, unit: number, label: string) => Promise<boolean>;
  lineCount: number | null;
}

const Ctx = createContext<CartState | null>(null);
export const useQogitaCart = () => useContext(Ctx);

const money = (m: Money | null | undefined) =>
  m ? `${m.currency === "EUR" ? "€" : `${m.currency} `}${Number(m.amount).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";

/** The Qogita cart, shared by the top bar and "Add to Qogita cart" on results. */
export function QogitaCartProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [allocations, setAllocations] = useState<CartAllocation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<{ allocations: CartAllocation[] }>("/api/qogita/cart");
      setAllocations(r.allocations);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const openCart = useCallback(() => { setOpen(true); refresh(); }, [refresh]);
  const add = useCallback(async (offerQid: string, quantity: number, unit: number, label: string) => {
    try {
      await api("/api/qogita/cart/lines", { method: "POST", json: { offerQid, quantity, unit } });
      toast.success(`Added ${quantity.toLocaleString("en-GB")} × ${label} to the Qogita cart`);
      openCart();
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    }
  }, [openCart]);

  if (!enabled) return <>{children}</>;
  const lineCount = allocations ? allocations.reduce((a, x) => a + x.lines.length, 0) : null;
  return (
    <Ctx.Provider value={{ openCart, add, lineCount }}>
      {children}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle className="flex items-center gap-2"><ShoppingCartIcon className="size-4" /> Qogita cart</SheetTitle>
            <SheetDescription>One order per supplier; each must reach its minimum order value (MOV).</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            {error ? (
              <div role="alert" className="space-y-2 rounded-lg bg-fail-soft p-3 text-sm text-fail">
                <p>Couldn&apos;t load the cart: {error}</p>
                <Button variant="outline" size="sm" onClick={refresh}>Try again</Button>
              </div>
            ) : !allocations ? (
              <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-40 rounded-lg" />)}</div>
            ) : !allocations.length ? (
              <p className="py-10 text-center text-sm text-muted-foreground">The cart is empty. Add a passing Qogita product from its details.</p>
            ) : allocations.map((a) => <Allocation key={a.qid} a={a} onChanged={refresh} />)}
          </div>
          <div className="flex items-center justify-between gap-2 border-t p-4">
            <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}><RefreshCwIcon className={cn(loading && "animate-spin")} /> Refresh</Button>
            <Button variant="outline" size="sm" asChild>
              <a href="https://www.qogita.com/cart/" target="_blank" rel="noreferrer">Check out on Qogita <ExternalLinkIcon /></a>
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </Ctx.Provider>
  );
}

function Allocation({ a, onChanged }: { a: CartAllocation; onChanged: () => void }) {
  const toGo = Math.max(0, Number(a.mov.amount) - Number(a.subtotal.amount));
  return (
    <section className="panel space-y-3 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-medium">Supplier {a.fid}</p>
        <p className="num text-sm"><span className="font-semibold">{money(a.subtotal)}</span> <span className="text-muted-foreground">of {money(a.mov)} MOV</span></p>
      </div>
      <div className="space-y-1">
        <Progress value={a.movProgress * 100} className={cn("h-2", a.isMovMet && "[&>*]:bg-pass")} aria-label="Progress to MOV" />
        <p className="text-xs">{a.isMovMet ? <Badge variant="pass">MOV met</Badge> : <span className="text-warn">{money({ amount: String(toGo), currency: a.mov.currency })} to go</span>}
          {a.deliveryWeeks != null && <span className="ml-2 text-muted-foreground">about {a.deliveryWeeks} wk delivery</span>}</p>
      </div>
      <ul className="divide-y">
        {a.lines.map((l) => <Line key={l.qid} allocationQid={a.qid} l={l} onChanged={onChanged} />)}
      </ul>
    </section>
  );
}

function Line({ allocationQid, l, onChanged }: { allocationQid: string; l: CartLine; onChanged: () => void }) {
  const { confirm } = useDialogs();
  const [qty, setQty] = useState(String(l.quantity));
  const [busy, setBusy] = useState(false);
  const changed = Number(qty) !== l.quantity;
  async function save() {
    setBusy(true);
    try {
      await api("/api/qogita/cart/lines", { method: "PATCH", json: { allocationQid, lineQid: l.qid, quantity: Number(qty), unit: l.unit } });
      toast.success(`${l.name}: quantity ${Number(qty).toLocaleString("en-GB")}`);
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!(await confirm({ title: `Remove ${l.name}?`, description: "It comes out of your Qogita cart.", confirmLabel: "Remove", destructive: true }))) return;
    setBusy(true);
    try {
      await api(`/api/qogita/cart/lines?allocation=${allocationQid}&line=${l.qid}`, { method: "DELETE" });
      toast.success(`Removed ${l.name}`);
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <li className="space-y-1.5 py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm leading-snug">{l.name}</p>
          <p className="num text-2xs text-muted-foreground">{l.gtin} · {money(l.price)} each{l.unit > 1 ? ` · case of ${l.unit}` : ""}{l.availableQuantity != null ? ` · ${l.availableQuantity.toLocaleString("en-GB")} available` : ""}</p>
          {l.warnings.map((w) => <Badge key={w} variant="warn" className="mt-1 mr-1">{w}</Badge>)}
        </div>
        <p className="num flex-none text-sm font-medium">{money(l.subtotal)}</p>
      </div>
      <div className="flex items-center gap-2">
        <Input aria-label={`Quantity of ${l.name}`} className="num h-8 w-24" type="number" min={l.unit} step={l.unit} value={qty} onChange={(e) => setQty(e.target.value)} />
        {changed && <Button size="sm" disabled={busy} onClick={save}>Update</Button>}
        <Button variant="ghost" size="icon-sm" className="ml-auto text-muted-foreground hover:text-fail" aria-label={`Remove ${l.name}`} disabled={busy} onClick={remove}><Trash2Icon /></Button>
      </div>
    </li>
  );
}

/** Top-bar button that opens the cart. */
export function QogitaCartButton() {
  const cart = useQogitaCart();
  if (!cart) return null;
  return (
    <Button variant="ghost" size="sm" onClick={cart.openCart} aria-label="Open the Qogita cart">
      <ShoppingCartIcon /> <span className="hidden md:inline">Cart</span>
      {cart.lineCount != null && cart.lineCount > 0 && <Badge variant="brand" className="num">{cart.lineCount}</Badge>}
    </Button>
  );
}
