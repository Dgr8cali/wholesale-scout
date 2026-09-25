"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
    <label className="space-y-1">
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

export default function SettingsPage() {
  const [tab, setTab] = useState<"profiles" | "rules" | "rates" | "waived">("profiles");
  return (
    <div className="space-y-5">
      <h1 className="page-title">Settings</h1>
      <div className="flex gap-1 border-b border-border">
        {([["profiles", "Profiles"], ["rules", "Compliance rules"], ["rates", "Rate card"], ["waived", "Waived gates"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === k ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{l}</button>
        ))}
      </div>
      {tab === "profiles" && <Profiles />}
      {tab === "rules" && <Rules />}
      {tab === "rates" && <Rates />}
      {tab === "waived" && <Waived />}
    </div>
  );
}

function Profiles() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [id, setId] = useState<string>("");
  const [draft, setDraft] = useState<ProfileConfig | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
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
    api<{ profiles: Profile[] }>("/api/profiles").then((r) => apply(r.profiles)).catch((e) => setMsg({ ok: false, text: e.message }));
    api<{ rules: CategoryRule[] }>("/api/rules").then((r) => setRules(r.rules)).catch(() => {});
  }, [apply]);

  const current = profiles.find((p) => p.id === id);
  const dirty = useMemo(() => !!current && !!draft && JSON.stringify(current.config) !== JSON.stringify(draft), [current, draft]);
  const weightSum = draft ? Object.values(draft.score.weights).reduce((a, b) => a + (Number(b) || 0), 0) : 0;

  const setGate = <G extends GateId>(g: G, patch: Partial<GateConfigs[G]>) =>
    setDraft((d) => d && { ...d, gates: { ...d.gates, [g]: { ...d.gates[g], ...patch } } });

  async function act(fn: () => Promise<unknown>, ok: string, select?: string) {
    try {
      await fn();
      await load(select ?? id);
      toast.success(ok);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const save = () => act(() => api(`/api/profiles/${id}`, { method: "PUT", json: { config: draft } }), "Saved");
  const saveAsNew = async () => {
    const name = await prompt({ title: "Save as a new profile", label: "Name", confirmLabel: "Save" });
    if (!name) return;
    try {
      const r = await api<{ id: string }>("/api/profiles", { method: "POST", json: { name, config: draft } });
      await load(r.id);
      toast.success(`Saved as "${name}"`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const duplicate = async () => {
    const name = await prompt({ title: "Duplicate profile", label: "Name for the copy", defaultValue: `${current?.name} copy`, confirmLabel: "Duplicate" });
    if (!name) return;
    try {
      const r = await api<{ id: string }>("/api/profiles", { method: "POST", json: { name, fromId: id } });
      await load(r.id);
      toast.success(`Duplicated as "${name}"`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const rename = async () => {
    const name = await prompt({ title: "Rename profile", label: "Name", defaultValue: current?.name, confirmLabel: "Rename" });
    if (name) act(() => api(`/api/profiles/${id}`, { method: "PUT", json: { name } }), "Renamed");
  };
  const makeDefault = () => act(() => api(`/api/profiles/${id}`, { method: "PUT", json: { is_default: true } }), "Set as default");
  const remove = async () => {
    if (await confirm({ title: `Delete "${current?.name}"?`, description: "Past runs keep their own copy of its settings.", confirmLabel: "Delete", destructive: true })) {
      act(() => api(`/api/profiles/${id}`, { method: "DELETE" }), "Deleted", "");
    }
  };

  if (!draft) return msg ? <p className="text-sm text-fail">{msg.text}</p> : <p className="text-sm text-muted-foreground">Loading…</p>;
  const ruleName = (k: string) => rules.find((r) => r.key === k)?.name ?? k;
  const ruleKeys = [...new Set([...rules.map((r) => r.key), ...COMPLIANCE_RULE_KEYS])];

  return (
    <div className="space-y-5">
      <div className="panel sticky top-14 z-10 flex flex-wrap items-center gap-2 p-3">
        <NativeSelect className="w-56" value={id} onChange={async (e) => {
          const next = e.target.value;
          if (dirty && !(await confirm({ title: "Discard unsaved changes?", confirmLabel: "Discard", destructive: true }))) return;
          const p = profiles.find((x) => x.id === next)!;
          setId(p.id);
          setDraft(structuredClone(p.config));
        }}>
          {profiles.map((p) => <NativeSelectOption key={p.id} value={p.id}>{p.name}{p.is_default ? " (default)" : ""}</NativeSelectOption>)}
        </NativeSelect>
        <Button disabled={!dirty || Math.abs(weightSum - 100) > 0.01} onClick={save}>Save</Button>
        <Button variant="outline" onClick={saveAsNew} disabled={Math.abs(weightSum - 100) > 0.01}>Save as new</Button>
        <Button variant="outline" onClick={duplicate}>Duplicate</Button>
        <Button variant="outline" onClick={rename}>Rename</Button>
        <Button variant="outline" onClick={makeDefault} disabled={current?.is_default}>Set as default</Button>
        <Button variant="destructive" onClick={remove} disabled={current?.is_default}>Delete</Button>
        {dirty && <Button variant="outline" onClick={() => setDraft(structuredClone(current!.config))}>Discard changes</Button>}
      </div>

      <section className="panel space-y-3 p-4">
        <h2 className="section-title">Scoring price and budget</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1">
            <span className="field-label">Score on</span>
            <NativeSelect value={draft.scoringPrice} onChange={(e) => setDraft({ ...draft, scoringPrice: e.target.value as ProfileConfig["scoringPrice"] })}>
              <NativeSelectOption value="lower">Lower of current Buy Box and 12-month median</NativeSelectOption>
              <NativeSelectOption value="current">Current Buy Box</NativeSelectOption>
              <NativeSelectOption value="median">12-month median</NativeSelectOption>
            </NativeSelect>
          </label>
          <NumberField label="Budget" unit="£" value={draft.budget} step={50} onChange={(n) => setDraft({ ...draft, budget: n })} />
        </div>
      </section>

      <section className="panel space-y-3 p-4">
        <h2 className="section-title">Seller profiles</h2>
        <p className="text-sm text-muted-foreground">For rows that pass every gate, look up the top Buy Box sellers on Keepa (1 token each, reused for 7 days) and flag a likely brand distributor.</p>
        <div className="grid items-end gap-3 sm:grid-cols-3">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={draft.sellerLookup.enabled} onCheckedChange={(on) => setDraft({ ...draft, sellerLookup: { ...draft.sellerLookup, enabled: on } })} />
            Look up seller profiles
          </label>
          <NumberField label="Sellers per row" value={draft.sellerLookup.topN} step={1} onChange={(n) => setDraft({ ...draft, sellerLookup: { ...draft.sellerLookup, topN: n } })} />
          <NumberField label="Distributor when brand is at least" unit="% of storefront" value={draft.sellerLookup.distributorBrandSharePct} onChange={(n) => setDraft({ ...draft, sellerLookup: { ...draft.sellerLookup, distributorBrandSharePct: n } })} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="section-title">Gates</h2>
        <p className="text-sm text-muted-foreground">Run in this order. Fail drops the row and records why; warn keeps it and lowers the Risk group; off skips the gate.</p>
        <div className="grid gap-3 lg:grid-cols-2">
          {GATE_ORDER.map((g, i) => (
            <div key={g} className="panel space-y-3 p-4">
              <div className="flex items-center gap-3">
                <span className="num flex h-7 w-7 items-center justify-center rounded-md bg-muted text-xs font-semibold">{i + 1}</span>
                <div className="flex-1">
                  <p className="font-semibold">{GATE_LABELS[g]}</p>
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
                <label className="flex items-center gap-2 text-sm">
                  <span>Approval needed counts as</span>
                  <ModeSelect value={draft.gates.gating.approvalRequired} onChange={(m) => setGate("gating", { approvalRequired: m })} />
                  <span className="text-xs text-muted-foreground">Blocked always uses the gate&apos;s mode</span>
                </label>
              )}
              {g === "compliance" && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {ruleKeys.map((k) => (
                    <label key={k} className="flex items-center justify-between gap-2 text-sm">
                      <span>{ruleName(k)}</span>
                      <ModeSelect value={draft.gates.compliance.rules[k] ?? "warn"}
                        onChange={(m) => setGate("compliance", { rules: { ...draft.gates.compliance.rules, [k]: m } })} />
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="panel space-y-3 p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="section-title">Score weights</h2>
          <span className={`num text-sm ${Math.abs(weightSum - 100) > 0.01 ? "text-fail" : "text-muted-foreground"}`}>Total {weightSum} / 100</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(GROUP_LABELS) as GroupId[]).map((g) => (
            <div key={g} className="space-y-1">
              <span className="field-label">{GROUP_LABELS[g]}</span>
              <div className="flex items-center gap-3">
                <Slider min={0} max={100} step={1} className="flex-1" value={[draft.score.weights[g]]} aria-label={GROUP_LABELS[g]}
                  onValueChange={([v]) => setDraft({ ...draft, score: { ...draft.score, weights: { ...draft.score.weights, [g]: v } } })} />
                <Input className="num w-16" type="number" value={draft.score.weights[g]}
                  onChange={(e) => setDraft({ ...draft, score: { ...draft.score, weights: { ...draft.score.weights, [g]: Number(e.target.value) } } })} />
              </div>
            </div>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <NumberField label="Green (order a test) from" value={draft.score.bands.green} onChange={(n) => setDraft({ ...draft, score: { ...draft.score, bands: { ...draft.score.bands, green: n } } })} />
          <NumberField label="Amber (needs one thing to move) from" value={draft.score.bands.amber} onChange={(n) => setDraft({ ...draft, score: { ...draft.score, bands: { ...draft.score.bands, amber: n } } })} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="section-title">Score scales</h2>
        <p className="text-sm text-muted-foreground">Each parameter maps a value to 0–100 along these points, straight lines between them and flat beyond the ends. Weight sets its pull inside its group; 0 leaves it out.</p>
        {(Object.keys(GROUP_LABELS) as GroupId[]).map((g) => (
          <div key={g} className="panel space-y-3 p-4">
            <p className="font-semibold">{GROUP_LABELS[g]}</p>
            <div className="grid gap-4 lg:grid-cols-2">
              {Object.entries(SCALE_DEFS).filter(([, d]) => d.group === g).map(([k, d]) => {
                const sc = draft.score.scales[k];
                const setScale = (patch: Partial<typeof sc>) => setDraft({ ...draft, score: { ...draft.score, scales: { ...draft.score.scales, [k]: { ...sc, ...patch } } } });
                return (
                  <div key={k} className="space-y-2 rounded-md bg-muted p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{d.label}</span>
                      <label className="flex items-center gap-1 text-xs text-muted-foreground">weight
                        <Input className="num w-14" type="number" min={0} step="any" value={sc.weight} onChange={(e) => setScale({ weight: Number(e.target.value) })} />
                      </label>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {sc.points.map(([x, y], i) => (
                        <div key={i} className="flex items-center gap-1 rounded border border-border bg-card px-1.5 py-1">
                          <input className="num w-16 bg-transparent text-right text-xs" type="number" step="any" value={x} aria-label={`${d.label} value ${i + 1} (${d.unit})`}
                            onChange={(e) => setScale({ points: sc.points.map((p, j) => (j === i ? [Number(e.target.value), p[1]] : p)) as [number, number][] })} />
                          <span className="text-xs text-muted-foreground">{d.unit} →</span>
                          <input className="num w-10 bg-transparent text-right text-xs" type="number" min={0} max={100} value={y} aria-label={`${d.label} score ${i + 1}`}
                            onChange={(e) => setScale({ points: sc.points.map((p, j) => (j === i ? [p[0], Number(e.target.value)] : p)) as [number, number][] })} />
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
      </section>

      <section className="panel space-y-3 p-4">
        <h2 className="section-title">Fees and landed cost</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-4">
            <Switch checked={draft.fees.vatRegistered} onCheckedChange={(on) => setDraft({ ...draft, fees: { ...draft.fees, vatRegistered: on } })} />
            VAT registered (reclaim VAT on fees and stock; pay output VAT on sales)
          </label>
          <NumberField label="VAT rate" unit="%" value={draft.fees.vatRatePct} onChange={(n) => setDraft({ ...draft, fees: { ...draft.fees, vatRatePct: n } })} />
          <NumberField label="Digital services fee" unit="%" value={draft.fees.dsfPct} step={0.1} onChange={(n) => setDraft({ ...draft, fees: { ...draft.fees, dsfPct: n } })} />
          <NumberField label="Inbound to FBA" unit="£/unit" value={draft.fees.inboundPerUnit} step={0.05} onChange={(n) => setDraft({ ...draft, fees: { ...draft.fees, inboundPerUnit: n } })} />
          <NumberField label="Prep, bag and label" unit="£/unit" value={draft.fees.prepPerUnit} step={0.05} onChange={(n) => setDraft({ ...draft, fees: { ...draft.fees, prepPerUnit: n } })} />
          <NumberField label="Import duty" unit="% of cost" value={draft.fees.dutyPct} onChange={(n) => setDraft({ ...draft, fees: { ...draft.fees, dutyPct: n } })} />
          <NumberField label="Average months in storage" value={draft.fees.storageMonths} step={0.5} onChange={(n) => setDraft({ ...draft, fees: { ...draft.fees, storageMonths: n } })} />
          <NumberField label="Returns allowance" unit="% of sale" value={draft.fees.returnsPct} step={0.5} onChange={(n) => setDraft({ ...draft, fees: { ...draft.fees, returnsPct: n } })} />
          <label className="space-y-1">
            <span className="field-label">Storage and peak rates</span>
            <NativeSelect value={draft.fees.season} onChange={(e) => setDraft({ ...draft, fees: { ...draft.fees, season: e.target.value as ProfileConfig["fees"]["season"] } })}>
              <NativeSelectOption value="auto">By date (Oct–Dec is peak)</NativeSelectOption>
              <NativeSelectOption value="standard">Always standard</NativeSelectOption>
              <NativeSelectOption value="peak">Always peak</NativeSelectOption>
            </NativeSelect>
          </label>
          <label className="space-y-1">
            <span className="field-label">No dimensions: assume tier</span>
            <NativeSelect value={draft.fees.missingDims.tierId} onChange={(e) => setDraft({ ...draft, fees: { ...draft.fees, missingDims: { ...draft.fees.missingDims, tierId: e.target.value } } })}>
              {[["lightEnv", "Light envelope"], ["stdEnv", "Standard envelope"], ["largeEnv", "Large envelope"], ["xlEnv", "Extra-large envelope"], ["smallPcl", "Small parcel"], ["stdPcl", "Standard parcel"]].map(([v, l]) => <NativeSelectOption key={v} value={v}>{l}</NativeSelectOption>)}
            </NativeSelect>
          </label>
          <NumberField label="No dimensions: assume weight" unit="g" value={draft.fees.missingDims.weightG} step={50} onChange={(n) => setDraft({ ...draft, fees: { ...draft.fees, missingDims: { ...draft.fees.missingDims, weightG: n } } })} />
        </div>
      </section>
    </div>
  );
}

function Rules() {
  const [rules, setRules] = useState<CategoryRule[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    api<{ rules: CategoryRule[] }>("/api/rules").then((r) => setRules(r.rules)).catch((e) => setMsg({ ok: false, text: e.message }));
  }, []);
  if (!rules) return msg ? <p className="text-sm text-fail">{msg.text}</p> : <p className="text-sm text-muted-foreground">Loading…</p>;

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
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Shared by every profile; each profile sets each rule to off, warn or fail. Keywords match whole words or phrases; write /pattern/ for a regular expression. These run on the row&apos;s own text before any API call.</p>
      {rules.map((r, i) => (
        <div key={i} className="panel grid gap-3 p-4 lg:grid-cols-2">
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1"><span className="field-label">Name</span><Input  value={r.name} onChange={(e) => set(i, { name: e.target.value })} /></label>
            <label className="space-y-1"><span className="field-label">Key</span><Input className="num" value={r.key} onChange={(e) => set(i, { key: e.target.value.replace(/[^a-zA-Z0-9_]/g, "") })} /></label>
            <label className="col-span-2 space-y-1"><span className="field-label">Why it exists</span><Input  value={r.note ?? ""} onChange={(e) => set(i, { note: e.target.value })} /></label>
            <label className="col-span-2 space-y-1"><span className="field-label">Amazon categories (one per line)</span>
              <Textarea className="h-16" value={r.amazon_categories.join("\n")} onChange={(e) => set(i, { amazon_categories: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} />
            </label>
          </div>
          <div className="grid gap-3">
            <label className="space-y-1"><span className="field-label">Keywords (comma or new line)</span>
              <Textarea className="h-24" defaultValue={r.keywords.join(", ")} onBlur={(e) => set(i, { keywords: list(e.target.value) })} />
            </label>
            <label className="space-y-1"><span className="field-label">Checklist it triggers (one per line)</span>
              <Textarea className="h-16" value={r.checklist.join("\n")} onChange={(e) => set(i, { checklist: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} />
            </label>
            <Button variant="destructive" className="justify-self-end" onClick={() => setRules(rules.filter((_, j) => j !== i))}>Remove rule</Button>
          </div>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={() => setRules([...rules, { key: `rule${rules.length + 1}`, name: "New rule", keywords: [], amazon_categories: [], note: "", checklist: [], sort: rules.length }])}>+ Add rule</Button>
        <Button onClick={save}>Save rules</Button>
      </div>
    </div>
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
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Fee amounts are GBP ex-VAT and ex-DSF. Tiers: max sorted dimensions in cm and [max grams, fee] bands; parcel tiers bill on the greater of actual and L×W×H ÷ divisor. Referral bands apply their rate to the whole price. Saving keeps the previous card for comparison.</p>
      {cards && (
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-2">Card</th><th className="px-4 py-2">Effective</th><th className="px-4 py-2">Saved</th><th className="px-4 py-2" /></tr></thead>
            <tbody>
              {cards.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-4 py-2">{c.name} {c.is_active && <Badge variant="pass" className="ml-1">active</Badge>}</td>
                  <td className="num px-4 py-2">{c.effective_from}</td>
                  <td className="px-4 py-2">{new Date(c.created_at).toLocaleDateString("en-GB")}</td>
                  <td className="px-4 py-2 text-right"><Button variant="outline" size="xs" onClick={() => setText(JSON.stringify(c.card, null, 2))}>Load into editor</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Textarea className="num h-[60vh]" spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex items-center gap-3">
        <Button onClick={save}>Save as new version</Button>
      </div>
    </div>
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
  if (!items) return msg ? <p className="text-sm text-fail">{msg}</p> : <p className="text-sm text-muted-foreground">Loading…</p>;
  const remove = async (o: Override) => {
    try {
      await api(`/api/overrides?id=${o.id}`, { method: "DELETE" });
      setItems((xs) => xs && xs.filter((x) => x.id !== o.id));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        A waived gate turns that product&apos;s fail into a warning in every run, so later gates, fees and the score still run.
        Waive or un-waive from a result&apos;s expanded row; removing one here applies the next time a run is screened or re-screened.
      </p>
      {msg && <p className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">{msg}</p>}
      {!items.length ? (
        <div className="panel px-6 py-8 text-center text-sm text-muted-foreground">No gates waived.</div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-4 py-2">Product</th><th className="px-4 py-2">Gate</th><th className="px-4 py-2">Reason</th><th className="px-4 py-2">Since</th><th className="px-4 py-2" /></tr>
            </thead>
            <tbody>
              {items.map((o) => (
                <tr key={o.id} className="border-t border-border align-top">
                  <td className="px-4 py-2">
                    <div className="font-medium">{o.title ?? "—"}</div>
                    <div className="num text-xs text-muted-foreground">{o.ean}{o.asin ? ` · ${o.asin}` : " · any ASIN"}</div>
                  </td>
                  <td className="px-4 py-2">{GATE_LABELS[o.gate] ?? o.gate}</td>
                  <td className="px-4 py-2 text-muted-foreground">{o.reason ?? "—"}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{new Date(o.created_at).toLocaleDateString("en-GB")}</td>
                  <td className="px-4 py-2 text-right"><Button variant="destructive" size="xs" onClick={() => remove(o)}>Remove</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
