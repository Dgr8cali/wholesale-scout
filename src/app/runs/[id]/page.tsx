"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { BulkBar } from "@/components/BulkBar";
import { usePageCrumbs } from "@/components/Crumbs";
import { useDialogs } from "@/components/Dialogs";
import { EditableName } from "@/components/EditableName";
import { FilterBar, type FilterOptions } from "@/components/FilterBar";
import { Detail } from "@/components/results/Detail";
import { DetailDrawer } from "@/components/results/DetailDrawer";
import { ResultsTable, type DisplayRow } from "@/components/results/ResultsTable";
import { eanOf, figure, titleOf, type Fav, type Progress, type Result, type Run, type SortKey } from "@/components/results/types";
import { useSparks } from "@/components/results/useSparks";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { etaLabel } from "@/lib/eta";
import { EMPTY_FILTERS, matches, normalizeFilters, type FilterSet } from "@/lib/filters";
import { GATE_LABELS, GATE_ORDER, withDefaults, type GateId } from "@/lib/screening/config";
import { api, when } from "@/lib/ui/client";
import { groupRows } from "@/lib/ui/group";
import { brandOf, dormantOf, favKey, toFilterRow } from "@/lib/ui/resultRows";
import { cn } from "@/lib/utils";

export default function RunPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { confirm } = useDialogs();
  const [run, setRun] = useState<Run | null>(null);
  usePageCrumbs([{ label: "Runs", href: "/runs" }, { label: run ? run.name || run.source : "…" }]);
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const processing = !!progress && !progress.done;
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const { sparks, observe: observeSparks } = useSparks();
  // EANs whose other ASINs are shown.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "score", dir: -1 });
  // Filters, remembered per run in this browser.
  const storageKey = `ws.filters.run.${id}`;
  const [filters, setFiltersState] = useState<FilterSet>(() => {
    if (typeof window === "undefined") return EMPTY_FILTERS;
    try {
      const saved = window.localStorage.getItem(storageKey);
      return saved ? normalizeFilters(JSON.parse(saved)) : EMPTY_FILTERS;
    } catch {
      return EMPTY_FILTERS;
    }
  });
  // Selected result ids. Kept while scrolling; cleared when the filters change, with "Reselect".
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [stash, setStash] = useState<Set<string> | null>(null);
  const setFilters = (f: FilterSet) => {
    if (selected.size) {
      setStash(selected);
      setSelected(new Set());
    }
    setFiltersState(f);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(f));
    } catch {
      // Private window or storage blocked: the filters just won't be remembered.
    }
  };
  // Favourites are per product (EAN + ASIN), not per run.
  const [favs, setFavs] = useState<Map<string, Fav>>(new Map());
  const favOf = (r: Result) => (r.product ? favs.get(favKey(r.product.ean, r.product.asin)) : undefined);
  const favourites = useMemo(() => new Set(favs.keys()), [favs]);
  useEffect(() => {
    api<{ favourites: Fav[] }>("/api/favourites?light=1")
      .then((r) => setFavs(new Map(r.favourites.map((f) => [favKey(f.ean, f.asin), f]))))
      .catch(() => {});
  }, []);
  async function toggleFavourite(r: Result) {
    if (!r.product) return;
    const key = favKey(r.product.ean, r.product.asin);
    const existing = favs.get(key);
    try {
      if (existing) {
        await api(`/api/favourites?id=${existing.id}`, { method: "DELETE" });
        setFavs((m) => { const n = new Map(m); n.delete(key); return n; });
      } else {
        const { favourite } = await api<{ favourite: Fav }>("/api/favourites", { method: "POST", json: { ean: r.product.ean, asin: r.product.asin } });
        setFavs((m) => new Map(m).set(key, favourite));
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  /** Waive or un-waive a gate for this product; its rows in this run are re-screened now. */
  async function waive(r: Result, gate: GateId, action: "waive" | "unwaive", reason?: string) {
    if (!r.product) return;
    const res = await api<{ requeued: number }>("/api/overrides", {
      method: "POST",
      json: { items: [{ ean: r.product.ean, asin: r.product.asin }], gate, action, reason, runId: id },
    });
    apply(await fetchRun());
    if (res.requeued) {
      toast.success(`${GATE_LABELS[gate]} ${action === "waive" ? "waived" : "un-waived"}; fetching the data later gates need for this product.`);
      setNonce((n) => n + 1);
    }
  }

  // Bulk actions on the selection.
  const selectedRows = () => results.filter((r) => selected.has(r.id));
  const itemsOf = (rs: Result[]) => [...new Map(rs.filter((r) => r.product).map((r) => [favKey(r.product!.ean, r.product!.asin), { ean: r.product!.ean, asin: r.product!.asin }])).values()];
  async function bulkStar(action: "star" | "unstar") {
    const items = itemsOf(selectedRows());
    const res = await api<{ favourites: Fav[] }>("/api/favourites/bulk", { method: "POST", json: { items, action } });
    setFavs((m) => {
      const n = new Map(m);
      if (action === "star") for (const f of res.favourites) n.set(favKey(f.ean, f.asin), f);
      else for (const i of items) n.delete(favKey(i.ean, i.asin));
      return n;
    });
  }
  async function bulkWaive(gate: GateId, action: "waive" | "unwaive", reason?: string) {
    const res = await api<{ requeued: number }>("/api/overrides", { method: "POST", json: { items: itemsOf(selectedRows()), gate, action, reason, runId: id } });
    apply(await fetchRun());
    if (res.requeued) setNonce((n) => n + 1);
  }
  async function bulkRescreen() {
    const r = await api<{ runId: string }>(`/api/runs/${id}/selection`, { method: "POST", json: { resultIds: [...selected] } });
    router.push(`/runs/${r.runId}`);
  }
  async function bulkRemove() {
    await api(`/api/runs/${id}/selection`, { method: "DELETE", json: { resultIds: [...selected] } });
    setSelected(new Set());
    apply(await fetchRun());
  }

  /** Save a note; on a product not yet starred, the note stars it. */
  async function saveNote(r: Result, f: Fav | undefined, note: string) {
    try {
      if (f) {
        await api("/api/favourites", { method: "PATCH", json: { id: f.id, note } });
        setFavs((m) => new Map(m).set(favKey(f.ean, f.asin), { ...f, note }));
      } else if (r.product && note.trim()) {
        const { favourite } = await api<{ favourite: Fav }>("/api/favourites", { method: "POST", json: { ean: r.product.ean, asin: r.product.asin, note } });
        setFavs((m) => new Map(m).set(favKey(favourite.ean, favourite.asin), favourite));
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  const [profiles, setProfiles] = useState<{ id: string; name: string }[]>([]);
  const [rescreenProfile, setRescreenProfile] = useState("");
  const [rescreening, setRescreening] = useState(false);
  // Bumped after a re-screen so the effect below reloads and resumes processing.
  const [nonce, setNonce] = useState(0);
  // Stops the status polling of the current effect (and on delete).
  const cancel = useRef<() => void>(() => {});

  const fetchRun = useCallback(() => api<{ run: Run; results: Result[] }>(`/api/runs/${id}`), [id]);
  const apply = useCallback((r: { run: Run; results: Result[] }) => {
    setRun(r.run);
    setResults(r.results);
  }, []);

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
        if (lastProcessed === -1 || (changed && Date.now() - lastReload > 4_000) || (p.done && changed)) {
          lastProcessed = p.processed;
          lastReload = Date.now();
          apply(await fetchRun());
        }
        if (left > 0 && !kicking && Date.now() - leftSince > 60_000) {
          leftSince = Date.now();
          kicking = true;
          fetch(`/api/runs/${id}/rescreen`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ continuing: true }) })
            .catch(() => {}).finally(() => { kicking = false; });
        }
        // Never overlap our own call; a worker holding the lease shows as working.
        if (!p.done && !left && !p.working && !kicking && Date.now() - lastKick > 15_000) {
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
    tick();
    return () => {
      stopped = true;
    };
  }, [id, fetchRun, apply, nonce]);

  useEffect(() => {
    api<{ profiles: { id: string; name: string }[] }>("/api/profiles").then((r) => setProfiles(r.profiles)).catch(() => {});
  }, []);

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

  const rows = useMemo(() => {
    const filtered = done.filter((r) => matches(toFilterRow(r, favourites), filters));
    const val = (r: Result): number | string | null =>
      sort.key === "title" ? titleOf(r).toLowerCase()
        : sort.key === "verdict" ? ({ pass: 0, warn: 1, fail: 2 }[r.verdict ?? "fail"])
        : sort.key === "sales" || sort.key === "sellers" || sort.key === "buybox" || sort.key === "share" || sort.key === "profitMo" ? figure(r, sort.key).value
        : (r[sort.key] as number | null);
    const order = (a: Result, b: Result) => {
      const x = val(a), y = val(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    };
    // One line per EAN: its best ASIN leads, the others sit collapsed beneath it.
    return groupRows(filtered, eanOf, order);
  }, [done, filters, favourites, sort]);
  const listingCount = rows.reduce((a, g) => a + 1 + g.others.length, 0);
  // What the table shows: each EAN's lead, plus its other ASINs when expanded.
  const displayRows = useMemo<DisplayRow[]>(() => rows.flatMap((g) => [
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
  // One line's share of the budget, as the budget gate uses it: the most the cart suggests ordering.
  const lineBudget = useMemo(() => {
    const cfg = withDefaults(run?.profile_snapshot ?? null);
    return (cfg.budget * cfg.gates.budgetFit.maxLineSharePct) / 100;
  }, [run?.profile_snapshot]);
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
    const data = flat.map(({ r, listing }) => ({
      Listing: listing,
      Verdict: r.status === "error" ? "error" : r.verdict,
      Score: r.score,
      Band: r.band,
      Product: titleOf(r),
      Brand: r.product?.brand,
      EAN: r.product?.ean,
      ASIN: r.product?.asin,
      Supplier: r.offer?.supplier?.name,
      "Cost / unit (quoted)": r.offer?.unit_cost,
      Currency: r.offer?.currency,
      "Cost / unit (GBP ex-VAT)": r.offer?.unit_cost_gbp,
      "Est. sales / month": figure(r, "sales").value,
      "Est. sales source": figure(r, "sales").note,
      Sellers: figure(r, "sellers").value,
      "Your share / mo": figure(r, "share").value,
      "Your profit / mo": figure(r, "profitMo").value,
      "Sellers source": figure(r, "sellers").note,
      "Buy Box": figure(r, "buybox").value,
      "Landed cost": r.landed_cost,
      "Sell price": r.sell_price,
      "Price source": r.price_source,
      "Amazon fees": r.fees?.total,
      "Fee source": r.fees?.source,
      Profit: r.profit,
      "ROI %": r.roi,
      "Margin %": r.margin,
      "Hurdle price": r.hurdle_price,
      "Failed gate": r.failed_gate ? GATE_LABELS[r.failed_gate] : null,
      Why: r.status === "error" ? r.error : r.why,
      MOQ: r.offer?.moq,
      "Offers seen": r.offer_count,
      Source: r.offer?.source_ref,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Shortlist");
    XLSX.writeFile(wb, `wholesale-scout-${(run?.name || run?.source || "run").replace(/[^\w-]+/g, "_").slice(0, 40)}.xlsx`);
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">
            <EditableName value={run.name || run.source} inputClassName="text-lg font-semibold"
              onSave={async (name) => {
                await api(`/api/runs/${id}`, { method: "PATCH", json: { name } });
                setRun((r) => r && { ...r, name });
              }} />
          </h1>
          {run.name && run.name !== run.source && <p className="text-xs text-muted-foreground">{run.source}</p>}
          <p className="text-sm text-muted-foreground">
            {run.profile?.name ?? "Profile"}{profileVersion(run)} · started {when(run.started_at)} · {products.length || total} products ({total} listings) · {run.token_cost} Keepa tokens
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect className="w-60" value={rescreenProfile} onChange={(e) => setRescreenProfile(e.target.value)} aria-label="Profile to re-screen with">
            <NativeSelectOption value="">{run.profile?.name ?? "This run's profile"} (as saved now)</NativeSelectOption>
            {profiles.filter((p) => p.name !== run.profile?.name).map((p) => <NativeSelectOption key={p.id} value={p.id}>{p.name}</NativeSelectOption>)}
          </NativeSelect>
          <Button variant="outline" onClick={rescreen} disabled={rescreening || processing}
            title="Re-run gates and score with the profile's current settings, using the data already fetched. No re-upload, no new Amazon or Keepa calls.">
            {rescreening ? "Re-screening…" : "Re-screen"}
          </Button>
          <Button variant="outline" onClick={() => exportXlsx()} disabled={!rows.length}>Export {rows.length} products to xlsx</Button>
          <Button variant="destructive" onClick={async () => {
            if (!(await confirm({ title: "Delete this run?", description: "The run and its results are removed. Products, favourites and waivers are kept.", confirmLabel: "Delete", destructive: true }))) return;
            cancel.current();
            await api(`/api/runs/${id}`, { method: "DELETE" }).catch(() => {});
            router.push("/runs");
          }}>Delete</Button>
        </div>
      </div>

      {progress && !progress.done && (
        <div className="panel space-y-2 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="font-medium">
              {progress.rescreen?.left ? `Re-screening: ${(progress.total - progress.rescreen.left).toLocaleString("en-GB")} of ${progress.total.toLocaleString("en-GB")} rows` : `Screening ${progress.processed} of ${progress.total}`}
            </span>
            <span className="text-muted-foreground">
              {progress.working ? "Working in the background: you can close this page." : "Resuming…"}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-brand transition-all" style={{ width: `${progress.total ? ((progress.rescreen?.left ? progress.total - progress.rescreen.left : progress.processed) / progress.total) * 100 : 0}%` }} />
          </div>
          {progress.eta && <p className="text-sm font-medium" aria-live="polite">{etaLabel(progress.eta)[0].toUpperCase() + etaLabel(progress.eta).slice(1)}</p>}
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
            <span><span className="num font-semibold text-foreground">{progress.waiting.amazon}</span> waiting on Amazon (catalog, price, gating, fees)</span>
            <span>
              <span className="num font-semibold text-foreground">{progress.waiting.keepa}</span> waiting on Keepa tokens
              {progress.waiting.keepa > 0 && progress.keepaResumeAt && <> · resumes about {new Date(progress.keepaResumeAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</>}
            </span>
            <span><span className="num font-semibold text-foreground">{progress.tokenCost}</span> Keepa tokens so far</span>
          </div>
        </div>
      )}
      {error && <p className="rounded-md bg-fail-soft px-3 py-2 text-sm text-fail">{error}</p>}

      <BulkBar count={selected.size} stashed={stash?.size ?? 0}
        onReselect={() => { if (stash) setSelected(new Set([...stash].filter((x) => results.some((r) => r.id === x)))); setStash(null); }}
        onClear={() => { setSelected(new Set()); setStash(null); }}
        onStar={() => bulkStar("star")} onUnstar={() => bulkStar("unstar")}
        onWaive={(gate, reason) => bulkWaive(gate, "waive", reason)} onUnwaive={(gate) => bulkWaive(gate, "unwaive")}
        onRescreen={bulkRescreen} onExport={() => exportXlsx(selected)} onRemove={bulkRemove} />

      <FilterBar value={filters} onChange={setFilters} options={filterOptions} favouritesAvailable={favourites.size > 0}
        matching={rows.length} total={products.length} unit={`products (${listingCount} listings shown)`} gateLabels={GATE_LABELS} />

      <ResultsTable rows={displayRows} storageKey="ws.table.results.v1"
        selected={selected} onToggleSelect={(rid) => setSelected((s) => { const n = new Set(s); if (n.has(rid)) n.delete(rid); else n.add(rid); return n; })}
        visibleIds={visibleIds} onSelectAll={setSelected}
        expandedGroups={expanded} onToggleGroup={(k) => setExpanded((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; })}
        open={open} onToggleOpen={(rid) => setOpen((s) => { const n = new Set(s); if (n.has(rid)) n.delete(rid); else n.add(rid); return n; })}
        activeId={active?.id ?? null} onActivate={(rid) => setActiveId((cur) => (cur === rid ? null : rid))}
        favourites={favourites} onStar={toggleFavourite}
        sort={sort} onSort={(key) => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === "title" ? 1 : -1 }))}
        sparks={sparks} observeSparks={observeSparks}
        renderDetail={(r) => <Detail r={r} fav={favOf(r)} onNote={saveNote} onWaive={waive} budgetGbp={lineBudget} />}
        empty={done.length ? "Nothing matches these filters." : "Rows appear here as they're screened."} />

      {active && (
        <DetailDrawer r={active} index={activeIndex} count={displayRows.length} sparks={active.product?.asin ? sparks[active.product.asin] : null}
          onStep={step} onClose={closeDrawer}>
          <Detail r={active} fav={favOf(active)} onNote={saveNote} onWaive={waive} stacked budgetGbp={lineBudget} />
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
      <Skeleton className="h-28 rounded-xl" />
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
