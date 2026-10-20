"use client";

import { StaleBanner } from "@/components/results/StaleBanner";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronsUpIcon, LoaderIcon, PauseIcon, PlayIcon } from "lucide-react";
import { VerdictCard } from "@/components/check/VerdictCard";
import type { VerdictCard as VerdictCardData } from "@/lib/server/check";
import { toast } from "sonner";
import { BulkBar } from "@/components/BulkBar";
import { useDialogs } from "@/components/Dialogs";
import { EditableName } from "@/components/EditableName";
import { ResultsFilterBar, type FilterOptions } from "@/components/results/ResultsFilterBar";
import { Detail } from "@/components/results/Detail";
import { DetailDrawer } from "@/components/results/DetailDrawer";
import { ResultsTable, type ResultRow } from "@/components/results/ResultsTable";
import { eanOf, type Progress, type Result, type Run, type SortKey } from "@/components/results/types";
import { useResultActions } from "@/components/results/useResultActions";
import { useSparks } from "@/components/results/useSparks";
import { downloadXlsx, exportRows } from "@/components/results/exportXlsx";
import { compareResults, loadResultSort, nextResultSort, saveResultSort } from "@/components/results/sort";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { etaLabel } from "@/lib/eta";
import { matches, type FilterSet } from "@/lib/filters";
import { GATE_LABELS, GATE_ORDER, withDefaults, type GateId } from "@/lib/screening/config";
import { api, when } from "@/lib/ui/client";
import { useUrlFilters } from "@/lib/ui/useUrlFilters";
import { storefrontUrl } from "@/lib/check/seller";
import { groupRows } from "@/lib/ui/group";
import { brandOf, dormantOf, toFilterRow } from "@/lib/ui/resultRows";
import { cn } from "@/lib/utils";

export default function RunPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { confirm } = useDialogs();
  const [run, setRun] = useState<Run | null>(null);
  // An ASIN check of one item: its verdict card, above the row.
  const [card, setCard] = useState<VerdictCardData | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const processing = !!progress && !progress.done;
  const [activeId, setActiveId] = useState<string | null>(null);
  const { sparks, observe: observeSparks } = useSparks();
  // EANs whose other ASINs are shown.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sort, setSortState] = useState<{ key: SortKey; dir: 1 | -1 }>(() => loadResultSort("results"));
  const setSort = (next: { key: SortKey; dir: 1 | -1 }) => { setSortState(next); saveResultSort("results", next); };
  // The sparklines only reorder rows when sorting by them (they load as rows scroll into view).
  const sortSparks = sort.key === "rank90" || sort.key === "bb90" ? sparks : undefined;
  // Filters live in the address (bookmarkable; Today and ⌘K link to filtered views).
  const [filters, setUrlFilters] = useUrlFilters();
  // Selected result ids. Kept while scrolling; cleared when the filters change, with "Reselect".
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [stash, setStash] = useState<Set<string> | null>(null);
  const setFilters = (f: FilterSet) => {
    if (selected.size) {
      setStash(selected);
      setSelected(new Set());
    }
    setUrlFilters(f);
  };
  const acts = useResultActions({ runId: id, onChanged: () => refresh() });
  const { favourites, favOf } = acts;
  /** Waive or un-waive a gate for this product; its rows in this run are re-screened now. */
  async function waive(r: Result, gate: GateId, action: "waive" | "unwaive", reason?: string) {
    if (await acts.waiveOne(r, gate, action, reason)) setNonce((n) => n + 1);
  }
  const cost = acts.cost;

  // Bulk actions on the selection.
  const selectedRows = () => results.filter((r) => selected.has(r.id));
  async function bulkWaive(gate: GateId, action: "waive" | "unwaive", reason?: string) {
    if (await acts.waive(selectedRows(), gate, action, reason)) setNonce((n) => n + 1);
  }
  async function rescreenRows(resultIds: string[]) {
    try {
      const r = await api<{ runId: string }>(`/api/runs/${id}/selection`, { method: "POST", json: { resultIds } });
      router.push(`/runs/${r.runId}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function bulkRemove() {
    await api(`/api/runs/${id}/selection`, { method: "DELETE", json: { resultIds: [...selected] } });
    setSelected(new Set());
    await loadAll();
  }
  const [profiles, setProfiles] = useState<{ id: string; name: string }[]>([]);
  const [rescreenProfile, setRescreenProfile] = useState("");
  const [rescreening, setRescreening] = useState(false);
  // Bumped after a re-screen so the effect below reloads and resumes processing.
  const [nonce, setNonce] = useState(0);
  // Stops the status polling of the current effect (and on delete).
  const cancel = useRef<() => void>(() => {});

  const [loadingRest, setLoadingRest] = useState<{ loaded: number; total: number } | null>(null);
  const loader = useMemo(() => runLoader(id, { setRun, setResults, setLoadingRest }), [id]);
  const loadAll = loader.loadAll;
  const refresh = loader.refresh;

  // Screening runs in the background. Poll its status, reload the table when rows land,
  // and resume the worker if none holds the run (the chain stalled, or the page was the
  // first thing to notice). Closing the page doesn't stop it.
  useEffect(() => {
    let stopped = false;
    let lastProcessed = -1;
    let lastReload = 0;
    let lastKick = 0;
    let kicking = false;
    // A re-screen carries itself on; if it stalls (no progress for a minute), resume it.
    let lastLeft = -1;
    let leftSince = Date.now();
    cancel.current = () => {
      stopped = true;
    };
    const tick = async () => {
      try {
        const p = await api<Progress>(`/api/runs/${id}/progress`);
        if (stopped) return;
        setProgress(p);
        const left = p.rescreen?.left ?? 0;
        if (left !== lastLeft) {
          lastLeft = left;
          leftSince = Date.now();
        }
        const changed = p.processed !== lastProcessed || (left > 0 && Date.now() - lastReload > 4_000) || (!left && lastLeft > 0);
        if (lastProcessed === -1) {
          // The rows were asked for as the page opened (below), alongside this.
          lastProcessed = p.processed;
          lastReload = Date.now();
        } else if ((changed && Date.now() - lastReload > 4_000) || (p.done && changed)) {
          lastProcessed = p.processed;
          lastReload = Date.now();
          await refresh();
        }
        if (p.paused) {
          // Paused: keep watching (it may be resumed elsewhere) but never kick it.
        } else if (left > 0 && !kicking && Date.now() - leftSince > 60_000) {
          leftSince = Date.now();
          kicking = true;
          fetch(`/api/runs/${id}/rescreen`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ continuing: true }) })
            .catch(() => {}).finally(() => { kicking = false; });
        }
        // Never overlap our own call; a worker holding the lease shows as working.
        const waitingTurn = p.keepaTurn && !p.keepaTurn.mine && p.waiting.amazon === 0;
        if (!p.paused && !waitingTurn && !p.done && !left && !p.working && !kicking && Date.now() - lastKick > 15_000) {
          lastKick = Date.now();
          kicking = true;
          fetch(`/api/runs/${id}/process`, { method: "POST" }).catch(() => {}).finally(() => {
            kicking = false;
          });
        }
        if (!p.done && !stopped) setTimeout(tick, 3_000);
      } catch (e) {
        if (!stopped) {
          setError((e as Error).message);
          setTimeout(tick, 10_000);
        }
      }
    };
    // Rows straight away (the first screen, then the rest), not after the first status check.
    refresh().catch((e: Error) => { if (!stopped) setError(e.message); });
    tick();
    return () => {
      stopped = true;
    };
  }, [id, loadAll, refresh, nonce]);

  useEffect(() => {
    api<{ profiles: { id: string; name: string }[] }>("/api/profiles").then((r) => setProfiles(r.profiles)).catch(() => {});
  }, []);

  const isCheck = !!(run?.stats as { check?: unknown } | null | undefined)?.check && run?.row_count === 1;
  useEffect(() => {
    if (!isCheck) return;
    api<{ card: VerdictCardData }>(`/api/runs/${id}/card`).then((r) => setCard(r.card)).catch(() => {});
  }, [isCheck, id, results, progress?.done]);

  async function control(action: "pause" | "resume" | "keepaFirst") {
    try {
      await api(`/api/runs/${id}/control`, { method: "POST", json: { action } });
      toast.success(action === "pause" ? "Pausing after the current batch" : action === "resume" ? "Resumed" : "This run goes first on Keepa");
      setProgress((p) => p && { ...p, paused: action === "pause" ? true : action === "resume" ? false : p.paused });
      if (action !== "pause") setNonce((n) => n + 1);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function rescreen() {
    setRescreening(true);
    setError(null);
    try {
      cancel.current();
      const r = await api<{ rescored: number; requeued: number; remaining: number; profile: { name: string } }>(`/api/runs/${id}/rescreen`, {
        method: "POST",
        json: { profileId: rescreenProfile || undefined },
      });
      toast.success(
        `Re-screening with ${r.profile.name} as saved now: ${r.rescored.toLocaleString("en-GB")} rows done` +
          (r.remaining ? `, ${r.remaining.toLocaleString("en-GB")} more carrying on in the background` : "") +
          (r.requeued ? `; ${r.requeued} need data they never fetched and are being looked up now.` : "."),
      );
      setNonce((n) => n + 1);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRescreening(false);
    }
  }

  const done = results.filter((r) => r.status !== "pending");
  const failedGates = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of done) if (r.failed_gate) m.set(r.failed_gate, (m.get(r.failed_gate) ?? 0) + 1);
    return GATE_ORDER.filter((g) => m.has(g)).map((g) => ({ gate: g, n: m.get(g)! }));
  }, [done]);

  // One line's share of the budget, as the budget gate uses it: the most the cart suggests ordering.
  const lineBudget = useMemo(() => {
    const cfg = withDefaults(run?.profile_snapshot ?? null);
    return (cfg.budget * cfg.gates.budgetFit.maxLineSharePct) / 100;
  }, [run?.profile_snapshot]);
  const rows = useMemo(() => {
    const filtered = done.filter((r) => matches(toFilterRow(r, favourites), filters));
    const order = compareResults(sort.key, sort.dir, lineBudget, sortSparks);
    // One line per EAN: its best ASIN leads, the others sit collapsed beneath it.
    return groupRows(filtered, eanOf, order);
  }, [done, filters, favourites, sort, lineBudget, sortSparks]);
  const listingCount = rows.reduce((a, g) => a + 1 + g.others.length, 0);
  // What the table shows: each EAN's lead, plus its other ASINs when expanded.
  const displayRows = useMemo<ResultRow[]>(() => rows.flatMap((g) => [
    { r: g.lead, alt: false, groupKey: g.key, others: g.others.length },
    ...(expanded.has(g.key) ? g.others.map((r) => ({ r, alt: true, groupKey: g.key, others: 0 })) : []),
  ]), [rows, expanded]);
  // The row open in the drawer; it closes if the filters hide it.
  const activeIndex = activeId ? displayRows.findIndex((d) => d.r.id === activeId) : -1;
  const active = activeIndex >= 0 ? displayRows[activeIndex].r : null;
  const step = useCallback((by: -1 | 1) => {
    const i = activeIndex + by;
    if (i >= 0 && i < displayRows.length) setActiveId(displayRows[i].r.id);
  }, [activeIndex, displayRows]);
  const closeDrawer = useCallback(() => setActiveId(null), []);
  // The current filtered set, every listing (collapsed alternatives included), for select-all.
  const visibleIds = useMemo(() => rows.flatMap((g) => [g.lead.id, ...g.others.map((r) => r.id)]), [rows]);

  // Counted per product (EAN), by its best listing.
  const products = useMemo(() => groupRows(done, eanOf, () => 0).map((g) => g.lead), [done]);
  const filterOptions = useMemo<FilterOptions>(() => {
    const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b));
    return {
      brands: uniq(done.map(brandOf)),
      suppliers: uniq(done.map((r) => r.offer?.supplier?.name)),
      gates: failedGates.map((f) => ({ id: f.gate, label: GATE_LABELS[f.gate], count: f.n })),
      verdictCounts: {
        pass: products.filter((r) => r.verdict === "pass" && r.status !== "error").length,
        warn: products.filter((r) => r.verdict === "warn" && r.status !== "error").length,
        fail: products.filter((r) => r.verdict === "fail" && r.status !== "error").length,
        error: products.filter((r) => r.status === "error").length,
        dormant: products.filter((r) => dormantOf(r)).length,
      },
    };
  }, [done, products, failedGates]);

  function exportXlsx(only?: Set<string>) {
    const all = rows.flatMap((g) => [{ r: g.lead, listing: g.others.length ? "best" : "only" }, ...g.others.map((r) => ({ r, listing: "alternative" }))]);
    // A selection may include rows the current filters hide (after "Reselect"): export them all.
    const flat = only ? done.filter((r) => only.has(r.id)).map((r) => ({ r, listing: all.find((x) => x.r.id === r.id)?.listing ?? "selected" })) : all;
    downloadXlsx(exportRows(flat, lineBudget), run?.name || run?.source || "run");
  }

  if (error && !run) {
    const missing = /not found|invalid input syntax/i.test(error);
    return (
      <ErrorState title={missing ? "Run not found" : "Couldn't load this run"}
        message={missing ? "It may have been deleted." : error}
        onRetry={missing ? undefined : () => { setError(null); setNonce((n) => n + 1); }}
        action={<Button variant="ghost" asChild><Link href="/runs">All runs</Link></Button>} />
    );
  }
  if (!run) return <RunSkeleton />;

  const total = Math.max(run.row_count, results.length);

  return (
    <div className={cn("space-y-4 transition-[margin]", active && "xl:mr-[27rem]")}>
      <PageHeader
        crumbs={[{ label: "Wholesale", href: "/runs" }, { label: "Runs", href: "/runs" }, { label: run.name || run.source }]}
        title={
          <EditableName value={run.name || run.source} inputClassName="text-lg font-semibold"
            onSave={async (name) => {
              await api(`/api/runs/${id}`, { method: "PATCH", json: { name } });
              setRun((r) => r && { ...r, name });
            }} />
        }
        subtitle={<>{run.profile?.name ?? "Profile"} · started {when(run.started_at)} · <span className="num">{(products.length || total).toLocaleString("en-GB")}</span> products (<span className="num">{total.toLocaleString("en-GB")}</span> listings) · <span className="num">{run.token_cost.toLocaleString("en-GB")}</span> Keepa tokens</>}
        info={<>
          {run.name && run.name !== run.source && <p>Source: {run.source}</p>}
          <p>Profile: {run.profile?.name ?? "Profile"}{profileVersion(run)}.</p>
          <p>Keepa tokens: {run.token_cost.toLocaleString("en-GB")}{tokenStages(run)}.</p>
          <p>Re-screen re-runs the gates and score with the profile&apos;s current settings, using the data already fetched: no re-upload, and only rows that now need data they never had are looked up (which can spend Keepa tokens).</p>
        </>}
        actions={<>
          <NativeSelect className="w-60" value={rescreenProfile} onChange={(e) => setRescreenProfile(e.target.value)} aria-label="Profile to re-screen with">
            <NativeSelectOption value="">{run.profile?.name ?? "This run's profile"} (as saved now)</NativeSelectOption>
            {profiles.filter((p) => p.name !== run.profile?.name).map((p) => <NativeSelectOption key={p.id} value={p.id}>{p.name}</NativeSelectOption>)}
          </NativeSelect>
          <Button variant="secondary" onClick={rescreen} disabled={processing} loading={rescreening}
            title="Re-run gates and score with the profile's current settings, using the data already fetched. No re-upload; only rows that now need data they never had are looked up (which can spend Keepa tokens).">
            {rescreening ? "Re-screening" : "Re-screen"}
          </Button>
          {processing && (progress?.paused
            ? <Button onClick={() => control("resume")}><PlayIcon /> Resume</Button>
            : <Button variant="secondary" onClick={() => control("pause")} title="Stop after the current batch. Everything done so far is kept; no Keepa tokens are spent while paused.">
                <PauseIcon /> Pause
              </Button>)}
          <Button variant="secondary" onClick={() => exportXlsx()} disabled={!rows.length}>Export {rows.length} products to xlsx</Button>
          <Button variant="danger" onClick={async () => {
            if (!(await confirm({ title: `Delete “${run.name || run.source}”?`, description: "The run and its results are removed. Products, favourites and waivers are kept.", confirmLabel: "Delete", destructive: true }))) return;
            cancel.current();
            await api(`/api/runs/${id}`, { method: "DELETE" }).catch(() => {});
            router.push("/runs");
          }}>Delete</Button>
        </>}
      />
      {run.stats?.scan && (
        <p className="-mt-2 text-meta text-muted-foreground">
          Storefront of{" "}
          <a className="font-medium text-primary hover:underline" href={storefrontUrl(run.stats.scan.sellerId)} target="_blank" rel="noreferrer">{run.stats.scan.sellerName ?? run.stats.scan.sellerId}</a>
          : {run.stats.scan.asins.toLocaleString("en-GB")} ASINs screened with no cost
          {run.stats.scan.more > 0 ? `; ${run.stats.scan.more.toLocaleString("en-GB")} more on the storefront not scanned` : ""}
          {" · "}{results.filter((x) => x.inputs?.market?.buyBoxSellerId === run.stats?.scan?.sellerId).length} where it holds the Buy Box now
          {" · "}<Link className="text-primary hover:underline" href="/sellers">Sellers</Link>
        </p>
      )}

      {card && <VerdictCard card={card} onFetchAnyway={async () => {
        try {
          const r = await api<{ card: VerdictCardData }>(`/api/runs/${id}/fetch-anyway`, { method: "POST" });
          setCard(r.card);
          setNonce((n) => n + 1);
        } catch (e) {
          toast.error((e as Error).message);
        }
      }} />}

      {progress && !progress.done && (
        <div className="panel space-y-2 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="font-medium">
              {progress.paused ? `Paused at ${progress.processed.toLocaleString("en-GB")} of ${progress.total.toLocaleString("en-GB")}` : progress.rescreen?.left ? `Re-screening: ${(progress.total - progress.rescreen.left).toLocaleString("en-GB")} of ${progress.total.toLocaleString("en-GB")} rows` : `Screening ${progress.processed} of ${progress.total}`}
            </span>
            <span className="text-muted-foreground">
              {progress.paused
                ? <>Nothing runs and no Keepa tokens are spent until you <button className="cursor-pointer font-medium text-primary underline-offset-2 hover:underline" onClick={() => control("resume")}>resume</button>.</>
                : progress.working ? "Working in the background: you can close this page." : "Resuming…"}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-subtle">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress.total ? ((progress.rescreen?.left ? progress.total - progress.rescreen.left : progress.processed) / progress.total) * 100 : 0}%` }} />
          </div>
          {progress.eta && !progress.paused && <p className="text-sm font-medium" aria-live="polite">{etaLabel(progress.eta)[0].toUpperCase() + etaLabel(progress.eta).slice(1)}</p>}
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
            <span><span className="num font-semibold text-foreground">{progress.waiting.amazon}</span> waiting on Amazon (catalog, price, gating, fees)</span>
            <span>
              <span className="num font-semibold text-foreground">{progress.waiting.keepa}</span> waiting on Keepa tokens
              {progress.waiting.keepa > 0 && !progress.paused && progress.keepaResumeAt && <> · resumes about {new Date(progress.keepaResumeAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</>}
            </span>
            <span><span className="num font-semibold text-foreground">{progress.tokenCost}</span> Keepa tokens so far</span>
          </div>
          {!progress.paused && progress.keepaTurn?.owner && !progress.keepaTurn.mine && progress.waiting.keepa > 0 && (
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                Keepa is in use by{" "}
                <Link className="font-medium text-foreground underline-offset-2 hover:underline" href={`/runs/${progress.keepaTurn.owner.id}`}>
                  {progress.keepaTurn.owner.name || progress.keepaTurn.owner.source}
                </Link>
                ; this run waits its turn (one run uses Keepa at a time).
              </span>
              <Button size="sm" variant="secondary" onClick={() => control("keepaFirst")}><ChevronsUpIcon /> Go first</Button>
            </p>
          )}
          {!progress.paused && progress.keepaTurn?.mine && progress.waiting.keepa > 0 && (
            <p className="text-xs text-muted-foreground">This run is the one using Keepa now.</p>
          )}
        </div>
      )}
      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

      <BulkBar count={selected.size} stashed={stash?.size ?? 0}
        onReselect={() => { if (stash) setSelected(new Set([...stash].filter((x) => results.some((r) => r.id === x)))); setStash(null); }}
        onClear={() => { setSelected(new Set()); setStash(null); }}
        onStar={() => acts.bulkStar(selectedRows(), "star")} onUnstar={() => acts.bulkStar(selectedRows(), "unstar")}
        onWaive={(gate, reason) => bulkWaive(gate, "waive", reason)} onUnwaive={(gate) => bulkWaive(gate, "unwaive")}
        onSetCost={(c) => cost([...selected], c)} onClearCost={() => cost([...selected], null)}
        onRescreen={() => rescreenRows([...selected])} onExport={() => exportXlsx(selected)} onRemove={bulkRemove} />

      <ResultsFilterBar value={filters} onChange={setFilters} options={filterOptions} favouritesAvailable={favourites.size > 0}
        matching={rows.length} total={products.length} unit={`products (${listingCount} listings shown)`} gateLabels={GATE_LABELS} />
      {loadingRest && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
          <LoaderIcon className="size-3 animate-spin" /> Loading rows: {loadingRest.loaded.toLocaleString("en-GB")} of {loadingRest.total.toLocaleString("en-GB")}. Filters, sorting and export cover the rows loaded so far.
        </p>
      )}

      <StaleBanner rows={results.map((x) => ({ id: x.id, run_id: id, fees: x.fees as never }))} onRechecked={() => setNonce((n) => n + 1)} />

      <ResultsTable rows={displayRows} page="run" paging={{ kind: "virtual" }}
        selected={selected} onSelect={setSelected} visibleIds={visibleIds}
        expandedGroups={expanded} onToggleGroup={(k) => setExpanded((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; })}
        activeId={active?.id ?? null} onOpen={(rid) => setActiveId((cur) => (cur === rid ? null : rid))}
        actions={{ starred: acts.starred, onStar: acts.toggleStar, onRescreen: (r) => rescreenRows([r.id]) }}
        scanSellerId={run.stats?.scan?.sellerId ?? null}
        sort={sort} onSort={(key) => setSort(nextResultSort(sort, key))}
        sparks={sparks} observeSparks={observeSparks}
        empty={done.length ? "Nothing matches these filters." : "Rows appear here as they're screened."}
        lineCapGbp={lineBudget} maxMonths={withDefaults(run.profile_snapshot ?? null).gates.demand.maxMonthsToSell} />

      {active && (
        <DetailDrawer r={active} index={activeIndex} count={displayRows.length} sparks={active.product?.asin ? sparks[active.product.asin] : null}
          onStep={step} onClose={closeDrawer}>
          <Detail r={active} fav={favOf(active)} onNote={acts.saveNote} onWaive={waive} onWatch={acts.watch} onCost={(r, c) => cost([r.id], c)} stacked budgetGbp={lineBudget} />
        </DetailDrawer>
      )}
    </div>
  );
}

/** The run page's shape while it loads. */
function RunSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading run">
      <div className="space-y-2"><Skeleton className="h-7 w-2/3" /><Skeleton className="h-4 w-1/3" /></div>
      <div className="flex gap-2">{[240, 100, 200, 80].map((w, i) => <Skeleton key={i} className="h-9" style={{ width: w }} />)}</div>
      <Skeleton className="h-28 rounded-lg" />
      <div className="panel space-y-0 overflow-hidden">
        <Skeleton className="h-10 rounded-none" />
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 border-t px-3 py-3">
            <Skeleton className="size-4" /><Skeleton className="size-10" />
            <div className="flex-1 space-y-1.5"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-3 w-1/3" /></div>
            <Skeleton className="h-4 w-16" /><Skeleton className="h-4 w-16" /><Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** " (saved 25 Sept, 12:31; applied 25 Sept, 13:05)": which version of the profile the rows reflect. */
function profileVersion(run: Run): string {
  const p = run.stats?.profile;
  if (!p) return "";
  return ` (${p.savedAt ? `version saved ${when(p.savedAt)}; ` : ""}applied ${when(p.appliedAt)})`;
}

/** " (history 412 · Buy Box 36 · sellers 9)": the run's Keepa tokens by stage. */
function tokenStages(run: Run): string {
  const s = run.stats?.keepaStages;
  if (!s) return "";
  const parts = [["history", s.history], ["Buy Box", s.buyBox], ["EAN lookups", s.lookup], ["sellers", s.sellers]]
    .filter(([, n]) => (n as number) > 0).map(([l, n]) => `${l} ${(n as number).toLocaleString("en-GB")}`);
  return parts.length ? ` (${parts.join(" · ")})` : "";
}

type RunPage = { run: Run; results: Result[]; total: number | null; at: string };

/** The server's order: best score first, then id. */
function mergeRows(prev: Result[], rows: Result[]): Result[] {
  if (!rows.length) return prev;
  const m = new Map(prev.map((r) => [r.id, r]));
  for (const r of rows) m.set(r.id, r);
  return [...m.values()].sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * A run's rows: the first screen at once, then the rest in pages of 1,000 (loadAll); later
 * refreshes ask only for rows changed since the last answer and merge them in, starting again
 * if rows were removed.
 */
function runLoader(id: string, set: {
  setRun: (r: Run) => void;
  setResults: (f: (prev: Result[]) => Result[]) => void;
  setLoadingRest: (x: { loaded: number; total: number } | null) => void;
}) {
  let at: string | null = null;
  let full: Promise<void> | null = null;
  // Row ids held, to notice rows removed since (more held than the run has).
  let ids = new Set<string>();
  const loadAll = (): Promise<void> => {
    full ??= (async () => {
      try {
        // About two screens of rows: shown at once, the rest follows.
        const first = await api<RunPage>(`/api/runs/${id}?limit=60`);
        set.setRun(first.run);
        set.setResults(() => first.results);
        ids = new Set(first.results.map((r) => r.id));
        at = first.at;
        const total = first.total ?? first.results.length;
        let loaded = first.results.length;
        if (loaded < total) set.setLoadingRest({ loaded, total });
        for (let offset = loaded; offset < total; offset += 1000) {
          const p = await api<RunPage>(`/api/runs/${id}?offset=${offset}&limit=1000`);
          if (!p.results.length) break;
          set.setResults((prev) => mergeRows(prev, p.results));
          for (const r of p.results) ids.add(r.id);
          loaded += p.results.length;
          set.setLoadingRest({ loaded: Math.min(loaded, total), total });
        }
      } finally {
        set.setLoadingRest(null);
        full = null;
      }
    })();
    return full;
  };
  const refresh = async (): Promise<void> => {
    if (full) await full;
    if (!at) return loadAll();
    const r = await api<RunPage>(`/api/runs/${id}?since=${encodeURIComponent(at)}`);
    at = r.at;
    set.setRun(r.run);
    set.setResults((prev) => mergeRows(prev, r.results));
    for (const x of r.results) ids.add(x.id);
    if (r.total != null && ids.size > r.total) { at = null; await loadAll(); }
  };
  return { loadAll: () => { at = null; return loadAll(); }, refresh };
}
