"use client";

import { FilterIcon, GaugeIcon, ReceiptIcon, ShieldCheckIcon, SlidersHorizontalIcon, Trash2Icon, UndoIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { activeChips, normalizeFilters, type FilterSet } from "@/lib/filters";
import type { RateCard } from "@/lib/fees/rateCard";
import {
  COMPLIANCE_RULE_KEYS,
  GATE_LABELS,
  GATE_ORDER,
  GROUP_LABELS,
  SCALE_DEFS,
  type GateConfigs,
  type GateId,
  type GateMode,
  type GroupId,
  type ProfileConfig,
} from "@/lib/screening/config";
import type { CategoryRule } from "@/lib/screening/rules";
import { api } from "@/lib/ui/client";

import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useDialogs } from "@/components/Dialogs";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
interface Profile { id: string; name: string; config: ProfileConfig; is_default: boolean }

/** Numeric parameters per gate, as shown in Settings. */
const GATE_PARAMS: Record<GateId, { key: string; label: string; unit?: string; step?: number }[]> = {
  priceBand: [{ key: "min", label: "Min sell price", unit: "£", step: 0.5 }, { key: "max", label: "Max sell price", unit: "£", step: 0.5 }],
  compliance: [],
  budgetFit: [{ key: "maxLineSharePct", label: "Max first order per line", unit: "% of budget" }],
  matchQuality: [],
  mirage: [{ key: "minHistoryDays", label: "Min rank history", unit: "days" }, { key: "maxReviewJumpPct", label: "Max one-day review jump", unit: "%" }],
  amazonPresence: [{ key: "days", label: "Amazon held an offer in the last", unit: "days" }],
  competition: [{ key: "minSellers", label: "Min FBA sellers" }, { key: "maxSellers", label: "Max FBA sellers" }, { key: "maxBbSharePct", label: "Max top-seller Buy Box share", unit: "%" }],
  demand: [{ key: "minRankDrops30d", label: "Min rank drops / 30 days" }, { key: "maxAvgRank90d", label: "Max 90-day average rank", step: 1000 }],
  priceRegime: [{ key: "spikePct", label: "Spike tolerance over median", unit: "%" }],
  priceDrift: [{ key: "maxDeclinePctYr", label: "Max Buy Box decline", unit: "% / year" }],
  gating: [],
  fees: [{ key: "minProfit", label: "Min profit / unit", unit: "£", step: 0.1 }, { key: "minRoiPct", label: "Min ROI", unit: "%" }, { key: "minMarginPct", label: "Min margin", unit: "%" }],
};

const GATE_NEEDS: Record<GateId, string> = {
  priceBand: "Row", compliance: "Row", budgetFit: "Row + ledger", matchQuality: "Keepa / catalog", mirage: "Keepa",
  amazonPresence: "Keepa", competition: "Keepa / SP-API", demand: "Keepa / SP-API", priceRegime: "Keepa", priceDrift: "Keepa",
  gating: "SP-API", fees: "Rate card / SP-API",
};

const MODES: GateMode[] = ["off", "warn", "fail"];

function NumberField({ label, unit, value, step, onChange }: { label: string; unit?: string; value: number; step?: number; onChange: (n: number) => void }) {
  return (
    <label className="space-y-1.5">
      <span className="field-label">{label}{unit ? ` (${unit})` : ""}</span>
      <Input className="num" type="number" step={step ?? "any"} value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))} />
    </label>
  );
}

function ModeSelect({ value, onChange, allowOff = true }: { value: GateMode; onChange: (m: GateMode) => void; allowOff?: boolean }) {
  const cls = value === "fail" ? "text-fail" : value === "warn" ? "text-warn" : "text-muted-foreground";
  return (
    <NativeSelect className={`w-24 font-medium ${cls}`} value={value} onChange={(e) => onChange(e.target.value as GateMode)}>
      {MODES.filter((m) => allowOff || m !== "off").map((m) => <NativeSelectOption key={m} value={m}>{m}</NativeSelectOption>)}
    </NativeSelect>
  );
}

type ProfileTab = "gates" | "score" | "fees" | "profiles";
const TABS: { id: ProfileTab | "waived" | "filters"; label: string; icon: ReactNode }[] = [
  { id: "gates", label: "Gates", icon: <ShieldCheckIcon /> },
  { id: "score", label: "Score", icon: <GaugeIcon /> },
  { id: "fees", label: "Fees", icon: <ReceiptIcon /> },
  { id: "profiles", label: "Profiles", icon: <SlidersHorizontalIcon /> },
  { id: "waived", label: "Waived", icon: <UndoIcon /> },
  { id: "filters", label: "Filter sets", icon: <FilterIcon /> },
];

/** A settings block: a titled card with an optional note and actions. */
function Section({ title, note, actions, children, className }: { title: ReactNode; note?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("panel space-y-4 p-4 sm:p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="section-title">{title}</h2>
          {note && <p className="max-w-3xl text-sm text-muted-foreground">{note}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

const LoadingBlocks = () => <div className="space-y-4"><Skeleton className="h-16 rounded-xl" /><Skeleton className="h-64 rounded-xl" /><Skeleton className="h-40 rounded-xl" /></div>;
const LoadError = ({ message }: { message: string }) => <p className="rounded-md bg-fail-soft px-3 py-2 text-sm text-fail">Couldn&apos;t load: {message}</p>;

export default function SettingsPage() {
  const [tab, setTab] = useState<string>("gates");
  const editor = useProfileEditor();
  const profileTab = tab === "gates" || tab === "score" || tab === "fees" || tab === "profiles";
  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">Settings</h1>
        <p className="text-sm text-muted-foreground">Screening profiles (gates, score and fees), shared rules and rate card, waived gates and saved filter sets.</p>
      </div>
      <Tabs value={tab} onValueChange={setTab} className="gap-5">
        <TabsList variant="line" className="w-full justify-start overflow-x-auto border-b">
          {TABS.map((t) => <TabsTrigger key={t.id} value={t.id} className="flex-none">{t.icon}{t.label}</TabsTrigger>)}
        </TabsList>
        {profileTab && <ProfileBar editor={editor} manage={tab === "profiles"} />}
        <TabsContent value="gates" className="space-y-5">{editor.ready ? <GatesTab editor={editor} /> : editor.error ? <LoadError message={editor.error} /> : <LoadingBlocks />}</TabsContent>
        <TabsContent value="score" className="space-y-5">{editor.ready ? <ScoreTab editor={editor} /> : editor.error ? <LoadError message={editor.error} /> : <LoadingBlocks />}</TabsContent>
        <TabsContent value="fees" className="space-y-5">{editor.ready ? <FeesTab editor={editor} /> : editor.error ? <LoadError message={editor.error} /> : <LoadingBlocks />}</TabsContent>
        <TabsContent value="profiles" className="space-y-5">{editor.ready ? <ProfilesTab editor={editor} /> : editor.error ? <LoadError message={editor.error} /> : <LoadingBlocks />}</TabsContent>
        <TabsContent value="waived"><Waived /></TabsContent>
        <TabsContent value="filters"><FilterSets /></TabsContent>
      </Tabs>
    </div>
  );
}

/** The profile being edited, shared by the Gates, Score, Fees and Profiles tabs. */
function useProfileEditor() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [id, setId] = useState<string>("");
  const [draft, setDraft] = useState<ProfileConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rules, setRules] = useState<CategoryRule[]>([]);
  const { confirm, prompt } = useDialogs();

  const apply = useCallback((list: Profile[], select?: string) => {
    setProfiles(list);
    const pick = list.find((p) => p.id === select) ?? list.find((p) => p.is_default) ?? list[0];
    if (pick) {
      setId(pick.id);
      setDraft(structuredClone(pick.config));
    }
  }, []);
  const load = async (select?: string) => apply((await api<{ profiles: Profile[] }>("/api/profiles")).profiles, select);

  useEffect(() => {
    api<{ profiles: Profile[] }>("/api/profiles").then((r) => apply(r.profiles)).catch((e) => setError(e.message));
    api<{ rules: CategoryRule[] }>("/api/rules").then((r) => setRules(r.rules)).catch(() => {});
  }, [apply]);

  const current = profiles.find((p) => p.id === id);
  const dirty = useMemo(() => !!current && !!draft && JSON.stringify(current.config) !== JSON.stringify(draft), [current, draft]);
  const weightSum = draft ? Object.values(draft.score.weights).reduce((a, b) => a + (Number(b) || 0), 0) : 0;
  const weightsOk = Math.abs(weightSum - 100) <= 0.01;

  async function act(fn: () => Promise<unknown>, ok: string, select?: string) {
    try {
      await fn();
      await load(select ?? id);
      toast.success(ok);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return {
    ready: !!draft, error, profiles, id, current, draft: draft!, setDraft: setDraft as (fn: ProfileConfig | ((d: ProfileConfig) => ProfileConfig)) => void,
    dirty, weightSum, weightsOk, rules, setRules,
    setGate: <G extends GateId>(g: G, patch: Partial<GateConfigs[G]>) => setDraft((d) => d && { ...d, gates: { ...d.gates, [g]: { ...d.gates[g], ...patch } } }),
    select: async (next: string) => {
      if (dirty && !(await confirm({ title: "Discard unsaved changes?", confirmLabel: "Discard", destructive: true }))) return;
      const p = profiles.find((x) => x.id === next)!;
      setId(p.id);
      setDraft(structuredClone(p.config));
    },
    discard: () => current && setDraft(structuredClone(current.config)),
    save: () => act(() => api(`/api/profiles/${id}`, { method: "PUT", json: { config: draft } }), "Saved"),
    saveAsNew: async () => {
      const name = await prompt({ title: "Save as a new profile", label: "Name", confirmLabel: "Save" });
      if (!name) return;
      try {
        const r = await api<{ id: string }>("/api/profiles", { method: "POST", json: { name, config: draft } });
        await load(r.id);
        toast.success(`Saved as "${name}"`);
      } catch (e) {
        toast.error((e as Error).message);
      }
    },
    duplicate: async (p: Profile) => {
      const name = await prompt({ title: "Duplicate profile", label: "Name for the copy", defaultValue: `${p.name} copy`, confirmLabel: "Duplicate" });
      if (!name) return;
      try {
        const r = await api<{ id: string }>("/api/profiles", { method: "POST", json: { name, fromId: p.id } });
        await load(r.id);
        toast.success(`Duplicated as "${name}"`);
      } catch (e) {
        toast.error((e as Error).message);
      }
    },
    rename: async (p: Profile) => {
      const name = await prompt({ title: "Rename profile", label: "Name", defaultValue: p.name, confirmLabel: "Rename" });
      if (name) act(() => api(`/api/profiles/${p.id}`, { method: "PUT", json: { name } }), "Renamed", id);
    },
    makeDefault: (p: Profile) => act(() => api(`/api/profiles/${p.id}`, { method: "PUT", json: { is_default: true } }), `"${p.name}" is now the default`, id),
    remove: async (p: Profile) => {
      if (await confirm({ title: `Delete "${p.name}"?`, description: "Past runs keep their own copy of its settings.", confirmLabel: "Delete", destructive: true })) {
        act(() => api(`/api/profiles/${p.id}`, { method: "DELETE" }), "Deleted", p.id === id ? "" : id);
      }
    },
  };
}
type Editor = ReturnType<typeof useProfileEditor>;

/** Which profile the tab edits, and Save / Discard for it. */
function ProfileBar({ editor: e, manage }: { editor: Editor; manage: boolean }) {
  if (!e.ready) return null;
  return (
    <div className="panel sticky top-14 z-10 flex flex-wrap items-center gap-2 p-3 shadow-xs">
      <span className="field-label">Editing</span>
      <NativeSelect className="w-56" aria-label="Profile" value={e.id} onChange={(ev) => e.select(ev.target.value)}>
        {e.profiles.map((p) => <NativeSelectOption key={p.id} value={p.id}>{p.name}{p.is_default ? " (default)" : ""}</NativeSelectOption>)}
      </NativeSelect>
      {e.dirty ? <Badge variant="warn">Unsaved changes</Badge> : <span className="text-xs text-muted-foreground">Saved</span>}
      {!e.weightsOk && <Badge variant="fail">Score weights total {e.weightSum}, not 100</Badge>}
      <div className="ml-auto flex flex-wrap gap-2">
        {e.dirty && <Button variant="ghost" onClick={e.discard}>Discard</Button>}
        {manage && <Button variant="outline" onClick={e.saveAsNew} disabled={!e.weightsOk}>Save as new profile</Button>}
        <Button disabled={!e.dirty || !e.weightsOk} onClick={e.save}>Save</Button>
      </div>
    </div>
  );
}

function GatesTab({ editor: e }: { editor: Editor }) {
  const { draft, setGate, rules } = e;
  const ruleName = (k: string) => rules.find((r) => r.key === k)?.name ?? k;
  const ruleKeys = [...new Set([...rules.map((r) => r.key), ...COMPLIANCE_RULE_KEYS])];
  return (
    <>
      <Section title="Gates" note="Run in this order. Fail drops the row and records why; warn keeps it and lowers the Risk group; off skips the gate.">
        <div className="grid gap-3 lg:grid-cols-2">
          {GATE_ORDER.map((g, i) => (
            <div key={g} className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center gap-3">
                <span className="num flex size-7 flex-none items-center justify-center rounded-md bg-muted text-xs font-semibold">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{GATE_LABELS[g]}</p>
                  <p className="text-xs text-muted-foreground">Needs: {GATE_NEEDS[g]}</p>
                </div>
                <ModeSelect value={draft.gates[g].mode} onChange={(m) => setGate(g, { mode: m } as Partial<GateConfigs[typeof g]>)} />
              </div>
              {GATE_PARAMS[g].length > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {GATE_PARAMS[g].map((p) => (
                    <NumberField key={p.key} label={p.label} unit={p.unit} step={p.step}
                      value={(draft.gates[g] as unknown as Record<string, number>)[p.key]}
                      onChange={(n) => setGate(g, { [p.key]: n } as Partial<GateConfigs[typeof g]>)} />
                  ))}
                </div>
              )}
              {g === "gating" && (
                <label className="flex flex-wrap items-center gap-2 text-sm">
                  <span>Approval needed counts as</span>
                  <ModeSelect value={draft.gates.gating.approvalRequired} onChange={(m) => setGate("gating", { approvalRequired: m })} />
                  <span className="text-xs text-muted-foreground">Blocked always uses the gate&apos;s mode</span>
                </label>
              )}
              {g === "compliance" && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {ruleKeys.map((k) => (
                    <label key={k} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate">{ruleName(k)}</span>
                      <ModeSelect value={draft.gates.compliance.rules[k] ?? "warn"}
                        onChange={(m) => setGate("compliance", { rules: { ...draft.gates.compliance.rules, [k]: m } })} />
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>
      <Rules />
    </>
  );
}

function ScoreTab({ editor: e }: { editor: Editor }) {
  const { draft, setDraft, weightSum, weightsOk } = e;
  return (
    <>
      <Section title="Scoring price" note="The sell price fees, profit and the score are worked out at.">
        <div className="max-w-md space-y-1.5">
          <span className="field-label">Score on</span>
          <NativeSelect className="w-full" value={draft.scoringPrice} onChange={(ev) => setDraft({ ...draft, scoringPrice: ev.target.value as ProfileConfig["scoringPrice"] })}>
            <NativeSelectOption value="lower">Lower of current Buy Box and 12-month median</NativeSelectOption>
            <NativeSelectOption value="current">Current Buy Box</NativeSelectOption>
            <NativeSelectOption value="median">12-month median</NativeSelectOption>
          </NativeSelect>
        </div>
      </Section>

      <Section title="Score weights" note="How much each group counts towards the 0–100 score. They must total 100."
        actions={<span className={cn("num text-sm font-medium", weightsOk ? "text-muted-foreground" : "text-fail")}>Total {weightSum} / 100</span>}>
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(GROUP_LABELS) as GroupId[]).map((g) => (
            <div key={g} className="space-y-1.5">
              <span className="field-label">{GROUP_LABELS[g]}</span>
              <div className="flex items-center gap-3">
                <Slider min={0} max={100} step={1} className="flex-1" value={[draft.score.weights[g]]} aria-label={GROUP_LABELS[g]}
                  onValueChange={([v]) => setDraft({ ...draft, score: { ...draft.score, weights: { ...draft.score.weights, [g]: v } } })} />
                <Input className="num w-16" type="number" value={draft.score.weights[g]} aria-label={`${GROUP_LABELS[g]} weight`}
                  onChange={(ev) => setDraft({ ...draft, score: { ...draft.score, weights: { ...draft.score.weights, [g]: Number(ev.target.value) } } })} />
              </div>
            </div>
          ))}
        </div>
        <div className="grid gap-3 border-t pt-4 sm:grid-cols-3">
          <NumberField label="Green (order a test) from" value={draft.score.bands.green} onChange={(n) => setDraft({ ...draft, score: { ...draft.score, bands: { ...draft.score.bands, green: n } } })} />
          <NumberField label="Amber (needs one thing to move) from" value={draft.score.bands.amber} onChange={(n) => setDraft({ ...draft, score: { ...draft.score, bands: { ...draft.score.bands, amber: n } } })} />
        </div>
      </Section>

      <Section title="Score scales" note="Each parameter maps a value to 0–100 along these points, straight lines between them and flat beyond the ends. Weight sets its pull inside its group; 0 leaves it out.">
        <div className="space-y-5">
          {(Object.keys(GROUP_LABELS) as GroupId[]).map((g) => (
            <div key={g} className="space-y-2">
              <p className="eyebrow">{GROUP_LABELS[g]}</p>
              <div className="grid gap-3 lg:grid-cols-2">
                {Object.entries(SCALE_DEFS).filter(([, d]) => d.group === g).map(([k, d]) => {
                  const sc = draft.score.scales[k];
                  const setScale = (patch: Partial<typeof sc>) => setDraft({ ...draft, score: { ...draft.score, scales: { ...draft.score.scales, [k]: { ...sc, ...patch } } } });
                  return (
                    <div key={k} className="space-y-2 rounded-lg border bg-muted/30 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{d.label}</span>
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">weight
                          <Input className="num h-7 w-14" type="number" min={0} step="any" value={sc.weight} onChange={(ev) => setScale({ weight: Number(ev.target.value) })} />
                        </label>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {sc.points.map(([x, y], i) => (
                          <div key={i} className="flex items-center gap-1 rounded-md border bg-card px-1.5 py-1">
                            <input className="num w-16 bg-transparent text-right text-xs outline-none" type="number" step="any" value={x} aria-label={`${d.label} value ${i + 1} (${d.unit})`}
                              onChange={(ev) => setScale({ points: sc.points.map((p, j) => (j === i ? [Number(ev.target.value), p[1]] : p)) as [number, number][] })} />
                            <span className="text-xs text-muted-foreground">{d.unit} →</span>
                            <input className="num w-10 bg-transparent text-right text-xs outline-none" type="number" min={0} max={100} value={y} aria-label={`${d.label} score ${i + 1}`}
                              onChange={(ev) => setScale({ points: sc.points.map((p, j) => (j === i ? [p[0], Number(ev.target.value)] : p)) as [number, number][] })} />
                            {sc.points.length > 2 && (
                              <button className="px-1 text-xs text-muted-foreground hover:text-fail" aria-label="Remove point" onClick={() => setScale({ points: sc.points.filter((_, j) => j !== i) })}>×</button>
                            )}
                          </div>
                        ))}
                        <Button variant="outline" size="xs" onClick={() => {
                          const last = sc.points[sc.points.length - 1];
                          setScale({ points: [...sc.points, [last[0] * 2 || 1, last[1]]] });
                        }}>+ point</Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

function FeesTab({ editor: e }: { editor: Editor }) {
  const { draft, setDraft } = e;
  return (
    <>
      <Section title="Fees and landed cost" note="How this profile turns a supplier price into a landed cost and Amazon's fees into profit.">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={draft.fees.vatRegistered} onCheckedChange={(on) => setDraft({ ...draft, fees: { ...draft.fees, vatRegistered: on } })} />
          VAT registered (reclaim VAT on fees and stock; pay output VAT on sales)
        </label>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField label="VAT rate" unit="%" value={draft.fees.vatRatePct} onChange={(n) => setDraft({ ...draft, fees: { ...draft.fees, vatRatePct: n } })} />
          <NumberField label="Digital services fee" unit="%" value={draft.fees.dsfPct} step={0.1} onChange={(n) => setDraft({ ...draft, fees: { ...draft.fees, dsfPct: n } })} />
          <NumberField label="Inbound to FBA" unit="£/unit" value={draft.fees.inboundPerUnit} step={0.05} onChange={(n) => setDraft({ ...draft, fees: { ...draft.fees, inboundPerUnit: n } })} />
          <NumberField label="Prep, bag and label" unit="£/unit" value={draft.fees.prepPerUnit} step={0.05} onChange={(n) => setDraft({ ...draft, fees: { ...draft.fees, prepPerUnit: n } })} />
          <NumberField label="Import duty" unit="% of cost" value={draft.fees.dutyPct} onChange={(n) => setDraft({ ...draft, fees: { ...draft.fees, dutyPct: n } })} />
          <NumberField label="Average months in storage" value={draft.fees.storageMonths} step={0.5} onChange={(n) => setDraft({ ...draft, fees: { ...draft.fees, storageMonths: n } })} />
          <NumberField label="Returns allowance" unit="% of sale" value={draft.fees.returnsPct} step={0.5} onChange={(n) => setDraft({ ...draft, fees: { ...draft.fees, returnsPct: n } })} />
          <label className="space-y-1.5">
            <span className="field-label">Storage and peak rates</span>
            <NativeSelect className="w-full" value={draft.fees.season} onChange={(ev) => setDraft({ ...draft, fees: { ...draft.fees, season: ev.target.value as ProfileConfig["fees"]["season"] } })}>
              <NativeSelectOption value="auto">By date (Oct–Dec is peak)</NativeSelectOption>
              <NativeSelectOption value="standard">Always standard</NativeSelectOption>
              <NativeSelectOption value="peak">Always peak</NativeSelectOption>
            </NativeSelect>
          </label>
          <label className="space-y-1.5">
            <span className="field-label">No dimensions: assume tier</span>
            <NativeSelect className="w-full" value={draft.fees.missingDims.tierId} onChange={(ev) => setDraft({ ...draft, fees: { ...draft.fees, missingDims: { ...draft.fees.missingDims, tierId: ev.target.value } } })}>
              {[["lightEnv", "Light envelope"], ["stdEnv", "Standard envelope"], ["largeEnv", "Large envelope"], ["xlEnv", "Extra-large envelope"], ["smallPcl", "Small parcel"], ["stdPcl", "Standard parcel"]].map(([v, l]) => <NativeSelectOption key={v} value={v}>{l}</NativeSelectOption>)}
            </NativeSelect>
          </label>
          <NumberField label="No dimensions: assume weight" unit="g" value={draft.fees.missingDims.weightG} step={50} onChange={(n) => setDraft({ ...draft, fees: { ...draft.fees, missingDims: { ...draft.fees.missingDims, weightG: n } } })} />
        </div>
      </Section>
      <Rates />
    </>
  );
}

function ProfilesTab({ editor: e }: { editor: Editor }) {
  const { draft, setDraft } = e;
  return (
    <>
      <Section title="Profiles" note="A run keeps its own copy of the profile it was screened with; re-screen a run to apply changes.">
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Name</TableHead><TableHead className="text-right">Budget</TableHead><TableHead className="text-right">Actions</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {e.profiles.map((p) => (
                <TableRow key={p.id} data-state={p.id === e.id ? "selected" : undefined}>
                  <TableCell className="font-medium">
                    <button className="hover:underline" onClick={() => e.select(p.id)}>{p.name}</button>
                    {p.is_default && <Badge variant="brand" className="ml-2">default</Badge>}
                    {p.id === e.id && <span className="ml-2 text-xs text-muted-foreground">editing</span>}
                  </TableCell>
                  <TableCell className="num text-right">£{Number(p.config.budget).toLocaleString("en-GB")}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="xs" onClick={() => e.rename(p)}>Rename</Button>
                      <Button variant="ghost" size="xs" onClick={() => e.duplicate(p)}>Duplicate</Button>
                      <Button variant="ghost" size="xs" disabled={p.is_default} onClick={() => e.makeDefault(p)}>Make default</Button>
                      <Button variant="ghost" size="xs" className="text-fail hover:text-fail" disabled={p.is_default} aria-label={`Delete ${p.name}`} onClick={() => e.remove(p)}><Trash2Icon /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>

      <Section title="Budget" note="The first order across a run; the budget-fit gate keeps any one line within its share.">
        <div className="max-w-xs"><NumberField label="Budget" unit="£" value={draft.budget} step={50} onChange={(n) => setDraft({ ...draft, budget: n })} /></div>
      </Section>

      <Section title="Seller profiles" note="For rows that pass every gate, look up the top Buy Box sellers on Keepa (1 token each, reused for 7 days) and flag a likely brand distributor.">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={draft.sellerLookup.enabled} onCheckedChange={(on) => setDraft({ ...draft, sellerLookup: { ...draft.sellerLookup, enabled: on } })} />
          Look up seller profiles
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <NumberField label="Sellers per row" value={draft.sellerLookup.topN} step={1} onChange={(n) => setDraft({ ...draft, sellerLookup: { ...draft.sellerLookup, topN: n } })} />
          <NumberField label="Distributor when brand is at least" unit="% of storefront" value={draft.sellerLookup.distributorBrandSharePct} onChange={(n) => setDraft({ ...draft, sellerLookup: { ...draft.sellerLookup, distributorBrandSharePct: n } })} />
        </div>
      </Section>
    </>
  );
}

interface SavedSet { id: string; name: string; filters: FilterSet }

/** Filter sets saved from a run's filter bar; apply them there from Saved filters. */
function FilterSets() {
  const [sets, setSets] = useState<SavedSet[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { confirm } = useDialogs();
  useEffect(() => {
    api<{ sets: SavedSet[]; unavailable?: string }>("/api/filter-sets")
      .then((r) => { setSets(r.sets); setNote(r.unavailable ?? null); })
      .catch((e) => setError(e.message));
  }, []);
  if (error) return <LoadError message={error} />;
  if (!sets) return <LoadingBlocks />;
  const remove = async (s: SavedSet) => {
    if (!(await confirm({ title: `Delete “${s.name}”?`, description: "The filter set is removed for every run.", confirmLabel: "Delete", destructive: true }))) return;
    try {
      await api(`/api/filter-sets?id=${s.id}`, { method: "DELETE" });
      setSets((xs) => xs && xs.filter((x) => x.id !== s.id));
      toast.success(`Deleted “${s.name}”`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <Section title="Filter sets" note="Saved from a run's filter bar with “Save current filters…”, and applied from Saved filters on any run or on Favourites.">
      {note && <p className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">{note}</p>}
      {!sets.length ? (
        <div className="rounded-lg border border-dashed px-6 py-10 text-center">
          <p className="font-medium">No saved filter sets</p>
          <p className="mt-1 text-sm text-muted-foreground">Set some filters on a run, then choose Saved filters → Save current filters.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Filters</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {sets.map((s) => {
                const chips = activeChips(normalizeFilters(s.filters), GATE_LABELS);
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="whitespace-normal">
                      <div className="flex flex-wrap gap-1">
                        {chips.length ? chips.map((c) => <Badge key={c.id} variant="muted">{c.label}</Badge>) : <span className="text-muted-foreground">No filters</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right"><Button variant="ghost" size="icon-xs" className="text-muted-foreground hover:text-fail" aria-label={`Delete ${s.name}`} onClick={() => remove(s)}><Trash2Icon /></Button></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Section>
  );
}

function Rules() {
  const [rules, setRules] = useState<CategoryRule[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    api<{ rules: CategoryRule[] }>("/api/rules").then((r) => setRules(r.rules)).catch((e) => setMsg({ ok: false, text: e.message }));
  }, []);
  if (!rules) return msg ? <LoadError message={msg.text} /> : <Skeleton className="h-40 rounded-xl" />;

  const set = (i: number, patch: Partial<CategoryRule>) => setRules(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const list = (s: string) => s.split(/\n|,(?![^/]*\/)/).map((x) => x.trim()).filter(Boolean);
  const save = async () => {
    try {
      await api("/api/rules", { method: "PUT", json: { rules } });
      toast.success("Saved");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Section title="Compliance rules" note={<>Shared by every profile; each profile sets each rule to off, warn or fail above. Keywords match whole words or phrases; write /pattern/ for a regular expression. These run on the row&apos;s own text before any API call.</>}
      actions={<Button onClick={save}>Save rules</Button>}>
      {rules.map((r, i) => (
        <div key={i} className="grid gap-3 rounded-lg border p-4 lg:grid-cols-2">
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1.5"><span className="field-label">Name</span><Input  value={r.name} onChange={(e) => set(i, { name: e.target.value })} /></label>
            <label className="space-y-1.5"><span className="field-label">Key</span><Input className="num" value={r.key} onChange={(e) => set(i, { key: e.target.value.replace(/[^a-zA-Z0-9_]/g, "") })} /></label>
            <label className="col-span-2 space-y-1.5"><span className="field-label">Why it exists</span><Input  value={r.note ?? ""} onChange={(e) => set(i, { note: e.target.value })} /></label>
            <label className="col-span-2 space-y-1.5"><span className="field-label">Amazon categories (one per line)</span>
              <Textarea className="h-16" value={r.amazon_categories.join("\n")} onChange={(e) => set(i, { amazon_categories: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} />
            </label>
          </div>
          <div className="grid gap-3">
            <label className="space-y-1.5"><span className="field-label">Keywords (comma or new line)</span>
              <Textarea className="h-24" defaultValue={r.keywords.join(", ")} onBlur={(e) => set(i, { keywords: list(e.target.value) })} />
            </label>
            <label className="space-y-1.5"><span className="field-label">Checklist it triggers (one per line)</span>
              <Textarea className="h-16" value={r.checklist.join("\n")} onChange={(e) => set(i, { checklist: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} />
            </label>
            <Button variant="ghost" className="justify-self-end text-fail hover:text-fail" onClick={() => setRules(rules.filter((_, j) => j !== i))}><Trash2Icon /> Remove rule</Button>
          </div>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={() => setRules([...rules, { key: `rule${rules.length + 1}`, name: "New rule", keywords: [], amazon_categories: [], note: "", checklist: [], sort: rules.length }])}>+ Add rule</Button>
      </div>
    </Section>
  );
}

interface CardRow { id: string; name: string; effective_from: string; is_active: boolean; created_at: string; card: RateCard }

function Rates() {
  const [cards, setCards] = useState<CardRow[] | null>(null);
  const [text, setText] = useState("");
  const apply = useCallback((list: CardRow[]) => {
    setCards(list);
    const active = list.find((c) => c.is_active) ?? list[0];
    if (active) setText(JSON.stringify(active.card, null, 2));
  }, []);
  const load = async () => apply((await api<{ cards: CardRow[] }>("/api/rate-card")).cards);
  useEffect(() => {
    api<{ cards: CardRow[] }>("/api/rate-card").then((r) => apply(r.cards)).catch((e) => toast.error(e.message));
  }, [apply]);

  const save = async () => {
    let card: RateCard;
    try {
      card = JSON.parse(text);
    } catch (e) {
      toast.error(`Not valid JSON: ${(e as Error).message}`);
      return;
    }
    try {
      await api("/api/rate-card", { method: "PUT", json: { card } });
      await load();
      toast.success("Saved as a new version and made active");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Section title="Rate card" note="Shared by every profile. Fee amounts are GBP ex-VAT and ex-DSF. Tiers: max sorted dimensions in cm and [max grams, fee] bands; parcel tiers bill on the greater of actual and L×W×H ÷ divisor. Referral bands apply their rate to the whole price. Saving keeps the previous card for comparison."
      actions={<Button onClick={save}>Save as new version</Button>}>
      {!cards ? <Skeleton className="h-24 rounded-lg" /> : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader><TableRow><TableHead>Card</TableHead><TableHead>Effective</TableHead><TableHead>Saved</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {cards.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.name} {c.is_active && <Badge variant="pass" className="ml-1">active</Badge>}</TableCell>
                  <TableCell className="num">{c.effective_from}</TableCell>
                  <TableCell>{new Date(c.created_at).toLocaleDateString("en-GB")}</TableCell>
                  <TableCell className="text-right"><Button variant="outline" size="xs" onClick={() => setText(JSON.stringify(c.card, null, 2))}>Load into editor</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Textarea className="num h-[50vh] text-xs" spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} aria-label="Rate card JSON" />
    </Section>
  );
}

interface Override { id: string; ean: string; asin: string | null; gate: GateId; reason: string | null; created_at: string; title: string | null }

/** Every gate you've waived, per product; removing one takes effect on the next screen or re-screen. */
function Waived() {
  const [items, setItems] = useState<Override[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    api<{ overrides: Override[]; unavailable?: string }>("/api/overrides")
      .then((r) => {
        setItems(r.overrides);
        if (r.unavailable) setMsg(r.unavailable);
      })
      .catch((e) => setMsg(e.message));
  }, []);
  if (!items) return msg ? <LoadError message={msg} /> : <LoadingBlocks />;
  const remove = async (o: Override) => {
    try {
      await api(`/api/overrides?id=${o.id}`, { method: "DELETE" });
      setItems((xs) => xs && xs.filter((x) => x.id !== o.id));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <Section title="Waived gates" note={<>A waived gate turns that product&apos;s fail into a warning in every run, so later gates, fees and the score still run. Waive or un-waive from a result&apos;s details; removing one here applies the next time a run is screened or re-screened.</>}>
      {msg && <p className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">{msg}</p>}
      {!items.length ? (
        <div className="rounded-lg border border-dashed px-6 py-10 text-center">
          <p className="font-medium">No gates waived</p>
          <p className="mt-1 text-sm text-muted-foreground">Open a result, find a failed gate, and choose Waive to accept it for that product.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Product</TableHead><TableHead>Gate</TableHead><TableHead>Reason</TableHead><TableHead>Since</TableHead><TableHead /></TableRow>
            </TableHeader>
            <TableBody>
              {items.map((o) => (
                <TableRow key={o.id} className="align-top">
                  <TableCell className="whitespace-normal">
                    <div className="font-medium">{o.title ?? "—"}</div>
                    <div className="num text-xs text-muted-foreground">{o.ean}{o.asin ? ` · ${o.asin}` : " · any ASIN"}</div>
                  </TableCell>
                  <TableCell>{GATE_LABELS[o.gate] ?? o.gate}</TableCell>
                  <TableCell className="whitespace-normal text-muted-foreground">{o.reason ?? "—"}</TableCell>
                  <TableCell>{new Date(o.created_at).toLocaleDateString("en-GB")}</TableCell>
                  <TableCell className="text-right"><Button variant="ghost" size="xs" className="text-fail hover:text-fail" onClick={() => remove(o)}>Remove</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Section>
  );
}
