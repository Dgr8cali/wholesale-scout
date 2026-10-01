"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SETTINGS_DEF, type Settings } from "@/lib/pl/gatekeeper";
import { api } from "@/lib/ui/client";

/** Gatekeeper's thresholds and cost assumptions for Private label (shared by every candidate). */
export function PlSettingsTab() {
  const [s, setS] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fill = (x: Settings) => setS(Object.fromEntries(Object.entries(x).map(([k, v]) => [k, String(v)])));
  useEffect(() => {
    api<{ settings: Settings }>("/api/pl/settings").then((r) => fill(r.settings)).catch((e: Error) => setError(e.message));
  }, []);
  if (error) return <ErrorState title="Couldn't load the private-label settings" message={error} />;
  if (!s) return <Skeleton className="h-64 rounded-lg" />;
  const bad = SETTINGS_DEF.filter((d) => s[d.k] === "" || !Number.isFinite(Number(s[d.k]))).map((d) => d.label);
  const save = async () => {
    setSaving(true);
    try {
      fill((await api<{ settings: Settings }>("/api/pl/settings", { method: "PUT", json: Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Number(v)])) })).settings);
      toast.success("Saved: every candidate is scored with these now");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="panel space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="section-label">Private label</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">Gatekeeper&apos;s budget, cost assumptions and Gate 6 floors, used for every candidate on the Private label page. Fees come from the rate card under Fees. Peak rates (October–December) apply automatically by date, as in screening.</p>
        </div>
        <Button variant="outline" onClick={save} disabled={saving || bad.length > 0}>Save</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SETTINGS_DEF.map((d) => (
          <label key={d.k} className="space-y-1.5">
            <span className="field-label">{d.label} ({d.unit})</span>
            <Input className="num" type="number" step="any" value={s[d.k]} onChange={(e) => setS({ ...s, [d.k]: e.target.value })} />
            <span className="block text-2xs text-muted-foreground">Gatekeeper default {d.d}</span>
          </label>
        ))}
      </div>
      {bad.length > 0 && <p className="text-sm text-fail">Needs a number: {bad.join(", ")}</p>}
    </section>
  );
}
