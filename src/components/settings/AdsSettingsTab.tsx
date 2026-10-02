"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/ui/client";

/** The Ads workspace's settings: the target ACoS, with what break-even means. */
export function AdsSettingsTab() {
  const [acos, setAcos] = useState<string | null>(null);
  const [cpc, setCpc] = useState("");
  const [cpcAuto, setCpcAuto] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ settings: { targetAcos: number; cpc: number; cpcAuto: boolean } }>("/api/ads/settings").then((r) => {
      setAcos(String(r.settings.targetAcos));
      setCpc(r.settings.cpc.toFixed(2));
      setCpcAuto(r.settings.cpcAuto);
    }).catch((e: Error) => setError(e.message));
  }, []);
  if (error) return <ErrorState title="Couldn't load the Ads settings" message={error} />;
  if (acos == null) return <Skeleton className="h-40 rounded-lg" />;
  const save = async () => {
    try {
      const r = await api<{ settings: { targetAcos: number; cpc: number; cpcAuto: boolean } }>("/api/ads/settings", { method: "PUT", json: { targetAcos: Number(acos), cpc: Number(cpc), cpcAuto } });
      setAcos(String(r.settings.targetAcos));
      setCpc(r.settings.cpc.toFixed(2));
      setCpcAuto(r.settings.cpcAuto);
      toast.success("Saved");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <section className="panel space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="section-label">Ads</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">The default target ACoS for the Ads dashboard&apos;s products and search-term chips (a product can have its own), and the CPC behind Private label&apos;s ads-per-unit estimate.</p>
        </div>
        <Button variant="outline" onClick={save}>Save</Button>
      </div>
      <label className="block max-w-xs space-y-1.5">
        <span className="field-label">Target ACoS (%)</span>
        <Input className="num" type="number" step="any" min={1} max={99} value={acos} onChange={(e) => setAcos(e.target.value)} />
        <span className="block text-2xs text-muted-foreground">Default 30%. A product&apos;s own target (launch or steady) is set on the dashboard</span>
      </label>
      <div className="flex flex-wrap items-end gap-4">
        <label className="block max-w-xs space-y-1.5">
          <span className="field-label">CPC (£)</span>
          <Input className="num" type="number" step="0.01" min={0.01} value={cpc} disabled={cpcAuto} onChange={(e) => setCpc(e.target.value)} />
          <span className="block text-2xs text-muted-foreground">Private label&apos;s launch ads per unit = CPC ÷ conversion. Default £0.60</span>
        </label>
        <label className="flex items-center gap-2 pb-6 text-sm"><Switch checked={cpcAuto} onCheckedChange={setCpcAuto} /> Follow the account&apos;s trailing CPC after each import</label>
      </div>
      <p className="max-w-3xl text-sm text-muted-foreground">
        The rules&apos; thresholds (harvest, negatives, bid changes, pause, placements, budgets, revive) are set on <Link className="underline" href="/ads/rules">Ads → Rules</Link>, with on/off, mode and a dry run per rule.
      </p>
      <p className="max-w-3xl rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted-foreground">
        <b className="text-foreground">Break-even ACoS</b> is a product&apos;s margin before ads: profit before advertising ÷ sale price. Spend more than that on ads per sale and each ad sale loses money. A product with a 35% margin breaks even at 35% ACoS; a 30% target leaves 5 points of profit on ad sales. Keep the target below each product&apos;s break-even, and lower for products with thin margins.
      </p>
    </section>
  );
}
