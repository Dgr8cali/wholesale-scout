"use client";

import { useParams, useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as XLSX from "xlsx";
import { GATE_LABELS, GATE_ORDER, GROUP_LABELS, type GateId, type GroupId } from "@/lib/screening/config";
import type { GateOutcome } from "@/lib/screening/gates";
import { api, gbp, pct, when } from "@/lib/ui/client";
import { EditableName } from "@/components/EditableName";
import { FilterBar, type FilterOptions } from "@/components/FilterBar";
import { EMPTY_FILTERS, matches, normalizeFilters, type FilterSet } from "@/lib/filters";
import { groupRows } from "@/lib/ui/group";
import { brandOf, favKey, toFilterRow } from "@/lib/ui/resultRows";
import { FavouriteNote, FavouriteStar } from "@/components/FavouriteStar";
import { RestrictionLink } from "@/lib/ui/RestrictionLink";
import { buyBox, estSales, sellers, type Figure, type StoredMarket } from "@/lib/ui/metrics";

interface Result {
  id: string;
  status: "pending" | "done" | "error";
  verdict: "pass" | "warn" | "fail" | null;
  failed_gate: GateId | null;
  gate_outcomes: GateOutcome[];
  fees: {
    source: string; referralCategory: string; referralPct: number; referral: number | null; fba: number | null;
    storage: number | null; returns: number | null; total: number | null; tier: string | null; fbaSource: string;
    dimsEstimated: boolean; outputVat: number | null; dimsSource?: "catalog" | "keepa" | null;
    compare?: {
      amazon: { referral: number | null; fba: number | null } | null;
      keepa: { referral: number | null; fba: number | null } | null;
      rateCard: { referral: number | null; fba: number | null; tier: string | null };
    };
  } | null;
  sell_price: number | null;
  price_source: string | null;
  landed_cost: number | null;
  profit: number | null;
  roi: number | null;
  margin: number | null;
  hurdle_price: number | null;
  score: number | null;
  group_scores: Record<GroupId, number | null> | null;
  why: string | null;
  band: "green" | "amber" | "grey" | null;
  offer_count: number;
  error: string | null;
  inputs: { market?: StoredMarket | null; sellers?: Seller[] | null; lookup?: { outcome: string; attempts: { identifiersType: string; code: string; items: number; total?: number; error?: string }[]; raw?: string } | null } | null;
  product: { ean: string; asin: string | null; title: string | null; brand: string | null; category: string | null } | null;
  offer: { unit_cost: number; currency: string; unit_cost_gbp: number; moq: number | null; pack_units: number; title: string | null; source_ref: string | null; supplier: { name: string } | null } | null;
}

interface Run {
  id: string; name?: string | null; source: string; status: string; started_at: string; finished_at: string | null;
  row_count: number; processed_count: number; token_cost: number; profile: { name: string } | null; error: string | null;
}

interface Seller {
  sellerId: string; sharePct: number; name: string | null; ratingPct: number | null; ratingCount: number | null;
  storefrontSize: number | null; brandSharePct: number | null;
}

interface Fav {
  id: string;
  ean: string;
  asin: string | null;
  note: string | null;
}

interface Progress {
  done: boolean;
  processed: number;
  total: number;
  waiting: { amazon: number; keepa: number };
  keepaResumeAt: string | null;
  working: boolean;
  tokenCost: number;
}

type SortKey = "score" | "profit" | "roi" | "margin" | "sell_price" | "landed_cost" | "hurdle_price" | "title" | "verdict" | "sales" | "sellers" | "buybox";

/** Figures computed from the stored market data, for display and sorting. */
const FIGURES = { sales: estSales, sellers, buybox: buyBox } as const;
const figure = (r: Result, k: keyof typeof FIGURES): Figure => FIGURES[k](r.inputs?.market);

const VERDICT_STYLE = { pass: "bg-pass-soft text-pass", warn: "bg-warn-soft text-warn", fail: "bg-fail-soft text-fail" } as const;
const BAND_STYLE = { green: "bg-pass text-white", amber: "bg-warn text-white", grey: "bg-surface-2 text-muted" } as const;
const STATUS_ICON: Record<string, string> = { pass: "✓", warn: "!", fail: "✕", skipped: "–", off: "·" };
const STATUS_STYLE: Record<string, string> = { pass: "bg-pass", warn: "bg-warn", fail: "bg-fail", skipped: "bg-muted", off: "bg-line" };

/** Compact numeric cell: tabular figures, never wrapped, clipped rather than widening the table. */
const NUM = "num overflow-hidden px-2 py-2 text-right text-[13px] whitespace-nowrap text-ellipsis";

const titleOf = (r: Result) => r.product?.title ?? r.offer?.title ?? r.product?.ean ?? "";
const eanOf = (r: Result) => r.product?.ean ?? r.id;

export default function RunPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [run, setRun] = useState<Run | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const processing = !!progress && !progress.done;
  const [open, setOpen] = useState<Set<string>>(new Set());
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
  const setFilters = (f: FilterSet) => {
    setFiltersState(f);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(f));
    } catch {
      // Private window or storage blocked: the filters just won't be remembered.
    }
  };
  // Favourites are per product (EAN + ASIN), not per run.
  const [favs, setFavs] = useState<Map<string, Fav>>(new Map());
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
      setError((e as Error).message);
    }
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
      setError((e as Error).message);
    }
  }
  const [profiles, setProfiles] = useState<{ id: string; name: string }[]>([]);
  const [rescreenProfile, setRescreenProfile] = useState("");
  const [rescreening, setRescreening] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
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
    cancel.current = () => {
      stopped = true;
    };
    const tick = async () => {
      try {
        const p = await api<Progress>(`/api/runs/${id}/progress`);
        if (stopped) return;
        setProgress(p);
        const changed = p.processed !== lastProcessed;
        if (lastProcessed === -1 || (changed && Date.now() - lastReload > 4_000) || (p.done && changed)) {
          lastProcessed = p.processed;
          lastReload = Date.now();
          apply(await fetchRun());
        }
        // Never overlap our own call; a worker holding the lease shows as working.
        if (!p.done && !p.working && !kicking && Date.now() - lastKick > 15_000) {
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
    setNotice(null);
    try {
      cancel.current();
      const r = await api<{ rescored: number; requeued: number }>(`/api/runs/${id}/rescreen`, {
        method: "POST",
        json: { profileId: rescreenProfile || undefined },
      });
      setNotice(
        `Re-screened ${r.rescored} rows from stored data` +
          (r.requeued ? `; ${r.requeued} need data they never fetched and are being looked up now.` : "."),
      );
      setNonce((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
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
        : sort.key === "sales" || sort.key === "sellers" || sort.key === "buybox" ? figure(r, sort.key).value
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
      },
    };
  }, [done, products, failedGates]);

  function exportXlsx() {
    const flat = rows.flatMap((g) => [{ r: g.lead, listing: g.others.length ? "best" : "only" }, ...g.others.map((r) => ({ r, listing: "alternative" }))]);
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

  const th = (key: SortKey, label: ReactNode, right = false, hint?: string) => (
    <th className={`sticky-th overflow-hidden px-2 py-2 align-bottom leading-tight ${right ? "text-right" : ""}`} title={hint}>
      <button className={`uppercase hover:text-ink ${right ? "text-right tracking-normal" : "text-left tracking-wide"}`}
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === "title" ? 1 : -1 }))}>
        {label}{sort.key === key ? (sort.dir === -1 ? " ↓" : " ↑") : ""}
      </button>
    </th>
  );

  if (error && !run) return <p className="rounded-md bg-fail-soft px-3 py-2 text-sm text-fail">{error}</p>;
  if (!run) return <p className="text-sm text-muted">Loading…</p>;

  const total = Math.max(run.row_count, results.length);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="h1">
            <EditableName value={run.name || run.source} inputClassName="text-lg font-semibold"
              onSave={async (name) => {
                await api(`/api/runs/${id}`, { method: "PATCH", json: { name } });
                setRun((r) => r && { ...r, name });
              }} />
          </h1>
          {run.name && run.name !== run.source && <p className="text-xs text-muted">{run.source}</p>}
          <p className="text-sm text-muted">
            {run.profile?.name ?? "Profile"} · started {when(run.started_at)} · {products.length || total} products ({total} listings) · {run.token_cost} Keepa tokens
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input w-48" value={rescreenProfile} onChange={(e) => setRescreenProfile(e.target.value)} aria-label="Profile to re-screen with">
            <option value="">{run.profile?.name ?? "This run's profile"} (as saved now)</option>
            {profiles.filter((p) => p.name !== run.profile?.name).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="btn" onClick={rescreen} disabled={rescreening || processing}
            title="Re-run gates and score with the profile's current settings, using the data already fetched. No re-upload, no new Amazon or Keepa calls.">
            {rescreening ? "Re-screening…" : "Re-screen"}
          </button>
          <button className="btn" onClick={exportXlsx} disabled={!rows.length}>Export {rows.length} products to xlsx</button>
          <button className="btn text-fail" onClick={async () => {
            if (!confirm("Delete this run and its results?")) return;
            cancel.current();
            await api(`/api/runs/${id}`, { method: "DELETE" }).catch(() => {});
            router.push("/");
          }}>Delete</button>
        </div>
      </div>

      {progress && !progress.done && (
        <div className="card space-y-2 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="font-medium">Screening {progress.processed} of {progress.total}</span>
            <span className="text-muted">
              {progress.working ? "Working in the background: you can close this page." : "Resuming…"}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full bg-accent transition-all" style={{ width: `${progress.total ? (progress.processed / progress.total) * 100 : 0}%` }} />
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
            <span><span className="num font-semibold text-ink">{progress.waiting.amazon}</span> waiting on Amazon (catalog, price, gating, fees)</span>
            <span>
              <span className="num font-semibold text-ink">{progress.waiting.keepa}</span> waiting on Keepa tokens
              {progress.waiting.keepa > 0 && progress.keepaResumeAt && <> · resumes about {new Date(progress.keepaResumeAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</>}
            </span>
            <span><span className="num font-semibold text-ink">{progress.tokenCost}</span> Keepa tokens so far</span>
          </div>
        </div>
      )}
      {error && <p className="rounded-md bg-fail-soft px-3 py-2 text-sm text-fail">{error}</p>}
      {notice && <p className="rounded-md bg-accent-soft px-3 py-2 text-sm">{notice}</p>}

      <FilterBar value={filters} onChange={setFilters} options={filterOptions} favouritesAvailable={favourites.size > 0}
        matching={rows.length} total={products.length} unit={`products (${listingCount} listings shown)`} gateLabels={GATE_LABELS} />

      {/* Fixed layout: numeric columns compact, product capped, why takes the rest and wraps.
          Scrolls sideways inside the card only below the table's minimum width. */}
      <div className="table-wrap">
      <div className="card table-scroll" data-min="70">
        <table className="w-full min-w-[70rem] table-fixed text-sm">
          <colgroup>
            <col className="w-[5.5rem]" />{/* star + verdict */}
            <col className="w-[3.25rem]" />{/* score */}
            <col className="w-[13rem]" />{/* product */}
            <col className="w-[4rem]" />{/* sales */}
            <col className="w-[4.25rem]" />{/* sellers */}
            <col className="w-[4.25rem]" />{/* buy box */}
            <col className="w-[4.25rem]" />{/* landed */}
            <col className="w-[4.25rem]" />{/* sell */}
            <col className="w-[4.25rem]" />{/* profit */}
            <col className="w-[3.5rem]" />{/* roi */}
            <col className="w-[3.75rem]" />{/* margin */}
            <col className="w-[4.25rem]" />{/* hurdle */}
            <col />{/* why: the rest */}
          </colgroup>
          <thead className="text-left text-xs text-muted">
            <tr>
              {th("verdict", "Verdict")}
              {th("score", "Score", true)}
              {th("title", "Product")}
              {th("sales", <>Sales<br />/ mo</>, true, "Est. sales / month")}
              {th("sellers", "Sellers", true)}
              {th("buybox", "Buy Box", true)}
              {th("landed_cost", "Landed", true)}
              {th("sell_price", "Sell", true)}
              {th("profit", "Profit", true)}
              {th("roi", "ROI", true)}
              {th("margin", "Margin", true)}
              {th("hurdle_price", "Hurdle", true)}
              <th className="sticky-th px-2 py-2 align-bottom uppercase tracking-wide">Why</th>
            </tr>
          </thead>
          <tbody>
            {rows.flatMap((g) => {
              const showOthers = expanded.has(g.key);
              return [g.lead, ...(showOthers ? g.others : [])].map((r, i) => ({ r, g, alt: i > 0 }));
            }).map(({ r, g, alt }) => {
              const isOpen = open.has(r.id);
              return (
                <Fragment key={r.id}>
                  <tr className={`cursor-pointer border-b border-line align-top hover:bg-surface-2 ${alt ? "bg-surface-2/40 text-muted" : ""}`}
                    onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })}>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1.5">
                        {r.product
                          ? <FavouriteStar starred={favourites.has(favKey(r.product.ean, r.product.asin))} onToggle={() => toggleFavourite(r)} />
                          : <span className="w-4 flex-none" />}
                        {r.status === "error"
                          ? <span className="rounded-full bg-fail-soft px-2 py-0.5 text-xs font-semibold text-fail">error</span>
                          : r.verdict && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${VERDICT_STYLE[r.verdict]}`}>{r.verdict}</span>}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right">
                      {r.score != null && r.band
                        ? <span className={`num inline-block min-w-9 rounded px-1.5 py-0.5 text-center text-xs font-semibold ${BAND_STYLE[r.band]}`}>{Math.round(r.score)}</span>
                        : <span className="text-muted">—</span>}
                    </td>
                    <td className={`px-2 py-2 ${alt ? "pl-6" : ""}`}>
                      <div className="line-clamp-2 min-w-0 font-medium leading-snug break-words" title={titleOf(r)}>{alt ? "↳ " : ""}{titleOf(r)}</div>
                      <div className="num truncate text-xs text-muted">
                        {r.product?.ean}
                        {r.product?.asin && <> · <a className="text-accent hover:underline" href={`https://www.amazon.co.uk/dp/${r.product.asin}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{r.product.asin}</a></>}
                        {r.offer?.supplier && <> · {r.offer.supplier.name}{r.offer_count > 1 ? ` (+${r.offer_count - 1})` : ""}</>}
                      </div>
                      {!alt && g.others.length > 0 && (
                        <button className="mt-1 text-xs font-medium text-accent hover:underline"
                          onClick={(e) => { e.stopPropagation(); setExpanded((s) => { const n = new Set(s); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; }); }}>
                          {expanded.has(g.key) ? "▾ Hide" : "▸"} {g.others.length} other ASIN{g.others.length > 1 ? "s" : ""} for this EAN
                        </button>
                      )}
                    </td>
                    <FigureCell f={figure(r, "sales")} />
                    <FigureCell f={figure(r, "sellers")} />
                    <FigureCell f={figure(r, "buybox")} money />
                    <td className={NUM}>{gbp(r.landed_cost)}</td>
                    <td className={NUM}>{gbp(r.sell_price)}</td>
                    <td className={`${NUM} ${r.profit != null && r.profit < 0 ? "text-fail" : ""}`}>{gbp(r.profit)}</td>
                    <td className={NUM}>{pct(r.roi)}</td>
                    <td className={NUM}>{pct(r.margin)}</td>
                    <td className={NUM}>{gbp(r.hurdle_price)}</td>
                    <td className="px-2 py-2 text-xs leading-snug [overflow-wrap:anywhere]">
                      {r.status === "error" ? r.error : r.why}
                      <RestrictionLink outcomes={r.gate_outcomes} asin={r.product?.asin} />
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-line bg-surface-2/50">
                      <td colSpan={13} className="px-4 py-3">
                        <Detail r={r} fav={r.product ? favs.get(favKey(r.product.ean, r.product.asin)) : undefined} onNote={saveNote} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!rows.length && (
              <tr><td colSpan={13} className="px-4 py-8 text-center text-sm text-muted">{done.length ? "Nothing matches these filters." : "Rows appear here as they're screened."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  );
}

/** Referral and FBA fee from each source, ex-VAT and ex-DSF, at the scoring price. */
function FeeCompare({ c, dimsSource }: { c: NonNullable<NonNullable<Result["fees"]>["compare"]>; dimsSource?: string | null }) {
  const rows: [string, { referral: number | null; fba: number | null } | null][] = [
    ["Amazon (SP-API)", c.amazon],
    ["Keepa", c.keepa],
    [`Rate card${c.rateCard.tier ? ` (${c.rateCard.tier})` : ""}`, c.rateCard],
  ];
  return (
    <div className="mt-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Fees by source (ex-VAT)</p>
      <table className="num w-full text-xs">
        <thead className="text-muted"><tr><th className="text-left font-normal">Source</th><th className="text-right font-normal">Referral</th><th className="text-right font-normal">FBA</th></tr></thead>
        <tbody>
          {rows.map(([label, v]) => (
            <tr key={label}>
              <td className="pr-2">{label}</td>
              <td className="text-right">{v?.referral != null ? gbp(v.referral) : <span className="text-muted">—</span>}</td>
              <td className="text-right">{v?.fba != null ? gbp(v.fba) : <span className="text-muted">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {dimsSource === "keepa" && <p className="mt-1 text-xs text-muted">Size from Keepa (no catalog dimensions).</p>}
    </div>
  );
}

/** Top Buy Box sellers over 365 days, with their Keepa profiles. */
function Sellers({ sellers, flaggedText }: { sellers: Seller[]; flaggedText: string }) {
  const flagged = (s: Seller) => flaggedText.includes(`likely brand distributor: ${s.name ?? s.sellerId} `);
  return (
    <div className="mt-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Top Buy Box sellers (365 days)</p>
      <ul className="space-y-1 text-xs">
        {sellers.map((s) => (
          <li key={s.sellerId}>
            <a className="font-medium text-accent hover:underline" href={`https://www.amazon.co.uk/sp?seller=${s.sellerId}`} target="_blank" rel="noreferrer">{s.name ?? s.sellerId}</a>
            <span className="text-muted"> · {s.sharePct}% of Buy Box</span>
            {s.ratingPct != null && <span className="text-muted"> · {s.ratingPct}% of {s.ratingCount?.toLocaleString("en-GB")} ratings</span>}
            {s.storefrontSize != null && <span className="text-muted"> · {s.storefrontSize.toLocaleString("en-GB")} listings</span>}
            {s.brandSharePct != null && (
              <span className={flagged(s) ? "font-semibold text-warn" : "text-muted"}> · {s.brandSharePct}% this brand{flagged(s) ? " (likely distributor)" : ""}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A number with its source as a tooltip; "—" when there's nothing to show. */
function FigureCell({ f, money }: { f: Figure; money?: boolean }) {
  return (
    <td className={NUM} title={f.note}>
      {f.value == null ? <span className="text-muted">—</span> : money ? gbp(f.value) : Math.round(f.value).toLocaleString("en-GB")}
    </td>
  );
}

function Detail({ r, fav, onNote }: { r: Result; fav?: Fav; onNote: (r: Result, f: Fav | undefined, note: string) => void }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr_1fr]">
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Gates</p>
        <ul className="space-y-1">
          {r.gate_outcomes.map((g) => (
            <li key={g.gate} className="flex gap-2 text-xs">
              <span className={`flex h-4 w-4 flex-none items-center justify-center rounded-full text-[10px] font-bold text-white ${STATUS_STYLE[g.status]}`}>{STATUS_ICON[g.status]}</span>
              <span className="w-40 flex-none font-medium">{g.label}</span>
              <span className="text-muted">{g.detail}{g.gate === "gating" && <RestrictionLink outcomes={r.gate_outcomes} asin={r.product?.asin} />}</span>
            </li>
          ))}
          {r.failed_gate && <li className="text-xs text-muted">Stopped at {GATE_LABELS[r.failed_gate]}; later gates didn&apos;t run.</li>}
        </ul>
        {r.inputs?.lookup && r.inputs.lookup.outcome !== "matched" && (
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-muted">
              Catalog lookup: {r.inputs.lookup.outcome === "search_miss" ? "search miss (Amazon answered, no items)" : "API error"}
            </summary>
            <ul className="num mt-1 space-y-0.5">
              {r.inputs.lookup.attempts.map((a, i) => (
                <li key={i}>{a.identifiersType} {a.code}: {a.error ? <span className="text-fail">{a.error}</span> : `${a.items} item${a.items === 1 ? "" : "s"}${a.total != null ? ` of ${a.total} results` : ""}`}</li>
              ))}
            </ul>
            {r.inputs.lookup.raw && <pre className="num mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-surface p-2">{r.inputs.lookup.raw}</pre>}
          </details>
        )}
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Per unit at {gbp(r.sell_price)}</p>
        {r.fees ? (
          <dl className="num grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-xs">
            <dt>Referral ({r.fees.referralPct}%, {r.fees.referralCategory})</dt><dd className="text-right">{gbp(r.fees.referral)}</dd>
            <dt>FBA ({r.fees.tier ?? "?"}, {r.fees.fbaSource})</dt><dd className="text-right">{gbp(r.fees.fba)}</dd>
            <dt>Storage</dt><dd className="text-right">{gbp(r.fees.storage)}</dd>
            <dt>Returns allowance</dt><dd className="text-right">{gbp(r.fees.returns)}</dd>
            {r.fees.outputVat ? <><dt>Output VAT</dt><dd className="text-right">{gbp(r.fees.outputVat)}</dd></> : null}
            <dt>Landed cost</dt><dd className="text-right">{gbp(r.landed_cost)}</dd>
            <dt className="font-semibold">Profit</dt><dd className="text-right font-semibold">{gbp(r.profit)}</dd>
            <dt className="col-span-2 mt-1 text-muted">
              {r.fees.source === "amazon" ? "Referral and FBA from Amazon's fee estimate" : "Fees from the rate card"}; DSF and VAT on fees included{r.fees.dimsEstimated ? "; size assumed (no dimensions)" : ""}. Price: {r.price_source}.
            </dt>
          </dl>
        ) : (
          <p className="text-xs text-muted">No sell price yet.{r.hurdle_price != null ? ` Clears the floors at ${gbp(r.hurdle_price)}.` : ""}</p>
        )}
        {r.fees?.compare && <FeeCompare c={r.fees.compare} dimsSource={r.fees.dimsSource} />}
        {r.offer && (
          <p className="mt-2 text-xs text-muted">
            Quoted {r.offer.unit_cost} {r.offer.currency}/unit → {gbp(r.offer.unit_cost_gbp)} ex-VAT · MOQ {r.offer.moq ?? "—"} · {r.offer.source_ref}
          </p>
        )}
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Score groups</p>
        {r.group_scores ? (
          <ul className="space-y-1">
            {(Object.keys(GROUP_LABELS) as GroupId[]).map((g) => {
              const v = r.group_scores![g];
              return (
                <li key={g} className="flex items-center gap-2 text-xs">
                  <span className="w-20">{GROUP_LABELS[g]}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
                    {v != null && <span className="block h-full rounded-full bg-accent" style={{ width: `${v}%` }} />}
                  </span>
                  <span className="num w-7 text-right">{v ?? "—"}</span>
                </li>
              );
            })}
          </ul>
        ) : <p className="text-xs text-muted">Not scored.</p>}
        {r.product && (
          <div className="mt-3">
            <FavouriteNote note={fav?.note ?? null} starred={!!fav} onSave={(note) => onNote(r, fav, note)} />
          </div>
        )}
        {r.inputs?.sellers && r.inputs.sellers.length > 0 && (
          <Sellers sellers={r.inputs.sellers} flaggedText={r.gate_outcomes.find((g) => g.tags?.includes("BRAND_DISTRIBUTOR"))?.detail ?? ""} />
        )}
      </div>
    </div>
  );
}
