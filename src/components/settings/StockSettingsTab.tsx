"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/ui/client";

interface S { lowStockDefault: number; coverTargetDays: number; leadBufferDays: number }

/** The Stock workspace's settings: the low-stock default, the days of cover to order for, the reorder buffer. */
export function StockSettingsTab() {
  const [v, setV] = useState<Record<keyof S, string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fill = (s: S) => setV({ lowStockDefault: String(s.lowStockDefault), coverTargetDays: String(s.coverTargetDays), leadBufferDays: String(s.leadBufferDays) });
  useEffect(() => { api<{ settings: S }>("/api/stock/settings").then((r) => fill(r.settings)).catch((e: Error) => setError(e.message)); }, []);
  if (error) return <ErrorState title="Couldn't load the Stock settings" message={error} />;
  if (!v) return <Skeleton className="h-40 rounded-lg" />;
  const save = async () => {
    try {
      const r = await api<{ settings: S }>("/api/stock/settings", { method: "PUT", json: { lowStockDefault: Number(v.lowStockDefault), coverTargetDays: Number(v.coverTargetDays), leadBufferDays: Number(v.leadBufferDays) } });
      fill(r.settings);
      toast.success("Saved");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const field = (k: keyof S, label: string, hint: string) => (
    <label className="block max-w-xs space-y-1.5">
      <span className="field-label">{label}</span>
      <Input className="num" type="number" min={0} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
      <span className="block text-2xs text-muted-foreground">{hint}</span>
    </label>
  );
  return (
    <section className="panel space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="section-label">Stock</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">How Stock judges levels and reorders. An item&apos;s own low-stock level and lead time win over these.</p>
        </div>
        <Button variant="outline" onClick={save}>Save</Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {field("lowStockDefault", "Low-stock default (units)", "An item is low at or under this when it has no level of its own. Default 10")}
        {field("coverTargetDays", "Days of cover to order", "Reorder's suggested quantity: this many days of sales. Default 30")}
        {field("leadBufferDays", "Reorder lead-time buffer (days)", "Reorder point = (lead time + this) × units a day. Default 7")}
      </div>
    </section>
  );
}
