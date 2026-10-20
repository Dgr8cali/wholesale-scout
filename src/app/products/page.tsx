"use client";

import { SearchIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { BulkBar } from "@/components/BulkBar";
import { RecordPurchaseDialog } from "@/components/product/RecordPurchaseDialog";
import { Detail } from "@/components/results/Detail";
import { DetailDrawer } from "@/components/results/DetailDrawer";
import { downloadXlsx, exportRows } from "@/components/results/exportXlsx";
import { ResultsFilterBar } from "@/components/results/ResultsFilterBar";
import { PAGE_SIZE, PHONE_PAGE_SIZE, ResultsTable, useIsPhone, type ResultRow } from "@/components/results/ResultsTable";
import { compareRows, nextResultSort } from "@/components/results/sort";
import type { Result, SortKey } from "@/components/results/types";
import { useResultActions } from "@/components/results/useResultActions";
import { useSparks } from "@/components/results/useSparks";
import { EmptyState, ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatusChip } from "@/components/ui/status-chip";
import { Toggle } from "@/components/ui/toggle";
import { filtersToQuery, isEmpty } from "@/lib/filters";
import { GATE_LABELS, withDefaults, type ProfileConfig } from "@/lib/screening/config";
import type { ProductListItem } from "@/lib/server/productPage";
import { api } from "@/lib/ui/client";
import { useUrlFilters } from "@/lib/ui/useUrlFilters";
import { TableSkeleton } from "@/components/ui/skeletons";

type Page = { items: ProductListItem[]; results: Record<string, Result>; more: boolean; suppliers: string[] };

/** A product whose latest result has gone (a run deleted since the brand map read it). */
function stub(i: ProductListItem): Result {
  return {
    id: `p:${i.asin}`, status: "done", verdict: null, failed_gate: null, gate_outcomes: [], fees: null, sell_price: i.sell_price, price_source: null,
    landed_cost: null, profit: null, roi: null, margin: null, hurdle_price: null, score: null, group_scores: null, why: null,
    band: null, offer_count: 0, error: null, inputs: null, updated_at: i.screened_at,
    product: { ean: i.ean, asin: i.asin, title: i.title, brand: i.brand, category: null, image_url: i.image_url }, offer: null,
  } as Result;
}

export default function ProductsPage() {
  return <Suspense fallback={<TableSkeleton rows={10} columns={8} />}><Products /></Suspense>;
}

/** Every product the app has screened: filter, open one in the drawer or on its page. */
function Products() {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [filters, setFilters] = useUrlFilters();
  const bought = params.get("bought") === "1";
  const phone = useIsPhone();
  const size = phone ? PHONE_PAGE_SIZE : PAGE_SIZE;
  const page = Math.max(0, Number(params.get("page")) || 0);
  const setPage = (n: number) => {
    const q = new URLSearchParams(params.toString());
    if (n) q.set("page", String(n)); else q.delete("page");
    router.replace(`${path}?${q}`, { scroll: false });
    window.scrollTo({ top: 0 });
  };
  const setBought = (on: boolean) => {
    const q = new URLSearchParams(params.toString());
    if (on) q.set("bought", "1"); else q.delete("bought");
    q.delete("page");
    router.replace(`${path}?${q}`, { scroll: false });
  };

  // The last answer and the query it answers: a different query showing means one is loading.
  const [answer, setAnswer] = useState<{ query: string; page: Page } | null>(null);
  const data = answer?.page ?? null;
  const [error, setError] = useState<string | null>(null);
  const query = useMemo(() => {
    const q = filtersToQuery(filters);
    q.set("page", String(page));
    q.set("size", String(size));
    if (bought) q.set("bought", "1");
    return q.toString();
  }, [filters, page, size, bought]);
  // Only the latest query's answer is shown (a phone first asks for 50, then 20, a page).
  const latest = useRef(query);
  useEffect(() => { latest.current = query; }, [query]);
  const load = useCallback(() => api<Page>(`/api/products?${query}`).then(
    (d) => { if (latest.current === query) { setAnswer({ query, page: d }); setError(null); } },
    (e: Error) => { if (latest.current === query) setError(e.message); },
  ), [query]);
  const loading = answer?.query !== query && !error;
  useEffect(() => { void load(); }, [load]);

  const [profiles, setProfiles] = useState<{ id: string; is_default: boolean; config: ProfileConfig }[]>([]);
  useEffect(() => { api<{ profiles: typeof profiles }>("/api/profiles").then((r) => setProfiles(r.profiles)).catch(() => {}); }, []);
  const cfg = useMemo(() => withDefaults(profiles.find((p) => p.is_default)?.config ?? null), [profiles]);
  const lineBudget = (cfg.budget * cfg.gates.budgetFit.maxLineSharePct) / 100;

  const acts = useResultActions({ onChanged: () => load() });
  const { sparks, observe: observeSparks } = useSparks();
  // The server's order (newest screening first) until a column is clicked; a sort orders the page shown.
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const shownSort = sort ?? { key: "screened" as SortKey, dir: -1 as const };

  const byResult = useMemo(() => new Map((data?.items ?? []).map((i) => [i.result_id ?? `p:${i.asin}`, i])), [data]);
  const rows = useMemo<ResultRow[]>(() => {
    const list = (data?.items ?? []).map((i) => ({
      r: (i.result_id && data!.results[i.result_id]) || stub(i),
      // The brand map's verdict (your default profile): Not scored when it was never priced.
      x: { decision: i.priced ? (i.verdict as Result["verdict"]) : null, maxLanded: i.max_landed, screenedAt: i.screened_at },
    }));
    return sort ? [...list].sort(compareRows(sort.key, sort.dir, lineBudget, sort.key === "rank90" || sort.key === "bb90" ? sparks : undefined)) : list;
  }, [data, sort, lineBudget, sparks]);
  const ids = useMemo(() => rows.map((d) => d.r.id), [rows]);

  // The selection can span pages: remember each selected row's result.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Map<string, Result>>(new Map());
  const select = (next: Set<string>) => {
    setSelected(next);
    setPicked((m) => {
      const n = new Map([...m].filter(([k]) => next.has(k)));
      for (const d of rows) if (next.has(d.r.id)) n.set(d.r.id, d.r);
      return n;
    });
  };
  const chosen = () => [...picked.values()].filter((r) => !r.id.startsWith("p:"));

  const [activeId, setActiveId] = useState<string | null>(null);
  const activeIndex = activeId ? rows.findIndex((d) => d.r.id === activeId) : -1;
  const active = activeIndex >= 0 ? rows[activeIndex].r : null;
  const step = useCallback((by: -1 | 1) => {
    const i = activeIndex + by;
    if (i >= 0 && i < rows.length) setActiveId(rows[i].r.id);
  }, [activeIndex, rows]);

  async function rescreen(rs: Result[]) {
    const resultIds = rs.map((r) => r.id).filter((x) => !x.startsWith("p:"));
    if (!resultIds.length) { toast.error("Nothing to re-screen: no result for these products"); return; }
    try {
      const r = await api<{ runId: string }>("/api/results/rescreen", { method: "POST", json: { resultIds, label: "Products re-screen" } });
      router.push(`/runs/${r.runId}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const filtered = !isEmpty(filters) || bought;
  const count = data && (
    <>
      Page <span className="num font-semibold">{page + 1}</span> · <span className="num">{data.items.length}</span> product{data.items.length === 1 ? "" : "s"}{data.more ? " (more on the next page)" : ""}
      {loading && <span className="text-muted-foreground"> · loading…</span>}
    </>
  );

  if (error && !data) return <ErrorState title="Couldn't load products" message={error} onRetry={load} />;
  return (
    <div className={active ? "space-y-4 transition-[margin] xl:mr-[27rem]" : "space-y-4"}>
      <PageHeader
        title="Products"
        crumbs={[{ label: "Wholesale", href: "/runs" }, { label: "Products" }]}
        subtitle="Every product the app has screened, newest first, with its latest verdict on your default profile."
        info={<p>Click a row for its details beside the list; the product page has the history, suppliers and purchases. The list comes {size} a page, newest screening first; a column sort orders the page shown. Profit, ROI, sales and BSR filters read each product&apos;s latest result, so they can take a moment.</p>}
        actions={<RecordPurchaseDialog />}
      />

      <BulkBar count={selected.size} stashed={0} onReselect={() => {}} onClear={() => select(new Set())}
        onStar={() => acts.bulkStar(chosen(), "star")} onUnstar={() => acts.bulkStar(chosen(), "unstar")}
        onRescreen={() => rescreen(chosen())}
        onExport={() => downloadXlsx(exportRows(chosen().map((r) => ({ r, listing: "product" })), lineBudget), "products")} />

      <ResultsFilterBar value={filters} onChange={setFilters} gateLabels={GATE_LABELS} count={count}
        options={{ brands: [], suppliers: data?.suppliers ?? [], gates: [] }} favouritesAvailable={acts.favourites.size > 0}
        extra={<Toggle size="sm" pressed={bought} onPressedChange={setBought} className="h-8 rounded-full bg-subtle px-3 text-xs font-medium text-muted-foreground data-[state=on]:bg-primary-soft data-[state=on]:text-primary-ink data-[state=on]:ring-1 data-[state=on]:ring-brand">Bought</Toggle>} />

      {!data ? <TableSkeleton rows={10} columns={8} /> : !rows.length && !filtered ? (
        <EmptyState icon={<SearchIcon />} title="No products yet" action={<Button variant="secondary" asChild><Link href="/new-run">New run</Link></Button>}>
          Products appear here once a run screens them.
        </EmptyState>
      ) : (
        <ResultsTable rows={rows} page="products" paging={{ kind: "server", page, more: data.more, onPage: setPage }}
          selected={selected} onSelect={select} visibleIds={ids}
          activeId={active?.id ?? null} onOpen={(id) => setActiveId((cur) => (cur === id ? null : id))}
          actions={{ starred: acts.starred, onStar: acts.toggleStar, onRescreen: (r) => rescreen([r]) }}
          sort={shownSort} onSort={(key) => setSort(nextResultSort(shownSort, key))}
          sparks={sparks} observeSparks={observeSparks}
          rowNote={(r) => byResult.get(r.id)?.bought ? <StatusChip tone="info" icon={false} className="mt-0.5 h-5 px-2">Bought</StatusChip> : null}
          empty={<>No products match these filters. A product the app hasn&apos;t seen can be checked on <Link className="link" href="/new-run?tab=check">New run → Check ASINs</Link>.</>}
          lineCapGbp={lineBudget} maxMonths={cfg.gates.demand.maxMonthsToSell} />
      )}

      {active && (
        <DetailDrawer r={active} index={activeIndex} count={rows.length} sparks={active.product?.asin ? sparks[active.product.asin] : null}
          onStep={step} onClose={() => setActiveId(null)}>
          {active.id.startsWith("p:") ? <p className="text-sm text-muted-foreground">Its latest result has gone (the run was deleted). Re-screen it from New run.</p> : (
            <Detail r={active} fav={acts.favOf(active)} onNote={acts.saveNote} onWaive={async (r, g, a, reason) => { await acts.waiveOne(r, g, a, reason); }}
              onWatch={acts.watch} onCost={(r, c) => acts.cost([r.id], c)} stacked budgetGbp={lineBudget} />
          )}
        </DetailDrawer>
      )}
    </div>
  );
}
