"use client";

import { ListFilterIcon, PlayIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { SectionTitle } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { LOOKBACKS, RULES, type RuleConfig, type RuleId, type RuleMeta, type RulesConfig, type Threshold } from "@/lib/ads/rules";
import { api } from "@/lib/ui/client";
import { cn } from "@/lib/utils";

interface DryRun { counts: Record<RuleId, { total: number; byAsin: Record<string, number> }>; notes: Partial<Record<RuleId, string[]>> }

const UNIT: Record<Threshold["unit"], string> = { count: "", times: "×", pct: "%", gbp: "£", days: "days", points: "points" };

/** Ads → Rules → Rules: each rule's thresholds, on/off and mode, with what it would propose now. */
export function RulesTab() {
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle title="Dry run by product">The proposals each rule would make now, with the settings on screen (saved or not). Nothing is proposed or changed by a dry run.</SectionTitle>
        <Button variant="secondary" onClick={() => run(draft)} loading={running}><PlayIcon /> Dry run with these settings</Button>
      </div>
      {dry && <DryRunByProduct dry={dry} />}
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
          <h2 className="text-base font-semibold">{meta.label}</h2>
          <p className="text-meta text-muted-foreground">{meta.summary}</p>
        </div>
        <label className="flex flex-none cursor-pointer items-center gap-2 text-sm"><Switch checked={cfg.enabled} onCheckedChange={(v) => onEdit({ enabled: v })} aria-label={`${meta.label} on`} />{cfg.enabled ? "On" : "Off"}</label>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
        {meta.lookback != null && (
          <label className="space-y-1" title="The days of data this rule reads, to the latest import: search terms from the imports in the window, daily rows in it, rank checks in it">
            <span className="field-label">Looks back over</span>
            <NativeSelect className="w-full" value={String(cfg.lookbackDays ?? meta.lookback)} onChange={(e) => onEdit({ lookbackDays: Number(e.target.value) })}>
              {LOOKBACKS.map((d) => <NativeSelectOption key={d} value={d}>{d} days{d === meta.lookback ? " (default)" : ""}</NativeSelectOption>)}
            </NativeSelect>
          </label>
        )}
        {meta.thresholds.map((t) => (
          <label key={t.key} className="space-y-1">
            <span className="field-label">{t.label}{UNIT[t.unit] ? ` (${UNIT[t.unit]})` : ""}</span>
            <Input className="num" type="number" step="any" min={0} value={cfg.thresholds[t.key]} onChange={(e) => onEdit({ thresholds: { [t.key]: e.target.value === "" ? t.default : Number(e.target.value) } })} />
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
        {changed && <span className="ml-auto flex gap-1"><Button size="sm" variant="ghost" onClick={onReset}>Reset</Button><Button size="sm" variant="secondary" onClick={onSave}>Save</Button></span>}
      </div>
      <div className="rounded-lg bg-subtle px-3 py-2 text-sm">
        {!count ? <span className="text-muted-foreground">{running ? "Running…" : "—"}</span> : (
          <>
            <b className="num">{count.total}</b> proposal{count.total === 1 ? "" : "s"} now{changed ? " (with these unsaved settings, after a dry run)" : ""}
            {Object.entries(count.byAsin).length > 0 && <span className="text-muted-foreground">: {Object.entries(count.byAsin).map(([a, n]) => `${a} ${n}`).join(", ")}</span>}
          </>
        )}
        {notes.map((n) => <p key={n} className="text-xs text-warn-ink">{n}</p>)}
      </div>
    </section>
  );
}

/** The dry run per product: what each rule would propose for it now. */
function DryRunByProduct({ dry }: { dry: DryRun }) {
  const rows = [...new Set(Object.values(dry.counts).flatMap((c) => Object.keys(c.byAsin)))].sort().map((asin) => ({ asin }));
  const firing = RULES.filter((r) => dry.counts[r.id]?.total);
  const total = (asin: string) => firing.reduce((x, r) => x + (dry.counts[r.id].byAsin[asin] ?? 0), 0);
  if (!rows.length) return <EmptyState icon={<ListFilterIcon />} title="Nothing to propose">No rule would propose anything on the data imported now.</EmptyState>;
  const columns: DataColumn<{ asin: string }>[] = [
    { id: "product", header: "Product", mobile: "title", sortValue: (r) => r.asin, cell: (r) => <span className="num">{r.asin}</span> },
    ...firing.map((rule): DataColumn<{ asin: string }> => ({ id: rule.id, header: rule.label, numeric: true, sortValue: (r) => dry.counts[rule.id].byAsin[r.asin] ?? null, cell: (r) => dry.counts[rule.id].byAsin[r.asin] ?? "—" })),
    { id: "all", header: "All", numeric: true, mobile: 1, sortValue: (r) => total(r.asin), cell: (r) => <span className="font-medium">{total(r.asin)}</span> },
  ];
  return <DataTable rows={rows} columns={columns} getRowId={(r) => r.asin} storageKey="ads.dryrun" caption="Dry run by product" />;
}
