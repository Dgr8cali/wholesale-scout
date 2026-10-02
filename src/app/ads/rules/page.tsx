"use client";

import { LoaderIcon, PlayIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { usePageCrumbs } from "@/components/Crumbs";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { RULES, type RuleConfig, type RuleId, type RuleMeta, type RulesConfig, type Threshold } from "@/lib/ads/rules";
import { api } from "@/lib/ui/client";
import { cn } from "@/lib/utils";

interface DryRun { counts: Record<RuleId, { total: number; byAsin: Record<string, number> }>; notes: Partial<Record<RuleId, string[]>> }

const UNIT: Record<Threshold["unit"], string> = { count: "", times: "×", pct: "%", gbp: "£", days: "days", points: "points" };

/** Ads → Rules: each rule's thresholds, on/off and mode, with what it would propose now. */
export default function AdsRulesPage() {
  usePageCrumbs([{ label: "Ads", href: "/ads/dashboard" }, { label: "Rules" }]);
  const [saved, setSaved] = useState<RulesConfig | null>(null);
  const [draft, setDraft] = useState<RulesConfig | null>(null);
  const [dry, setDry] = useState<DryRun | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (config?: RulesConfig) => {
    setRunning(true);
    try {
      setDry(await api<DryRun>("/api/ads/rules/dry-run", { method: "POST", json: { config } }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  }, []);
  useEffect(() => {
    api<{ config: RulesConfig }>("/api/ads/rules").then((r) => { setSaved(r.config); setDraft(r.config); run(r.config); }).catch((e: Error) => setError(e.message));
  }, [run]);

  if (error) return <ErrorState title="Couldn't load the rules" message={error} />;
  if (!saved || !draft) return <Skeleton className="h-96 rounded-lg" />;

  const edit = (id: RuleId, patch: Partial<RuleConfig>) => setDraft((d) => d && { ...d, [id]: { ...d[id], ...patch, thresholds: { ...d[id].thresholds, ...(patch.thresholds ?? {}) } } });
  const save = async (id: RuleId) => {
    try {
      const r = await api<{ config: RulesConfig }>("/api/ads/rules", { method: "PUT", json: { rule: id, ...draft[id] } });
      setSaved(r.config);
      setDraft((d) => d && { ...d, [id]: r.config[id] });
      toast.success("Saved. Proposals use it from now on.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const changed = (id: RuleId) => JSON.stringify(saved[id]) !== JSON.stringify(draft[id]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-3xl">
          <h1 className="page-title">Rules</h1>
          <p className="text-sm text-muted-foreground">The rules behind <Link className="underline" href="/ads/proposals">Proposals</Link>. Each runs on the imported data whenever you import or open Proposals; what it suggests waits for your approval. The target ACoS is each product&apos;s (launch or steady) on the dashboard, else Settings → Ads.</p>
        </div>
        <Button variant="outline" onClick={() => run(draft)} disabled={running}>{running ? <LoaderIcon className="animate-spin" /> : <PlayIcon />} Dry run with these settings</Button>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {RULES.map((r) => <RuleCard key={r.id} meta={r} cfg={draft[r.id]} changed={changed(r.id)} dry={dry} running={running} onEdit={(p) => edit(r.id, p)} onSave={() => save(r.id)} onReset={() => setDraft((d) => d && { ...d, [r.id]: saved[r.id] })} />)}
      </div>
    </div>
  );
}

function RuleCard({ meta, cfg, changed, dry, running, onEdit, onSave, onReset }: { meta: RuleMeta; cfg: RuleConfig; changed: boolean; dry: DryRun | null; running: boolean; onEdit: (p: Partial<RuleConfig>) => void; onSave: () => void; onReset: () => void }) {
  const count = dry?.counts[meta.id];
  const notes = dry?.notes[meta.id] ?? [];
  return (
    <section className={cn("panel space-y-3 p-4", !cfg.enabled && "opacity-70")}>
      <div className="flex items-start gap-3">
        <div className="flex-1 space-y-1">
          <h2 className="font-semibold">{meta.label}</h2>
          <p className="text-sm text-muted-foreground">{meta.summary}</p>
        </div>
        <label className="flex items-center gap-2 text-sm"><Switch checked={cfg.enabled} onCheckedChange={(v) => onEdit({ enabled: v })} aria-label={`${meta.label} on`} />{cfg.enabled ? "On" : "Off"}</label>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
        {meta.thresholds.map((t) => (
          <label key={t.key} className="space-y-1">
            <span className="field-label">{t.label}{UNIT[t.unit] ? ` (${UNIT[t.unit]})` : ""}</span>
            <Input className="num h-8" type="number" step="any" min={0} value={cfg.thresholds[t.key]} onChange={(e) => onEdit({ thresholds: { [t.key]: e.target.value === "" ? t.default : Number(e.target.value) } })} />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm"><span className="field-label">Mode</span>
          <NativeSelect value={cfg.mode} onChange={(e) => onEdit({ mode: e.target.value as RuleConfig["mode"] })}>
            <NativeSelectOption value="propose">Propose</NativeSelectOption>
            <NativeSelectOption value="auto">Auto</NativeSelectOption>
          </NativeSelect></label>
        <span className="text-xs text-muted-foreground">{cfg.mode === "auto" ? "Applies automatically once the Amazon Ads API is connected. Until then it proposes, like Propose." : "Each change waits for your approval."}</span>
        {changed && <span className="ml-auto flex gap-1"><Button size="xs" variant="ghost" onClick={onReset}>Reset</Button><Button size="xs" onClick={onSave}>Save</Button></span>}
      </div>
      <div className="rounded-md bg-surface-2 px-3 py-2 text-sm">
        {!count ? <span className="text-muted-foreground">{running ? "Running…" : "—"}</span> : (
          <>
            <b>{count.total}</b> proposal{count.total === 1 ? "" : "s"} now{changed ? " (with these unsaved settings, after a dry run)" : ""}
            {Object.entries(count.byAsin).length > 0 && <span className="text-muted-foreground">: {Object.entries(count.byAsin).map(([a, n]) => `${a} ${n}`).join(", ")}</span>}
          </>
        )}
        {notes.map((n) => <p key={n} className="text-xs text-warn">{n}</p>)}
      </div>
    </section>
  );
}
