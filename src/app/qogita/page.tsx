"use client";

import { CheckIcon, ChevronRightIcon, DownloadCloudIcon, PlayIcon, SearchIcon, Trash2Icon, XIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useDialogs } from "@/components/Dialogs";
import { EmptyState } from "@/components/States";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { api, when } from "@/lib/ui/client";
import { cn } from "@/lib/utils";

interface Category { name: string; slug: string; path: string[] }
interface Filters {
  category: { name: string; path: string[] } | null;
  brands: string[];
  minPrice: number | null;
  maxPrice: number | null;
  maxDeliveryWeeks: number | null;
  movLimit: number | null;
  /** Leaf categories ticked under the chosen one; null for all. */
  leaves?: string[] | null;
  maxProducts?: number | null;
  skipScreenedDays?: number | null;
}
interface Estimate { matching: number; products: number; reused: number; amazonMinutes: number; keepaTokens: number }
interface PullStats { fetched: number; kept: number; screened: number; outsidePrice: number; tooSlow: number; unknownDelivery: number; truncated: boolean; currency: string; new?: number; moved?: number; unchanged?: number }
interface Preset {
  id: string; name: string; filters: Filters; profile_id: string | null; nightly: boolean; last_pulled_at: string | null;
  lastPull: { run_id: string | null; kind: string; stats: PullStats; error: string | null; started_at: string } | null;
}
interface Profile { id: string; name: string; is_default: boolean }

const EMPTY: Filters = { category: null, brands: [], minPrice: null, maxPrice: null, maxDeliveryWeeks: null, movLimit: null, leaves: null, maxProducts: 500, skipScreenedDays: 7 };

/** Every node of the category tree (the API lists leaves with their paths). */
function treeNodes(cats: Category[]) {
  const seen = new Map<string, { name: string; path: string[]; leaves: number }>();
  for (const c of cats) {
    for (let i = 1; i <= c.path.length; i++) {
      const path = c.path.slice(0, i);
      const key = path.join(" › ");
      const n = seen.get(key) ?? { name: path[i - 1], path, leaves: 0 };
      n.leaves++;
      seen.set(key, n);
    }
  }
  return [...seen.values()].sort((a, b) => a.path.join(" › ").localeCompare(b.path.join(" › ")));
}

function describeFilters(f: Filters, currency = "€"): string[] {
  const out: string[] = [];
  if (f.category) out.push(f.category.path.slice(1).join(" › ") || f.category.name);
  if (f.brands.length) out.push(f.brands.length > 3 ? `${f.brands.slice(0, 3).join(", ")} +${f.brands.length - 3}` : f.brands.join(", "));
  if (f.minPrice != null || f.maxPrice != null) out.push(`${f.minPrice != null ? `${currency}${f.minPrice}` : "any"}–${f.maxPrice != null ? `${currency}${f.maxPrice}` : "any"}`);
  if (f.maxDeliveryWeeks != null) out.push(`≤ ${f.maxDeliveryWeeks} wk delivery`);
  if (f.movLimit != null) out.push(`MOV ≤ ${currency}${f.movLimit}`);
  return out;
}

export default function QogitaPage() {
  const router = useRouter();
  const { confirm } = useDialogs();
  const [cats, setCats] = useState<Category[] | null>(null);
  const [available, setAvailable] = useState(true);
  const [catError, setCatError] = useState<string | null>(null);
  const [presets, setPresets] = useState<Preset[] | null>(null);
  const [presetNote, setPresetNote] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfileId] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const loadPresets = () => api<{ presets: Preset[]; unavailable?: string }>("/api/qogita/presets")
    .then((r) => { setPresets(r.presets); setPresetNote(r.unavailable ?? null); })
    .catch((e) => { setPresets([]); setPresetNote(e.message); });
  useEffect(() => {
    api<{ available: boolean; categories: Category[] }>("/api/qogita/categories")
      .then((r) => { setAvailable(r.available); setCats(r.categories); })
      .catch((e) => setCatError(e.message));
    loadPresets();
    api<{ profiles: Profile[] }>("/api/profiles").then((r) => {
      setProfiles(r.profiles);
      setProfileId(r.profiles.find((p) => p.is_default)?.id ?? r.profiles[0]?.id ?? "");
    }).catch(() => {});
  }, []);

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const canPull = !!name.trim() && (!!filters.category || filters.brands.length > 0);

  // An estimate before pulling, from a count-only first page, a moment after the filters settle.
  const [estimate, setEstimate] = useState<{ key: string; value: Estimate | null; error?: string } | null>(null);
  const estimateKey = JSON.stringify(filters);
  const canEstimate = !!filters.category || filters.brands.length > 0;
  useEffect(() => {
    if (!canEstimate) return;
    let stale = false;
    const t = setTimeout(() => {
      api<Estimate>("/api/qogita/estimate", { method: "POST", json: { filters } })
        .then((value) => { if (!stale) setEstimate({ key: estimateKey, value }); })
        .catch((e) => { if (!stale) setEstimate({ key: estimateKey, value: null, error: (e as Error).message }); });
    }, 900);
    return () => { stale = true; clearTimeout(t); };
  }, [estimateKey, canEstimate, filters]);
  const est = canEstimate && estimate?.key === estimateKey ? estimate : null;

  // The leaves under the chosen category, to tick.
  const leaves = useMemo(() => {
    const c = filters.category;
    if (!c || !cats) return [];
    const path = c.path.length ? c.path : [c.name];
    return [...new Set(cats.filter((x) => path.every((p, i) => x.path[i] === p)).map((x) => x.name))].sort((a, b) => a.localeCompare(b));
  }, [filters.category, cats]);
  const ticked = (leaf: string) => !filters.leaves || filters.leaves.includes(leaf);
  const tick = (leaf: string, on: boolean) => {
    const cur = filters.leaves ?? leaves;
    const next = on ? [...new Set([...cur, leaf])] : cur.filter((l) => l !== leaf);
    set({ leaves: next.length === leaves.length ? null : next });
  };

  async function pull(req: () => Promise<{ runId: string | null; stats: PullStats; note?: string }>, label: string) {
    setBusy(label);
    try {
      const r = await req();
      if (r.note) toast.warning(r.note);
      const s = r.stats;
      const dropped = [s.outsidePrice ? `${s.outsidePrice} outside the price range` : null, s.tooSlow ? `${s.tooSlow} too slow to deliver` : null].filter(Boolean).join(", ");
      if (!r.runId) {
        toast.info(s.kept ? "Nothing new or changed since the last pull" : `Nothing matched${dropped ? ` (${dropped})` : ""}`);
        loadPresets();
        return;
      }
      const reused = (s as PullStats & { reused?: number }).reused;
      toast.success(`Pulled ${s.kept.toLocaleString("en-GB")} products${dropped ? `; ${dropped}` : ""}${s.truncated ? "; stopped at Max products" : ""}${reused ? `; ${reused} reused from the last ${filters.skipScreenedDays ?? 7} days` : ""}. Screening now.`);
      router.push(`/runs/${r.runId}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!available) {
    return (
      <div className="space-y-5">
        <Header />
        <EmptyState icon={<DownloadCloudIcon />} title="Qogita isn't connected">Set QOGITA_EMAIL and QOGITA_PASSWORD in the environment, then reload.</EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Header />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <section className="panel space-y-5 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="field-label">Category</Label>
              {catError ? <p className="text-sm text-fail">Couldn&apos;t load categories: {catError}</p>
                : !cats ? <Skeleton className="h-9" />
                : <CategoryPicker cats={cats} value={filters.category} onChange={(category) => set({ category, leaves: null })} />}
              <p className="text-xs text-muted-foreground">Any level: a parent pulls every category under it.</p>
              {leaves.length > 1 && (
                <fieldset className="mt-2 space-y-1.5 rounded-md border p-3">
                  <legend className="px-1 text-xs text-muted-foreground">
                    {filters.leaves ? `${filters.leaves.length} of ${leaves.length}` : `All ${leaves.length}`} categories under it
                    {" · "}<button type="button" className="text-brand hover:underline" onClick={() => set({ leaves: null })}>all</button>
                    {" · "}<button type="button" className="text-brand hover:underline" onClick={() => set({ leaves: [] })}>none</button>
                  </legend>
                  <div className="grid max-h-48 gap-x-4 gap-y-1 overflow-auto sm:grid-cols-2 lg:grid-cols-3">
                    {leaves.map((leaf) => (
                      <label key={leaf} className="flex items-center gap-2 text-sm">
                        <Checkbox checked={ticked(leaf)} onCheckedChange={(v) => tick(leaf, !!v)} /> <span className="truncate">{leaf}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="field-label" htmlFor="brand">Brands</Label>
              <BrandInput value={filters.brands} onChange={(brands) => set({ brands })} />
            </div>
            <NumberField id="minPrice" label="Min price (€ per piece)" value={filters.minPrice} onChange={(minPrice) => set({ minPrice })} />
            <NumberField id="maxPrice" label="Max price (€ per piece)" value={filters.maxPrice} onChange={(maxPrice) => set({ maxPrice })} />
            <NumberField id="maxDeliveryWeeks" label="Max delivery (weeks)" value={filters.maxDeliveryWeeks} step={1} onChange={(maxDeliveryWeeks) => set({ maxDeliveryWeeks })}
              hint="Products with no estimate are kept." />
            <NumberField id="movLimit" label="MOV limit (€)" value={filters.movLimit} step={50} onChange={(movLimit) => set({ movLimit })}
              hint="Applied to the supplier offers of rows that pass." />
            <NumberField id="maxProducts" label="Max products" value={filters.maxProducts ?? 500} step={50} onChange={(maxProducts) => set({ maxProducts })}
              hint="The pull stops here." />
            <NumberField id="skipDays" label="Skip EANs screened in the last N days" value={filters.skipScreenedDays ?? 7} step={1} onChange={(skipScreenedDays) => set({ skipScreenedDays })}
              hint="Those reuse their recent result (re-checked at the new price, no API calls). 0 screens everything." />
          </div>
          <div className="grid gap-4 border-t pt-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="field-label" htmlFor="name">Save as</Label>
              <Input id="name" placeholder="e.g. K-beauty masks under €10" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="field-label" htmlFor="profile">Profile</Label>
              <NativeSelect id="profile" className="w-full" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
                {profiles.map((p) => <NativeSelectOption key={p.id} value={p.id}>{p.name}{p.is_default ? " (default)" : ""}</NativeSelectOption>)}
              </NativeSelect>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            {canEstimate && (
              <p className="mr-auto text-sm" aria-live="polite">
                {!est ? <span className="text-muted-foreground">Estimating…</span>
                  : est.error ? <span className="text-fail">Couldn&apos;t estimate: {est.error}</span>
                  : est.value && (
                    <>
                      About <span className="num font-semibold">{est.value.products.toLocaleString("en-GB")}</span> products
                      <span className="text-muted-foreground"> ({est.value.matching.toLocaleString("en-GB")} on Qogita)</span>
                      {est.value.reused > 0 && <span className="text-muted-foreground"> · {est.value.reused.toLocaleString("en-GB")} reused</span>}
                      {" · "}~<span className="num font-semibold">{est.value.amazonMinutes}</span> min on Amazon
                      {" · "}~<span className="num font-semibold">{est.value.keepaTokens.toLocaleString("en-GB")}</span> Keepa tokens
                    </>
                  )}
              </p>
            )}
            {!canPull && <span className="text-sm text-muted-foreground">Choose a category or a brand, and name the pull.</span>}
            <Button size="lg" disabled={!canPull || !!busy}
              onClick={() => pull(() => api("/api/qogita/pull", { method: "POST", json: { name, filters, profileId } }), "new")}>
              <DownloadCloudIcon /> {busy === "new" ? "Pulling…" : "Pull and screen"}
            </Button>
          </div>
        </section>

        <aside className="space-y-3">
          <h2 className="section-label">Saved pulls</h2>
          {presetNote && <p className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">{presetNote}</p>}
          {!presets ? <Skeleton className="h-32 rounded-lg" />
            : !presets.length ? <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">Each pull is saved here by name, to run again or re-pull nightly.</p>
            : presets.map((p) => (
              <div key={p.id} className="panel space-y-2 p-3">
                <div className="flex items-start gap-2">
                  <button className="min-w-0 flex-1 text-left" onClick={() => { setFilters({ ...EMPTY, ...p.filters }); setName(p.name); if (p.profile_id) setProfileId(p.profile_id); }} title="Load these filters">
                    <p className="truncate font-medium hover:underline">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{describeFilters(p.filters).join(" · ")}</p>
                  </button>
                  <Button variant="ghost" size="icon-xs" className="text-muted-foreground hover:text-fail" aria-label={`Delete ${p.name}`}
                    onClick={async () => {
                      if (!(await confirm({ title: `Delete “${p.name}”?`, description: "Its runs are kept.", confirmLabel: "Delete", destructive: true }))) return;
                      await api(`/api/qogita/presets/${p.id}`, { method: "DELETE" }).then(loadPresets, (e) => toast.error(e.message));
                    }}><Trash2Icon /></Button>
                </div>
                {p.lastPull && (
                  <p className="text-xs text-muted-foreground">
                    {when(p.lastPull.started_at)}{p.lastPull.kind === "nightly" ? " (nightly)" : ""}: {p.lastPull.stats.screened ?? p.lastPull.stats.kept} screened
                    {p.lastPull.run_id && <> · <Link className="text-brand hover:underline" href={`/runs/${p.lastPull.run_id}`}>run</Link></>}
                  </p>
                )}
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch checked={p.nightly} onCheckedChange={(nightly) => api(`/api/qogita/presets/${p.id}`, { method: "PATCH", json: { nightly } }).then(loadPresets, (e) => toast.error(e.message))} />
                    Re-pull nightly
                  </label>
                  <Button variant="outline" size="sm" disabled={!!busy} onClick={() => pull(() => api(`/api/qogita/presets/${p.id}/run`, { method: "POST" }), p.id)}>
                    <PlayIcon /> {busy === p.id ? "Pulling…" : "Run again"}
                  </Button>
                </div>
              </div>
            ))}
        </aside>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="page-title">Pull from Qogita</h1>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Pull in-stock products straight from Qogita and screen them like an uploaded price list (supplier Qogita, prices per piece, ex-VAT).
        Price and delivery are filtered after the pull; the MOV limit applies to each passing row&apos;s supplier offers.
      </p>
    </div>
  );
}

function NumberField({ id, label, value, onChange, step, hint }: { id: string; label: string; value: number | null; onChange: (n: number | null) => void; step?: number; hint?: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="field-label" htmlFor={id}>{label}</Label>
      <Input id={id} className="num" type="number" min={0} step={step ?? "any"} placeholder="any" value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function CategoryPicker({ cats, value, onChange }: { cats: Category[]; value: Filters["category"]; onChange: (c: Filters["category"]) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const nodes = useMemo(() => treeNodes(cats), [cats]);
  const shown = nodes.filter((n) => !q.trim() || n.path.join(" ").toLowerCase().includes(q.trim().toLowerCase())).slice(0, 200);
  return (
    <div className="flex gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="min-w-0 flex-1 justify-between font-normal">
            <span className={cn("truncate", !value && "text-muted-foreground")}>{value ? value.path.slice(1).join(" › ") || value.name : "All categories"}</span>
            <ChevronRightIcon className="rotate-90 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(36rem,calc(100vw-2rem))] gap-2 p-2">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus className="pl-8" placeholder="Find a category" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <ul className="max-h-80 overflow-auto" role="listbox" aria-label="Categories">
            {shown.map((n) => {
              const selected = value?.path.join("›") === n.path.join("›");
              return (
                <li key={n.path.join("›")}>
                  <button role="option" aria-selected={selected} onClick={() => { onChange({ name: n.name, path: n.path }); setOpen(false); }}
                    className={cn("flex w-full items-center gap-2 rounded-md py-1 pr-2 text-left text-sm hover:bg-muted", selected && "bg-brand-soft")}
                    style={{ paddingLeft: q ? 8 : 8 + (n.path.length - 1) * 14 }}>
                    <span className="min-w-0 flex-1 truncate">{q ? n.path.slice(1).join(" › ") || n.name : n.name}</span>
                    {n.path.length < 4 && n.leaves > 1 && <span className="num text-2xs text-muted-foreground">{n.leaves}</span>}
                    {selected && <CheckIcon className="size-3.5 text-brand" />}
                  </button>
                </li>
              );
            })}
            {!shown.length && <li className="px-2 py-4 text-center text-sm text-muted-foreground">No category matches.</li>}
          </ul>
        </PopoverContent>
      </Popover>
      {value && <Button variant="ghost" size="icon" aria-label="Clear category" onClick={() => onChange(null)}><XIcon /></Button>}
    </div>
  );
}

/** Brand names as Qogita writes them; each is checked as it's added. */
function BrandInput({ value, onChange }: { value: string[]; onChange: (b: string[]) => void }) {
  const [text, setText] = useState("");
  const [checking, setChecking] = useState(false);
  async function add() {
    const name = text.trim();
    if (!name || value.some((v) => v.toLowerCase() === name.toLowerCase())) return setText("");
    setChecking(true);
    try {
      const r = await api<{ brand: { name: string; variantCount?: number } | null }>(`/api/qogita/brands?name=${encodeURIComponent(name)}`);
      if (r.brand) onChange([...value, r.brand.name]);
      else toast.warning(`Qogita has no brand called “${name}”. Check the spelling as Qogita writes it.`);
      setText("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setChecking(false);
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input id="brand" placeholder="Type a brand and press Enter" value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <Button variant="outline" disabled={!text.trim() || checking} onClick={add}>{checking ? "Checking…" : "Add"}</Button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((b) => (
            <Badge key={b} variant="brand" asChild>
              <button onClick={() => onChange(value.filter((x) => x !== b))} aria-label={`Remove ${b}`} className="cursor-pointer">{b} <XIcon /></button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

