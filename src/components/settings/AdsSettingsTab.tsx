"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/ui/client";

/** The Ads workspace's settings: the target ACoS, with what break-even means. */
export function AdsSettingsTab() {
  const [acos, setAcos] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ settings: { targetAcos: number } }>("/api/ads/settings").then((r) => setAcos(String(r.settings.targetAcos))).catch((e: Error) => setError(e.message));
  }, []);
  if (error) return <ErrorState title="Couldn't load the Ads settings" message={error} />;
  if (acos == null) return <Skeleton className="h-40 rounded-lg" />;
  const save = async () => {
    try {
      const r = await api<{ settings: { targetAcos: number } }>("/api/ads/settings", { method: "PUT", json: { targetAcos: Number(acos) } });
      setAcos(String(r.settings.targetAcos));
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
          <p className="max-w-3xl text-sm text-muted-foreground">For the Ads workspace, which is coming once Amazon Ads API access is approved. Nothing uses these yet.</p>
        </div>
        <Button variant="outline" onClick={save}>Save</Button>
      </div>
      <label className="block max-w-xs space-y-1.5">
        <span className="field-label">Target ACoS (%)</span>
        <Input className="num" type="number" step="any" min={1} max={99} value={acos} onChange={(e) => setAcos(e.target.value)} />
        <span className="block text-2xs text-muted-foreground">Default 30%</span>
      </label>
      <p className="max-w-3xl rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted-foreground">
        <b className="text-foreground">Break-even ACoS</b> is a product&apos;s margin before ads: profit before advertising ÷ sale price. Spend more than that on ads per sale and each ad sale loses money. A product with a 35% margin breaks even at 35% ACoS; a 30% target leaves 5 points of profit on ad sales. Keep the target below each product&apos;s break-even, and lower for products with thin margins.
      </p>
    </section>
  );
}
