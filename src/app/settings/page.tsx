"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { IpRiskTab } from "@/components/settings/IpRiskTab";
import { CategoryRanks } from "@/components/settings/CategoryRanks";
import { BusinessSettingsTab } from "@/components/settings/BusinessSettingsTab";
import { PlSettingsTab } from "@/components/settings/PlSettingsTab";
import { StockSettingsTab } from "@/components/settings/StockSettingsTab";
import { ArrowUpRightIcon, BoxesIcon, ChevronRightIcon, PlusIcon, BuildingIcon, FilterIcon, GaugeIcon, MegaphoneIcon, PaletteIcon, ReceiptIcon, ShieldAlertIcon, ShieldCheckIcon, SlidersHorizontalIcon, TagIcon, Trash2Icon, UndoIcon } from "lucide-react";
import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { activeChips, normalizeFilters, type FilterSet } from "@/lib/filters";
import type { RateCard } from "@/lib/fees/rateCard";
import {
  COMPLIANCE_RULE_KEYS,
  GATE_LABELS,
  GATE_ORDER,
  GROUP_LABELS,
  PRICE_BASIS_LABEL,
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
import { ErrorState } from "@/components/States";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@/components/ui/data-table";
import { StatusChip } from "@/components/ui/status-chip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SectionTitle } from "@/components/ui/info-tip";
import { PageHeader } from "@/components/ui/page-header";
import { ThemeChoice } from "@/components/ThemeToggle";
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
  demand: [{ key: "minRankDrops30d", label: "Min sales / month (total)" }, { key: "minSharePerMonth", label: "Min your share", unit: "sales / month" }, { key: "maxAvgRank90d", label: "Max 90-day average rank (no sales data only)", step: 1000 }, { key: "maxMonthsToSell", label: "Max months to sell the order", step: 0.5 }],
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
// A gate's mode is a setting (what the gate does), not a result: its own words, sentence case.
const MODE_LABEL: Record<GateMode, string> = { off: "Off", warn: "Warn", fail: "Fail" };

function NumberField({ label, unit, value, step, onChange }: { label: string; unit?: string; value: number; step?: number; onChange: (n: number) => void }) {
  return (
    <label className="space-y-1.5">
      <span className="field-label">{label}{unit ? ` (${unit})` : ""}</span>
      <Input className="num" type="number" step={step ?? "any"} value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))} />
    </label>
  );
}

function ModeSelect({ value, onChange, allowOff = true }: { value: GateMode; onChange: (m: GateMode) => void; allowOff?: boolean }) {
  const cls = value === "fail" ? "text-danger" : value === "warn" ? "text-warn-ink" : "text-muted-foreground";
  return (
    <NativeSelect className={`w-24 font-medium ${cls}`} value={value} onChange={(e) => onChange(e.target.value as GateMode)}>
      {MODES.filter((m) => allowOff || m !== "off").map((m) => <NativeSelectOption key={m} value={m}>{MODE_LABEL[m]}</NativeSelectOption>)}
    </NativeSelect>
  );
}

type ProfileTab = "gates" | "score" | "fees" | "profiles";
const TABS: { id: ProfileTab | "business" | "waived" | "filters" | "ip" | "pl" | "stock" | "appearance"; label: string; icon: ReactNode }[] = [
  { id: "business", label: "Business", icon: <BuildingIcon /> },
  { id: "gates", label: "Gates", icon: <ShieldCheckIcon /> },
  { id: "score", label: "Score", icon: <GaugeIcon /> },
  { id: "fees", label: "Fees", icon: <ReceiptIcon /> },
  { id: "profiles", label: "Profiles", icon: <SlidersHorizontalIcon /> },
  { id: "waived", label: "Waived", icon: <UndoIcon /> },
  { id: "ip", label: "IP risk", icon: <ShieldAlertIcon /> },
  { id: "filters", label: "Filter sets", icon: <FilterIcon /> },
  { id: "pl", label: "Private label", icon: <TagIcon /> },
  { id: "stock", label: "Stock", icon: <BoxesIcon /> },
  { id: "appearance", label: "Appearance", icon: <PaletteIcon /> },
];

/** A settings block: a titled card with an optional note and actions. */
function Section({ title, note, actions, children, className }: { title: ReactNode; note?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("panel space-y-4 p-4 sm:p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionTitle title={title}>{note}</SectionTitle>
        {actions}
      </div>
      {children}
    </section>
  );
}

const LoadingBlocks = () => <div className="space-y-4"><Skeleton className="h-16 rounded-lg" /><Skeleton className="h-64 rounded-lg" /><Skeleton className="h-40 rounded-lg" /></div>;
const LoadError = ({ message }: { message: string }) => <ErrorState title="Couldn't load settings" message={message} onRetry={() => window.location.reload()} />;

export default function SettingsPage() {
  return <Suspense><Settings /></Suspense>;
}

function Settings() {
  // ?tab=ip opens a tab directly (the Brands page links to the IP-risk list).
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const [tab, setTabState] = useState<string>(() => (TABS.some((t) => t.id === params.get("tab")) ? params.get("tab")! : "gates"));
  // The tab is in the address too (?tab=), so a link or a reload opens it.
  const setTab = (t: string) => { setTabState(t); router.replace(`${path}?tab=${t}`, { scroll: false }); };
  const editor = useProfileEditor();
  const profileTab = tab === "gates" || tab === "score" || tab === "fees" || tab === "profiles";
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        crumbs={[{ label: "Settings" }]}
        subtitle="How the app screens, scores and runs each workspace."
        info={<p>Screening profiles (gates, score and fees), shared rules and rate card, waived gates, saved filter sets, the Business, Private label, Ads and Stock settings, and how the app looks.</p>}
      />
      {/* Phones: the tabs as a dropdown. */}
      <label className="block space-y-1 lg:hidden"><span className="field-label">Section</span>
        <NativeSelect value={tab} onChange={(e) => setTab(e.target.value)} className="w-full" aria-label="Settings section">
          {TABS.map((t) => <NativeSelectOption key={t.id} value={t.id}>{t.label}</NativeSelectOption>)}
        </NativeSelect>
        <span className="block pt-1 text-meta text-muted-foreground">Ads settings are on <Link className="text-primary underline" href="/ads/rules?tab=settings">Ads → Rules → Ad settings</Link>.</span>
      </label>
      <Tabs value={tab} onValueChange={setTab} orientation="vertical" className="gap-6 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start">
        <TabsList variant="line" className="hidden w-full gap-0.5 lg:sticky lg:top-[calc(var(--app-header)+1.5rem)] lg:flex">
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="h-9 w-full justify-start rounded-lg px-3 after:hidden hover:bg-subtle data-active:bg-primary-soft! data-active:text-primary-ink!">
              {t.icon}{t.label}
            </TabsTrigger>
          ))}
          {/* Ads settings live with the rules that use them. */}
          <Link href="/ads/rules?tab=settings" className="mt-2 flex h-9 w-full items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-subtle hover:text-foreground [&_svg]:size-4">
            <MegaphoneIcon /> Ads <ArrowUpRightIcon className="ml-auto" />
          </Link>
        </TabsList>
        <div className="min-w-0 flex-1 space-y-5">
        {profileTab && <ProfileBar editor={editor} manage={tab === "profiles"} />}
        <TabsContent value="gates" className="space-y-5">{editor.ready ? <GatesTab editor={editor} /> : editor.error ? <LoadError message={editor.error} /> : <LoadingBlocks />}</TabsContent>
        <TabsContent value="score" className="space-y-5">{editor.ready ? <ScoreTab editor={editor} /> : editor.error ? <LoadError message={editor.error} /> : <LoadingBlocks />}</TabsContent>
        <TabsContent value="fees" className="space-y-5">{editor.ready ? <FeesTab editor={editor} /> : editor.error ? <LoadError message={editor.error} /> : <LoadingBlocks />}</TabsContent>
        <TabsContent value="profiles" className="space-y-5">{editor.ready ? <ProfilesTab editor={editor} /> : editor.error ? <LoadError message={editor.error} /> : <LoadingBlocks />}</TabsContent>
        <TabsContent value="business"><BusinessSettingsTab /></TabsContent>
        <TabsContent value="waived"><Waived /></TabsContent>
        <TabsContent value="ip"><IpRiskTab /></TabsContent>
        <TabsContent value="filters"><FilterSets /></TabsContent>
        <TabsContent value="pl"><PlSettingsTab /></TabsContent>
        <TabsContent value="stock"><StockSettingsTab /></TabsContent>
        <TabsContent value="appearance">
          <Section title="Appearance" note="System follows your device's light or dark setting; the button in the top bar switches between light and dark.">
            <ThemeChoice />
          </Section>
        </TabsContent>
        </div>
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

  async function act<T>(fn: () => Promise<T>, ok: string | ((r: T) => string), select?: string) {
    try {
      const r = await fn();
      await load(select ?? id);
      toast.success(typeof ok === "string" ? ok : ok(r));
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
    save: () => act(() => api<{ rescreening?: number }>(`/api/profiles/${id}`, { method: "PUT", json: { config: draft } }),
      (r) => (r.rescreening ? `Saved; re-screening ${r.rescreening} run${r.rescreening === 1 ? "" : "s"} on this profile from stored data` : "Saved")),
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
    <div className="panel sticky top-14 z-10 flex flex-wrap items-center gap-2 p-3">
      <span className="field-label">Editing</span>
      <NativeSelect className="w-56" aria-label="Profile" value={e.id} onChange={(ev) => e.select(ev.target.value)}>
        {e.profiles.map((p) => <NativeSelectOption key={p.id} value={p.id}>{p.name}{p.is_default ? " (default)" : ""}</NativeSelectOption>)}
      </NativeSelect>
      {e.dirty ? <StatusChip tone="warn">Unsaved changes</StatusChip> : <span className="text-meta text-muted-foreground">Saved</span>}
      {!e.weightsOk && <StatusChip tone="bad">Score weights total {e.weightSum}, not 100</StatusChip>}
      <div className="ml-auto flex flex-wrap gap-2">
        {e.dirty && <Button variant="ghost" onClick={e.discard}>Discard</Button>}
        {manage && <Button variant="secondary" onClick={e.saveAsNew} disabled={!e.weightsOk}>Save as new profile</Button>}
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
      <Section title="Gates" note="Run in this order. Fail drops the row and records why; Warn keeps it and lowers the Risk group; Off skips the gate.">
        <div className="gap-3 lg:columns-2 [&>*]:mb-3 [&>*]:break-inside-avoid">
          {GATE_ORDER.map((g, i) => (
            <div key={g} className="space-y-3 rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <span className="num flex size-7 flex-none items-center justify-center rounded-lg bg-subtle text-xs font-semibold">{i + 1}</span>
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
              {g === "demand" && (
                <CategoryRanks value={draft.gates.demand.maxRankByCategory ?? {}} fallback={draft.gates.demand.maxAvgRank90d}
                  onChange={(v) => setGate("demand", { maxRankByCategory: v })} />
              )}
              {g === "gating" && (
                <label className="flex flex-wrap items-center gap-2 text-sm">
                  <span>Approval needed counts as</span>
                  <ModeSelect value={draft.gates.gating.approvalRequired} onChange={(m) => setGate("gating", { approvalRequired: m })} />
                  <span className="text-xs text-muted-foreground">Blocked always uses the gate&apos;s mode</span>
                </label>
              )}
              {g === "compliance" && (
                <label className="flex flex-wrap items-center gap-2 text-sm">
                  <span>Flag liquids only above</span>
                  <Input className="num h-8 w-24" type="number" min={0} step={50} placeholder="any" aria-label="Flag liquids only above (ml)"
                    value={draft.gates.compliance.liquidAboveMl ?? ""}
                    onChange={(ev) => setGate("compliance", { liquidAboveMl: ev.target.value === "" ? null : Number(ev.target.value) })} />
                  <span className="text-muted-foreground">ml (empty flags every liquid)</span>
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
        <p className="text-sm">
          <b>{PRICE_BASIS_LABEL[draft.scoringPrice]}</b> <span className="text-muted-foreground">· the price basis for every profile, set in </span>
          <Link className="text-primary underline" href="/settings?tab=business">Settings → Business</Link>
        </p>
      </Section>

      <Section title="Score weights" note="How much each group counts towards the 0–100 score. They must total 100."
        actions={<span className={cn("num text-sm font-medium", weightsOk ? "text-muted-foreground" : "text-danger")}>Total {weightSum} / 100</span>}>
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
        <div className="grid gap-3 border-t border-divider pt-4 sm:grid-cols-3">
          <NumberField label="Green (order a test) from" value={draft.score.bands.green} onChange={(n) => setDraft({ ...draft, score: { ...draft.score, bands: { ...draft.score.bands, green: n } } })} />
          <NumberField label="Amber (needs one thing to move) from" value={draft.score.bands.amber} onChange={(n) => setDraft({ ...draft, score: { ...draft.score, bands: { ...draft.score.bands, amber: n } } })} />
        </div>
      </Section>

      <Section title="Score scales" note="Each parameter maps a value to 0–100 along these points, straight lines between them and flat beyond the ends. Weight sets its pull inside its group; 0 leaves it out.">
        <div className="space-y-5">
          {(Object.keys(GROUP_LABELS) as GroupId[]).map((g) => (
            <div key={g} className="space-y-2">
              <p className="section-label">{GROUP_LABELS[g]}</p>
              <div className="grid gap-3 lg:grid-cols-2">
                {Object.entries(SCALE_DEFS).filter(([, d]) => d.group === g).map(([k, d]) => {
                  const sc = draft.score.scales[k];
                  const setScale = (patch: Partial<typeof sc>) => setDraft({ ...draft, score: { ...draft.score, scales: { ...draft.score.scales, [k]: { ...sc, ...patch } } } });
                  return (
                    <div key={k} className="space-y-2 rounded-lg border border-border bg-subtle/50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{d.label}</span>
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">weight
                          <Input className="num h-7 w-14" type="number" min={0} step="any" value={sc.weight} onChange={(ev) => setScale({ weight: Number(ev.target.value) })} />
                        </label>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {sc.points.map(([x, y], i) => (
                          <div key={i} className="flex items-center gap-1 rounded-lg border border-border bg-card px-1.5 py-1">
                            <input className="num w-16 bg-transparent text-right text-xs outline-none" type="number" step="any" value={x} aria-label={`${d.label} value ${i + 1} (${d.unit})`}
                              onChange={(ev) => setScale({ points: sc.points.map((p, j) => (j === i ? [Number(ev.target.value), p[1]] : p)) as [number, number][] })} />
                            <span className="text-xs text-muted-foreground">{d.unit} →</span>
                            <input className="num w-10 bg-transparent text-right text-xs outline-none" type="number" min={0} max={100} value={y} aria-label={`${d.label} score ${i + 1}`}
                              onChange={(ev) => setScale({ points: sc.points.map((p, j) => (j === i ? [p[0], Number(ev.target.value)] : p)) as [number, number][] })} />
                            {sc.points.length > 2 && (
                              <button type="button" className="cursor-pointer px-1 text-xs text-muted-foreground hover:text-danger" aria-label="Remove point" onClick={() => setScale({ points: sc.points.filter((_, j) => j !== i) })}>×</button>
                            )}
                          </div>
                        ))}
                        <Button variant="secondary" size="xs" onClick={() => {
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
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <StatusChip tone={draft.fees.vatRegistered ? "info" : "neutral"} icon={false}>{draft.fees.vatRegistered ? "VAT reg." : "Non-VAT"}</StatusChip>
          {draft.fees.vatRegistered ? `VAT registered at ${draft.fees.vatRatePct}%: output VAT comes off the sale price; fees and goods count ex-VAT.` : `Not VAT registered: VAT on fees and goods is a cost (${draft.fees.vatRatePct}%).`}
          <Link className="text-primary underline" href="/settings?tab=business">Set in Settings → Business</Link>
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
        <DataTable
          rows={e.profiles}
          getRowId={(p) => p.id}
          caption="Screening profiles"
          rowClassName={(p) => (p.id === e.id ? "bg-primary-soft/40" : undefined)}
          columns={[
            {
              id: "name", header: "Name", mobile: "title", sortValue: (p) => p.name,
              cell: (p) => (
                <span className="inline-flex flex-wrap items-center gap-2 font-medium">
                  <button type="button" className="cursor-pointer hover:underline" onClick={() => e.select(p.id)}>{p.name}</button>
                  {p.is_default && <StatusChip tone="info" icon={false}>Default</StatusChip>}
                  {p.id === e.id && <span className="text-xs font-normal text-muted-foreground">editing</span>}
                </span>
              ),
            },
            { id: "budget", header: "Budget", numeric: true, mobile: 1, sortValue: (p) => Number(p.config.budget), cell: (p) => `£${Number(p.config.budget).toLocaleString("en-GB")}` },
            {
              id: "actions", header: "", className: "text-right",
              cell: (p) => (
                <div className="flex flex-wrap justify-end gap-1">
                  <Button variant="ghost" size="sm" onClick={() => e.rename(p)}>Rename</Button>
                  <Button variant="ghost" size="sm" onClick={() => e.duplicate(p)}>Duplicate</Button>
                  <Button variant="ghost" size="sm" disabled={p.is_default} onClick={() => e.makeDefault(p)}>Make default</Button>
                  <Button variant="danger" size="sm" disabled={p.is_default} aria-label={`Delete ${p.name}`} onClick={() => e.remove(p)}><Trash2Icon /> Delete</Button>
                </div>
              ),
            },
          ]}
        />
      </Section>

      <Section title="Budget" note="The first order across a run; the budget-fit gate keeps any one line within its share.">
        <div className="max-w-xs"><NumberField label="Budget" unit="£" value={draft.budget} step={50} onChange={(n) => setDraft({ ...draft, budget: n })} /></div>
      </Section>

      <Section title="Keepa history" note="A Keepa snapshot fetched by any run within this many days is reused instead of fetching again (no tokens). Re-screens never fetch history a snapshot this fresh already covers.">
        <div className="max-w-xs"><NumberField label="Keepa history max age" unit="days" value={draft.keepaMaxAgeDays} step={1} onChange={(n) => setDraft({ ...draft, keepaMaxAgeDays: n })} /></div>
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
      {note && <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn-ink">{note}</p>}
      <DataTable
        rows={sets}
        getRowId={(x) => x.id}
        caption="Saved filter sets"
        empty={{ icon: <FilterIcon />, title: "No saved filter sets", description: "Set some filters on a run, then choose Saved filters → Save current filters.", action: <Button variant="secondary" asChild><Link href="/runs">Go to runs</Link></Button> }}
        columns={[
          { id: "name", header: "Name", mobile: "title", sortValue: (x) => x.name, cell: (x) => <span className="font-medium">{x.name}</span> },
          {
            id: "filters", header: "Filters", mobile: 1, className: "whitespace-normal",
            cell: (x) => {
              const chips = activeChips(normalizeFilters(x.filters), GATE_LABELS);
              return <div className="flex flex-wrap gap-1">{chips.length ? chips.map((c) => <Badge key={c.id} variant="muted">{c.label}</Badge>) : <span className="text-muted-foreground">No filters</span>}</div>;
            },
          },
          { id: "actions", header: "", className: "text-right", cell: (x) => <Button variant="danger" size="sm" aria-label={`Delete ${x.name}`} onClick={() => remove(x)}><Trash2Icon /> Delete</Button> },
        ]}
      />
    </Section>
  );
}

function Rules() {
  const [rules, setRules] = useState<CategoryRule[] | null>(null);
  // Each rule is a row; its form opens under it (new rules open).
  const [open, setOpen] = useState<Set<number>>(new Set());
  const { confirm } = useDialogs();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    api<{ rules: CategoryRule[] }>("/api/rules").then((r) => setRules(r.rules)).catch((e) => setMsg({ ok: false, text: e.message }));
  }, []);
  if (!rules) return msg ? <LoadError message={msg.text} /> : <Skeleton className="h-40 rounded-lg" />;

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
    <Section title="Compliance rules" note={<>Shared by every profile; each profile sets each rule to off, warn or fail above. Keywords and exclusion words match whole words or phrases; write /pattern/ for a regular expression. Amazon categories match the display group or any of Amazon&apos;s own signals for the listing (its browse path, item type, product type), by name or /pattern/. Keywords run on the row&apos;s own text before any API call.</>}
      actions={<Button variant="secondary" onClick={save}>Save rules</Button>}>
      <ul className="divide-y divide-divider rounded-lg border border-border">
      {rules.map((r, i) => (
        <li key={i}>
          <button type="button" aria-expanded={open.has(i)} onClick={() => setOpen((o) => { const n = new Set(o); if (n.has(i)) n.delete(i); else n.add(i); return n; })}
            className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left hover:bg-subtle/60">
            <ChevronRightIcon className={cn("size-4 flex-none text-muted-foreground transition-transform", open.has(i) && "rotate-90")} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{r.name || "Untitled rule"} <span className="num text-xs font-normal text-muted-foreground">{r.key}</span></span>
              {r.note && <span className="block truncate text-meta text-muted-foreground">{r.note}</span>}
            </span>
            <span className="num hidden flex-none text-xs text-muted-foreground sm:block">{r.keywords.length} keyword{r.keywords.length === 1 ? "" : "s"} · {r.amazon_categories.length} categor{r.amazon_categories.length === 1 ? "y" : "ies"}</span>
          </button>
          {open.has(i) && (
        <div className="grid gap-3 border-t border-divider p-4 lg:grid-cols-2">
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1.5"><span className="field-label">Name</span><Input value={r.name} onChange={(e) => set(i, { name: e.target.value })} /></label>
            <label className="space-y-1.5"><span className="field-label">Key</span><Input className="num" value={r.key} onChange={(e) => set(i, { key: e.target.value.replace(/[^a-zA-Z0-9_]/g, "") })} /></label>
            <label className="col-span-2 space-y-1.5"><span className="field-label">Why it exists</span><Input value={r.note ?? ""} onChange={(e) => set(i, { note: e.target.value })} /></label>
            <label className="col-span-2 space-y-1.5"><span className="field-label">Amazon categories (one per line)</span>
              <Textarea className="h-16" value={r.amazon_categories.join("\n")} onChange={(e) => set(i, { amazon_categories: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} />
            </label>
          </div>
          <div className="grid gap-3">
            <label className="space-y-1.5"><span className="field-label">Keywords (comma or new line)</span>
              <Textarea className="h-24" defaultValue={r.keywords.join(", ")} onBlur={(e) => set(i, { keywords: list(e.target.value) })} />
            </label>
            <label className="space-y-1.5"><span className="field-label">Exclusion words: a title with one of these skips this rule</span>
              <Textarea className="h-14" defaultValue={(r.exclusions ?? []).join(", ")} placeholder="e.g. hair, scalp" onBlur={(e) => set(i, { exclusions: list(e.target.value) })} />
            </label>
            <label className="space-y-1.5"><span className="field-label">Checklist it triggers (one per line)</span>
              <Textarea className="h-16" value={r.checklist.join("\n")} onChange={(e) => set(i, { checklist: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} />
            </label>
            <Button variant="danger" size="sm" className="justify-self-end" onClick={async () => {
              if (!(await confirm({ title: `Remove the rule “${r.name || r.key}”?`, description: "It goes from the list now and for good once you Save rules.", confirmLabel: "Remove", destructive: true }))) return;
              setRules(rules.filter((_, j) => j !== i));
              setOpen(new Set());
            }}><Trash2Icon /> Remove rule</Button>
          </div>
        </div>
          )}
        </li>
      ))}
      </ul>
      <div className="flex items-center gap-3">
        <Button variant="secondary" onClick={() => { setRules([...rules, { key: `rule${rules.length + 1}`, name: "New rule", keywords: [], amazon_categories: [], note: "", checklist: [], sort: rules.length, exclusions: [] }]); setOpen(new Set([rules.length])); }}><PlusIcon /> Add rule</Button>
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
      actions={<Button variant="secondary" onClick={save}>Save as new version</Button>}>
      {!cards ? <Skeleton className="h-24 rounded-lg" /> : (
        <DataTable
          rows={cards}
          getRowId={(c) => c.id}
          caption="Rate card versions"
          pageSize={25}
          columns={[
            { id: "name", header: "Card", mobile: "title", sortValue: (c) => c.name, cell: (c) => <span className="inline-flex items-center gap-2">{c.name} {c.is_active && <StatusChip tone="good">Active</StatusChip>}</span> },
            { id: "effective", header: "Effective", mobile: 1, sortValue: (c) => c.effective_from, cell: (c) => <span className="num">{c.effective_from}</span> },
            { id: "saved", header: "Saved", mobile: 2, sortValue: (c) => c.created_at, cell: (c) => <span className="num">{new Date(c.created_at).toLocaleDateString("en-GB")}</span> },
            { id: "actions", header: "", className: "text-right", cell: (c) => <Button variant="ghost" size="sm" onClick={() => setText(JSON.stringify(c.card, null, 2))}>Load into editor</Button> },
          ]}
        />
      )}
      <Textarea className="num h-[50vh] text-xs" spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} aria-label="Rate card JSON" />
    </Section>
  );
}

interface Override { id: string; ean: string; asin: string | null; gate: GateId; reason: string | null; created_at: string; title: string | null }

/** Every gate you've waived, per product; removing one takes effect on the next screen or re-screen. */
function Waived() {
  const [items, setItems] = useState<Override[] | null>(null);
  const { confirm } = useDialogs();
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
    if (!(await confirm({ title: `Remove the waiver of ${GATE_LABELS[o.gate] ?? o.gate}${o.title ? ` for “${o.title}”` : ""}?`, description: "The gate counts again for this product: it's re-scored in every current run.", confirmLabel: "Remove", destructive: true }))) return;
    try {
      await api(`/api/overrides?id=${o.id}`, { method: "DELETE" });
      setItems((xs) => xs && xs.filter((x) => x.id !== o.id));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <Section title="Waived gates" note={<>A waived gate turns that product&apos;s fail into a warning in every run, so later gates, fees and the score still run; a waived warning stops counting, so the row can go green. Waive or un-waive from a result&apos;s details; removing one here re-scores that product in every current run.</>}>
      {msg && <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn-ink">{msg}</p>}
      <DataTable
        rows={items}
        getRowId={(o) => o.id}
        storageKey="settings.waived"
        caption="Waived gates"
        initialSort={{ id: "since", desc: true }}
        empty={{ icon: <UndoIcon />, title: "No gates waived", description: "Open a result, find a failed or warning gate, and choose Waive to accept it for that product.", action: <Button variant="secondary" asChild><Link href="/products">Go to products</Link></Button> }}
        columns={[
          {
            id: "product", header: "Product", mobile: "title", className: "whitespace-normal", sortValue: (o) => o.title,
            cell: (o) => <div className="min-w-0"><div className="font-medium">{o.title ?? "—"}</div><div className="num text-xs text-muted-foreground">{o.ean}{o.asin ? ` · ${o.asin}` : " · any ASIN"}</div></div>,
          },
          { id: "gate", header: "Gate", mobile: 1, sortValue: (o) => GATE_LABELS[o.gate] ?? o.gate, cell: (o) => GATE_LABELS[o.gate] ?? o.gate },
          { id: "reason", header: "Reason", mobile: 2, className: "whitespace-normal text-muted-foreground", sortValue: (o) => o.reason, cell: (o) => o.reason ?? "—" },
          { id: "since", header: "Since", mobile: 3, sortValue: (o) => o.created_at, cell: (o) => <span className="num">{new Date(o.created_at).toLocaleDateString("en-GB")}</span> },
          { id: "actions", header: "", className: "text-right", cell: (o) => <Button variant="danger" size="sm" onClick={() => remove(o)}>Remove</Button> },
        ]}
      />
    </Section>
  );
}
