"use client";

import { LoaderIcon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { asinFromUrl } from "@/lib/check/parse";
import { api } from "@/lib/ui/client";

type Hit = { asin: string; ean: string; title: string | null; brand: string | null };

/**
 * "Record a purchase" from anywhere: find the product by ASIN, Amazon link, EAN or name and open
 * its page with the purchase form ready. A product the app hasn't seen is checked first.
 */
export function RecordPurchaseDialog({ variant = "default" }: { variant?: "default" | "outline" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [unknown, setUnknown] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = (asin: string) => { setOpen(false); router.push(`/products/${asin}?record=1#purchases`); };

  async function find() {
    const s = q.trim();
    if (!s) return;
    setBusy(true);
    setUnknown(null);
    try {
      const asin = /^https?:\/\//i.test(s) ? asinFromUrl(s) : /^[A-Z0-9]{10}$/i.test(s) && /[A-Z]/i.test(s) ? s.toUpperCase() : null;
      const r = await api<{ products: Hit[] }>(`/api/products/find?q=${encodeURIComponent(asin ?? s)}`);
      if (asin && r.products.some((p) => p.asin === asin)) return go(asin);
      if (asin) { setUnknown(asin); setHits([]); return; }
      setHits(r.products);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function checkFirst(asin: string) {
    setBusy(true);
    try {
      await api("/api/check", { method: "POST", json: { text: asin } });
      go(asin);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant={variant} onClick={() => { setOpen(true); setQ(""); setHits(null); setUnknown(null); }}><PlusIcon /> Record a purchase</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record a purchase</DialogTitle>
            <DialogDescription>Which product? Its page opens with the purchase form ready: units, landed cost, supplier and date.</DialogDescription>
          </DialogHeader>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void find(); }}>
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="ASIN, Amazon link, EAN or name" aria-label="Product" />
            <Button type="submit" disabled={busy || !q.trim()}>{busy ? <LoaderIcon className="animate-spin" /> : "Find"}</Button>
          </form>
          {unknown && (
            <div className="space-y-2 rounded-lg bg-muted/60 p-3 text-sm">
              <p><b className="num">{unknown}</b> isn&apos;t in the app yet. Check it first (a few Keepa tokens, and it appears in Runs as an ASIN check); its page then opens with the purchase form.</p>
              <Button size="sm" disabled={busy} onClick={() => checkFirst(unknown)}>{busy ? <LoaderIcon className="animate-spin" /> : null} Check {unknown} and record</Button>
            </div>
          )}
          {hits && !unknown && (hits.length ? (
            <ul className="max-h-72 divide-y overflow-y-auto">
              {hits.map((h) => (
                <li key={h.asin}>
                  <button type="button" className="w-full px-1 py-2 text-left hover:bg-muted" onClick={() => go(h.asin)}>
                    <span className="line-clamp-1 text-sm">{h.title ?? h.asin}</span>
                    <span className="num text-2xs text-muted-foreground">{h.asin}{h.brand ? ` · ${h.brand}` : ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">Nothing matches. Try the ASIN or paste the Amazon link.</p>)}
        </DialogContent>
      </Dialog>
    </>
  );
}
