"use client";

import { StarIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BulkBar } from "@/components/BulkBar";
import { usePageCrumbs } from "@/components/Crumbs";
import { useDialogs } from "@/components/Dialogs";
import { FilterBar, type FilterOptions } from "@/components/FilterBar";
import { Detail } from "@/components/results/Detail";
import { DetailDrawer } from "@/components/results/DetailDrawer";
import { downloadXlsx, exportRows } from "@/components/results/exportXlsx";
import { ResultsTable, type DisplayRow } from "@/components/results/ResultsTable";
import { compareResults } from "@/components/results/sort";
import type { Fav, Result, SortKey } from "@/components/results/types";
import { useSparks } from "@/components/results/useSparks";
import { EmptyState, ErrorState } from "@/components/States";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { EMPTY_FILTERS, matches, normalizeFilters, type FilterSet } from "@/lib/filters";
import { GATE_LABELS, withDefaults, type GateId, type ProfileConfig } from "@/lib/screening/config";
import { api, when } from "@/lib/ui/client";
import { brandOf, dormantOf, toFilterRow } from "@/lib/ui/resultRows";
import type { WatchCondition } from "@/lib/watch";

interface Item {
  favourite: Fav & { created_at: string };
  latest: (Result & { updated_at: string; run: { id: string; name: string; source: string } | null }) | null;
  outdated: boolean;
}
interface Profile { id: string; name: string; is_default: boolean; config: ProfileConfig }

const STORAGE_KEY = "ws.filters.favourites";

/** A favourite never screened to completion, as a row the table can show. */
function stub(f: Item["favourite"]): Result {
  return {
    id: `fav:${f.id}`, status: "pending", verdict: null, failed_gate: null, gate_outcomes: [], fees: null, sell_price: null, price_source: null,
    landed_cost: null, profit: null, roi: null, margin: null, hurdle_price: null, score: null, group_scores: null, why: "Not screened yet: re-screen it.",
    band: null, offer_count: 1, error: null, inputs: null, product: { ean: f.ean, asin: f.asin, title: null, brand: null, category: null }, offer: null,
  } as unknown as Result;
}

/** Favourites on the results table: columns, resizing, sparklines, the drawer and the bulk bar. */
export default function FavouritesPage() {
  usePageCrumbs([{ label: "Favourites" }]);
  const router = useRouter();
  const { confirm } = useDialogs();
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfileId] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "score", dir: -1 });
  const { sparks, observe: observeSparks } = useSparks();
  const [filters, setFiltersState] = useState<FilterSet>(() => {
    if (typeof window === "undefined") return EMPTY_FILTERS;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      return saved ? normalizeFilters(JSON.parse(saved)) : EMPTY_FILTERS;
    } catch {
      return EMPTY_FILTERS;
    }
  });
  const setFilters = (f: FilterSet) => {
    setFiltersState(f);
    setSelected(new Set());
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(f));
    } catch {
      // Not remembered in this browser; the filters still apply.
    }
  };

  const load = useCallback(() => {
    api<{ items: Item[]; unavailable?: string }>("/api/favourites")
      .then((r) => { setItems(r.items); if (r.unavailable) setNote(r.unavailable); })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    load();
    api<{ profiles: Profile[] }>("/api/profiles").then((r) => setProfiles(r.profiles)).catch(() => {});
  }, [load]);

  // The default profile's line cap and months limit, for the order columns.
  const cfg = useMemo(() => withDefaults(profiles.find((p) => p.is_default)?.config ?? null), [profiles]);
  const lineBudget = (cfg.budget * cfg.gates.budgetFit.maxLineSharePct) / 100;

  // Each favourite as a table row: its latest result, or a stub when it has none.
  const all = useMemo(() => (items ?? []).map((i) => ({ item: i, r: (i.latest ?? stub(i.favourite)) as Result })), [items]);
  const byRow = useMemo(() => new Map(all.map((x) => [x.r.id, x.item])), [all]);
  const starred = useMemo(() => new Set(all.map((x) => `${x.item.favourite.ean}/${x.item.favourite.asin ?? ""}`)), [all]);
  const shown = useMemo(() => {
    const order = compareResults(sort.key, sort.dir, lineBudget);
    return all.filter((x) => matches(toFilterRow(x.r, starred), filters)).sort((a, b) => order(a.r, b.r));
  }, [all, starred, filters, sort, lineBudget]);
  const displayRows = useMemo<DisplayRow[]>(() => shown.map((x) => ({ r: x.r, alt: false, groupKey: x.r.id, others: 0 })), [shown]);
  const visibleIds = useMemo(() => shown.map((x) => x.r.id), [shown]);

  const activeIndex = activeId ? displayRows.findIndex((d) => d.r.id === activeId) : -1;
  const active = activeIndex >= 0 ? displayRows[activeIndex].r : null;
  const step = useCallback((by: -1 | 1) => {
    const i = activeIndex + by;
    if (i >= 0 && i < displayRows.length) setActiveId(displayRows[i].r.id);
  }, [activeIndex, displayRows]);

  const options = useMemo<FilterOptions>(() => {
    const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b));
    const latest = all.map((x) => x.item.latest).filter((l): l is NonNullable<Item["latest"]> => !!l);
    const gates = new Map<string, number>();
    for (const l of latest) if (l.failed_gate) gates.set(l.failed_gate, (gates.get(l.failed_gate) ?? 0) + 1);
    return {
      brands: uniq(latest.map(brandOf)),
      suppliers: uniq(latest.map((l) => l.offer?.supplier?.name)),
      gates: [...gates].map(([id, count]) => ({ id, label: GATE_LABELS[id as GateId] ?? id, count })),
      verdictCounts: {
        pass: latest.filter((l) => l.verdict === "pass").length,
        warn: latest.filter((l) => l.verdict === "warn").length,
        fail: latest.filter((l) => l.verdict === "fail").length,
        dormant: latest.filter((l) => dormantOf(l)).length,
      },
    };
  }, [all]);

  const favOf = (r: Result) => byRow.get(r.id)?.favourite;
  async function unstar(ids: string[]) {
    for (const id of ids) await api(`/api/favourites?id=${id}`, { method: "DELETE" });
    setItems((xs) => xs && xs.filter((x) => !ids.includes(x.favourite.id)));
    setSelected(new Set());
  }
  async function unstarRow(r: Result) {
    const f = favOf(r);
    if (!f) return;
    if (f.note && !(await confirm({ title: "Un-star this product?", description: `Its note is deleted with it: “${f.note.slice(0, 140)}”`, confirmLabel: "Un-star", destructive: true }))) return;
    try {
      await unstar([f.id]);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function saveNote(r: Result, _f: Fav | undefined, text: string) {
    const f = favOf(r);
    if (!f) return;
    try {
      await api("/api/favourites", { method: "PATCH", json: { id: f.id, note: text } });
      setItems((xs) => xs && xs.map((x) => (x.favourite.id === f.id ? { ...x, favourite: { ...x.favourite, note: text.trim() || null } } : x)));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function watch(r: Result, condition: WatchCondition | null, noSupplier: boolean) {
    const f = favOf(r);
    if (!f) return;
    try {
      await api("/api/watchlist", { method: "PUT", json: { ean: f.ean, asin: f.asin, condition, noSupplier } });
      setItems((xs) => xs && xs.map((x) => (x.favourite.id === f.id ? { ...x, favourite: { ...x.favourite, condition, no_supplier: noSupplier } } : x)));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  const itemsOf = (ids: Iterable<string>) => [...ids].map((id) => byRow.get(id)).filter((i): i is Item => !!i);
  async function waive(r: Result, gate: GateId, action: "waive" | "unwaive", reason?: string) {
    const f = favOf(r);
    if (!f) return;
    await api("/api/overrides", { method: "POST", json: { items: [{ ean: f.ean, asin: f.asin }], gate, action, reason } });
    toast.success(`${GATE_LABELS[gate]} ${action === "waive" ? "waived" : "un-waived"}: it applies when the product is next screened.`);
  }
  async function bulkWaive(gate: GateId, action: "waive" | "unwaive", reason?: string) {
    const items = itemsOf(selected).map((i) => ({ ean: i.favourite.ean, asin: i.favourite.asin }));
    await api("/api/overrides", { method: "POST", json: { items, gate, action, reason } });
  }
  async function rescreen(ids?: string[]) {
    setBusy(true);
    try {
      const r = await api<{ runId: string }>("/api/favourites/rescreen", { method: "POST", json: { profileId: profileId || undefined, ids } });
      router.push(`/runs/${r.runId}`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }
  function exportXlsx(only?: Set<string>) {
    const rows = shown.filter((x) => !only || only.has(x.r.id)).filter((x) => x.item.latest).map((x) => ({ r: x.r, listing: "favourite" }));
    downloadXlsx(exportRows(rows, lineBudget), "favourites");
  }

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="page-title">Favourites</h1>
        <p className="text-sm text-muted-foreground">
          {all.length} product{all.length === 1 ? "" : "s"}, each with its latest result from any run
          {all.some((x) => x.item.outdated) && <> · <span className="text-warn">{all.filter((x) => x.item.outdated).length} outdated</span> (over 7 days old)</>}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect className="w-44" value={profileId} onChange={(e) => setProfileId(e.target.value)} aria-label="Profile to re-screen with">
          <NativeSelectOption value="">Default profile</NativeSelectOption>
          {profiles.map((p) => <NativeSelectOption key={p.id} value={p.id}>{p.name}</NativeSelectOption>)}
        </NativeSelect>
        <Button onClick={() => rescreen()} disabled={busy || !all.length} title="New run with only these favourites, named 'Favourites <date>'">
          {busy ? "Starting…" : "Re-screen favourites"}
        </Button>
        <Button variant="outline" onClick={() => exportXlsx()} disabled={!shown.length}>Export {shown.length} to xlsx</Button>
      </div>
    </div>
  );

  if (error && !items) return <div className="space-y-4">{header}<ErrorState title="Couldn't load favourites" message={error} onRetry={load} /></div>;
  if (!items) return <div className="space-y-4">{header}<Skeleton className="h-24 rounded-xl" /><Skeleton className="h-72 rounded-xl" /></div>;

  return (
    <div className="space-y-4">
      {header}
      {note && <p className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">{note}</p>}
      {!all.length ? (
        <EmptyState icon={<StarIcon />} title="No favourites yet" action={<Button variant="outline" asChild><Link href="/runs">Go to runs</Link></Button>}>
          Star a product on any run&apos;s results to keep it here, with its latest result and your notes.
        </EmptyState>
      ) : (
        <>
          <BulkBar count={selected.size} stashed={0} onReselect={() => {}} onClear={() => setSelected(new Set())}
            onUnstar={async () => {
              const favs = itemsOf(selected);
              const withNotes = favs.filter((i) => i.favourite.note).length;
              if (withNotes && !(await confirm({ title: `Un-star ${favs.length}?`, description: `${withNotes} of them have notes, deleted with them.`, confirmLabel: "Un-star", destructive: true }))) return;
              await unstar(favs.map((i) => i.favourite.id));
            }}
            onWaive={(gate, reason) => bulkWaive(gate, "waive", reason)} onUnwaive={(gate) => bulkWaive(gate, "unwaive")}
            onRescreen={() => rescreen(itemsOf(selected).map((i) => i.favourite.id))} onExport={() => exportXlsx(selected)} />
          <FilterBar value={filters} onChange={setFilters} options={options} favouritesAvailable={false}
            matching={shown.length} total={all.length} unit="favourites" gateLabels={GATE_LABELS} />
          <ResultsTable rows={displayRows} storageKey="ws.table.favourites.v1"
            selected={selected} onToggleSelect={(id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
            visibleIds={visibleIds} onSelectAll={setSelected}
            expandedGroups={new Set()} onToggleGroup={() => {}}
            open={open} onToggleOpen={(id) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
            activeId={active?.id ?? null} onActivate={(id) => setActiveId((cur) => (cur === id ? null : id))}
            favourites={starred} onStar={unstarRow}
            sort={sort} onSort={(key) => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === "title" ? 1 : -1 }))}
            sparks={sparks} observeSparks={observeSparks}
            rowNote={(r) => {
              const i = byRow.get(r.id);
              if (!i) return null;
              return (
                <div className="text-2xs text-muted-foreground">
                  {i.latest ? <>Screened {when(i.latest.updated_at)}{i.latest.run && <> · <Link className="text-brand hover:underline" href={`/runs/${i.latest.run.id}`} onClick={(e) => e.stopPropagation()}>{i.latest.run.name}</Link></>}</> : <span className="text-warn">Not screened yet</span>}
                  {i.outdated && i.latest && <Badge variant="warn" className="ml-1.5">outdated</Badge>}
                  {i.favourite.note && <span className="italic"> · {i.favourite.note}</span>}
                </div>
              );
            }}
            renderDetail={(r) => <Detail r={r} fav={favOf(r)} onNote={saveNote} onWaive={waive} onWatch={watch} budgetGbp={lineBudget} />}
            empty="Nothing matches these filters."
            lineCapGbp={lineBudget} maxMonths={cfg.gates.demand.maxMonthsToSell} />
          {active && (
            <DetailDrawer r={active} index={activeIndex} count={displayRows.length} sparks={active.product?.asin ? sparks[active.product.asin] : null}
              onStep={step} onClose={() => setActiveId(null)}>
              <Detail r={active} fav={favOf(active)} onNote={saveNote} onWaive={waive} onWatch={watch} stacked budgetGbp={lineBudget} />
            </DetailDrawer>
          )}
        </>
      )}
    </div>
  );
}
