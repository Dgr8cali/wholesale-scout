"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { RateCard } from "@/lib/fees/rateCard";
import { referralOptions } from "@/lib/pl/gatekeeper";
import { api } from "@/lib/ui/client";

/** New candidate: a name, the niche keyword, the referral category and up to ten page-one ASINs (Keepa fetched on save). */
export function NewCandidate({ open, onOpenChange, card, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; card: RateCard; onCreated: (id: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [niche, setNiche] = useState("");
  const [category, setCategory] = useState("Home Products");
  const [asins, setAsins] = useState("");
  const [busy, setBusy] = useState(false);
  const count = new Set(asins.toUpperCase().split(/[\s,;]+/).filter((a) => /^[A-Z0-9]{10}$/.test(a))).size;
  const save = async () => {
    setBusy(true);
    try {
      const r = await api<{ candidate: { id: string }; refresh: { tokensUsed: number; fetched: string[]; missing: string[] } | null }>("/api/pl/candidates", { method: "POST", json: { name, niche_keyword: niche, category, asins } });
      if (r.refresh) toast.success(`Keepa: ${r.refresh.fetched.length} fetched, ${r.refresh.tokensUsed} tokens.${r.refresh.missing.length ? ` Not found on amazon.co.uk: ${r.refresh.missing.join(", ")}.` : ""}`);
      await onCreated(r.candidate.id);
      onOpenChange(false);
      setName(""); setNiche(""); setAsins("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New candidate</DialogTitle>
          <DialogDescription>Keepa is fetched on save: about 3 tokens for the reference listing (with its Buy Box history) and 1–2 for each other ASIN. Snapshots under 7 days old are reused.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <label className="space-y-1.5"><span className="field-label">Name</span><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Working name" autoFocus /></label>
          <label className="space-y-1.5"><span className="field-label">Niche keyword</span><Input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="e.g. bamboo cutlery tray" />
            <span className="block text-xs text-muted-foreground">As Opportunity Explorer titles the niche: a capture with this title attaches by itself.</span></label>
          <label className="space-y-1.5"><span className="field-label">Referral category</span>
            <NativeSelect className="w-full" value={category} onChange={(e) => setCategory(e.target.value)}>
              {referralOptions(card).map((o) => <NativeSelectOption key={o.name} value={o.name}>{o.name} — {o.rates}</NativeSelectOption>)}
            </NativeSelect></label>
          <label className="space-y-1.5"><span className="field-label">Page-one ASINs ({Math.min(count, 10)}/10)</span>
            <Textarea className="num h-32 text-xs" value={asins} onChange={(e) => setAsins(e.target.value)} placeholder={"One per line or comma-separated.\nThe first is the reference listing."} /></label>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={!name.trim()} loading={busy}>{count ? "Save and fetch Keepa" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
