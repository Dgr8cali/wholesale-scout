"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import * as XLSX from "xlsx";
import { FavouriteNote, FavouriteStar } from "@/components/FavouriteStar";
import { FilterBar, type FilterOptions } from "@/components/FilterBar";
import { EMPTY_FILTERS, matches, normalizeFilters, type FilterRow, type FilterSet } from "@/lib/filters";
import { GATE_LABELS } from "@/lib/screening/config";
import { api, gbp, pct, when } from "@/lib/ui/client";
import { estSales } from "@/lib/ui/metrics";
import { brandOf, toFilterRow, type ResultLike } from "@/lib/ui/resultRows";

interface Latest extends ResultLike {
  id: string;
  score: number | null;
  landed_cost: number | null;
  updated_at: string;
  offer: ResultLike["offer"] & { unit_cost_gbp?: number };
  run: { id: string; name: string; source: string } | null;
}

interface Item {
  favourite: { id: string; ean: string; asin: string | null; note: string | null; created_at: string };
  latest: Latest | null;
  outdated: boolean;
}

type SortKey = "score" | "profit" | "roi" | "sales" | "landed" | "screened" | "title";

const VERDICT_STYLE = { pass: "bg-pass-soft text-pass", warn: "bg-warn-soft text-warn", fail: "bg-fail-soft text-fail" } as const;
const BAND_STYLE = { green: "bg-pass text-white", amber: "bg-warn text-white", grey: "bg-surface-2 text-muted" } as const;
const STORAGE_KEY = "ws.filters.favourites";

const titleOf = (i: Item) => i.latest?.product?.title ?? i.latest?.offer?.title ?? i.favourite.ean;

/** A favourite never screened to completion still filters by its text. */
function filterRow(i: Item): FilterRow {
  if (i.latest) return toFilterRow(i.latest, new Set());
  return {
    verdict: null, band: null, failedGate: null, brand: null, supplier: null, amazon: null, approval: null, favourite: true,
    values: { sales: null, sellers: null, profit: null, roi: null, margin: null, sell: null },
    text: [i.favourite.ean, i.favourite.asin, i.favourite.note].filter(Boolean).join(" "),
  };
}

export default function FavouritesPage() {
  const router = useRouter();
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<{ id: string; name: string; is_default: boolean }[]>([]);
  const [profileId, setProfileId] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "score", dir: -1 });
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
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(f));
    } catch {
      // Not remembered in this browser; the filters still apply.
    }
  };

  useEffect(() => {
    api<{ items: Item[]; unavailable?: string }>("/api/favourites")
      .then((r) => {
        setItems(r.items);
        if (r.unavailable) setNote(r.unavailable);
      })
      .catch((e) => setError(e.message));
    api<{ profiles: { id: string; name: string; is_default: boolean }[] }>("/api/profiles")
      .then((r) => setProfiles(r.profiles))
      .catch(() => {});
  }, []);

  const all = useMemo(() => items ?? [], [items]);
  const rows = useMemo(() => {
    const val = (i: Item): number | string | null => {
      const l = i.latest;
      switch (sort.key) {
        case "title": return titleOf(i).toLowerCase();
        case "sales": return estSales(l?.inputs?.market).value;
        case "landed": return l?.landed_cost ?? null;
        case "screened": return l?.updated_at ?? null;
        default: return (l?.[sort.key] as number | null | undefined) ?? null;
      }
    };
    return all.filter((i) => matches(filterRow(i), filters)).sort((a, b) => {
      const x = val(a), y = val(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [all, filters, sort]);

  const options = useMemo<FilterOptions>(() => {
    const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b));
    const latest = all.map((i) => i.latest).filter((l): l is Latest => !!l);
    const gates = new Map<string, number>();
    for (const l of latest) if (l.failed_gate) gates.set(l.failed_gate, (gates.get(l.failed_gate) ?? 0) + 1);
    return {
      brands: uniq(latest.map(brandOf)),
      suppliers: uniq(latest.map((l) => l.offer?.supplier?.name)),
      gates: [...gates].map(([id, count]) => ({ id, label: GATE_LABELS[id as keyof typeof GATE_LABELS] ?? id, count })),
      verdictCounts: {
        pass: latest.filter((l) => l.verdict === "pass").length,
        warn: latest.filter((l) => l.verdict === "warn").length,
        fail: latest.filter((l) => l.verdict === "fail").length,
      },
    };
  }, [all]);

  async function unstar(i: Item) {
    try {
      await api(`/api/favourites?id=${i.favourite.id}`, { method: "DELETE" });
      setItems((xs) => xs && xs.filter((x) => x.favourite.id !== i.favourite.id));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function saveNote(i: Item, text: string) {
    try {
      await api("/api/favourites", { method: "PATCH", json: { id: i.favourite.id, note: text } });
      setItems((xs) => xs && xs.map((x) => (x.favourite.id === i.favourite.id ? { ...x, favourite: { ...x.favourite, note: text } } : x)));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function rescreen() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ runId: string; count: number; skipped: number }>("/api/favourites/rescreen", { method: "POST", json: { profileId: profileId || undefined } });
      router.push(`/runs/${r.runId}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  function exportXlsx() {
    const data = rows.map((i) => {
      const l = i.latest;
      return {
        Favourite: titleOf(i),
        EAN: i.favourite.ean,
        ASIN: i.favourite.asin,
        Note: i.favourite.note,
        Verdict: l?.status === "error" ? "error" : l?.verdict ?? null,
        Score: l?.score ?? null,
        Profit: l?.profit ?? null,
        "ROI %": l?.roi ?? null,
        "Est. sales / month": estSales(l?.inputs?.market).value,
        Supplier: l?.offer?.supplier?.name ?? null,
        "Landed cost": l?.landed_cost ?? null,
        "Last screened": l?.updated_at ?? null,
        Run: l?.run?.name ?? null,
        Outdated: i.outdated ? "yes" : "no",
        Why: l?.why ?? null,
      };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Favourites");
    XLSX.writeFile(wb, `wholesale-scout-favourites-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const th = (key: SortKey | null, label: ReactNode, right = false) => (
    <th className={`sticky-th px-2 py-2 align-bottom leading-tight ${right ? "text-right" : ""}`}>
      {key ? (
        <button className={`uppercase hover:text-ink ${right ? "tracking-normal" : "tracking-wide"}`}
          onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === "title" ? 1 : -1 }))}>
          {label}{sort.key === key ? (sort.dir === -1 ? " ↓" : " ↑") : ""}
        </button>
      ) : <span className="uppercase tracking-wide">{label}</span>}
    </th>
  );

  if (error && !items) return <p className="rounded-md bg-fail-soft px-3 py-2 text-sm text-fail">{error}</p>;
  if (!items) return <p className="text-sm text-muted">Loading…</p>;
  const outdated = all.filter((i) => i.outdated).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="h1">Favourites</h1>
          <p className="text-sm text-muted">
            {all.length} product{all.length === 1 ? "" : "s"}, each with its latest result from any run
            {outdated > 0 && <> · <span className="text-warn">{outdated} outdated</span> (over 7 days old)</>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input w-44" value={profileId} onChange={(e) => setProfileId(e.target.value)} aria-label="Profile to re-screen with">
            <option value="">Default profile</option>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="btn btn-primary" onClick={rescreen} disabled={busy || !all.length}
            title="New run with only these favourites, named 'Favourites <date>'">
            {busy ? "Starting…" : "Re-screen favourites"}
          </button>
          <button className="btn" onClick={exportXlsx} disabled={!rows.length}>Export {rows.length} to xlsx</button>
        </div>
      </div>
      {note && <p className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">{note}</p>}
      {error && <p className="rounded-md bg-fail-soft px-3 py-2 text-sm text-fail">{error}</p>}

      {!all.length ? (
        <div className="card px-6 py-10 text-center">
          <p className="h2">No favourites yet</p>
          <p className="mt-1 text-sm text-muted">Star a product on any run&apos;s results to keep it here.</p>
        </div>
      ) : (
        <>
          <FilterBar value={filters} onChange={setFilters} options={options} favouritesAvailable={false}
            matching={rows.length} total={all.length} unit="favourites" gateLabels={GATE_LABELS} />
          <div className="table-wrap">
          <div className="card table-scroll" data-min="62">
            <table className="w-full min-w-[62rem] table-fixed text-sm">
              <colgroup>
                <col className="w-[5.5rem]" />
                <col className="w-[3.25rem]" />
                <col className="w-[15.5rem]" />
                <col className="w-[8rem]" />
                <col className="w-[4.5rem]" />
                <col className="w-[4.5rem]" />
                <col className="w-[3.75rem]" />
                <col className="w-[4.25rem]" />
                <col />
              </colgroup>
              <thead className="text-left text-xs text-muted">
                <tr>
                  {th(null, "Verdict")}
                  {th("score", "Score", true)}
                  {th("title", "Product")}
                  {th(null, "Supplier")}
                  {th("landed", "Landed", true)}
                  {th("profit", "Profit", true)}
                  {th("roi", "ROI", true)}
                  {th("sales", <>Sales<br />/ mo</>, true)}
                  {th("screened", "Last screened")}
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => {
                  const l = i.latest;
                  const s = estSales(l?.inputs?.market);
                  const isOpen = open.has(i.favourite.id);
                  return [
                    <tr key={i.favourite.id} className="cursor-pointer border-b border-line align-top hover:bg-surface-2"
                      onClick={() => setOpen((x) => { const n = new Set(x); if (n.has(i.favourite.id)) n.delete(i.favourite.id); else n.add(i.favourite.id); return n; })}>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1.5">
                        <FavouriteStar starred onToggle={() => unstar(i)} />
                        {l?.status === "error" ? <span className="rounded-full bg-fail-soft px-2 py-0.5 text-xs font-semibold text-fail">error</span>
                          : l?.verdict ? <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${VERDICT_STYLE[l.verdict]}`}>{l.verdict}</span>
                          : <span className="text-xs text-muted">—</span>}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right">
                        {l?.score != null && l.band
                          ? <span className={`num inline-block min-w-9 rounded px-1.5 py-0.5 text-center text-xs font-semibold ${BAND_STYLE[l.band as keyof typeof BAND_STYLE]}`}>{Math.round(l.score)}</span>
                          : <span className="text-muted">—</span>}
                      </td>
                      <td className="px-2 py-2">
                        <div className="line-clamp-2 min-w-0 font-medium leading-snug break-words" title={titleOf(i)}>{titleOf(i)}</div>
                        <div className="num truncate text-xs text-muted">
                          {i.favourite.ean}
                          {i.favourite.asin && <> · <a className="text-accent hover:underline" href={`https://www.amazon.co.uk/dp/${i.favourite.asin}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{i.favourite.asin}</a></>}
                        </div>
                        {i.favourite.note && <div className="line-clamp-1 text-xs italic text-muted" title={i.favourite.note}>{i.favourite.note}</div>}
                      </td>
                      <td className="truncate px-2 py-2 text-xs" title={l?.offer?.supplier?.name ?? ""}>{l?.offer?.supplier?.name ?? "—"}</td>
                      <td className="num px-2 py-2 text-right text-[13px]">{gbp(l?.landed_cost)}</td>
                      <td className={`num px-2 py-2 text-right text-[13px] ${l?.profit != null && l.profit < 0 ? "text-fail" : ""}`}>{gbp(l?.profit)}</td>
                      <td className="num px-2 py-2 text-right text-[13px]">{pct(l?.roi)}</td>
                      <td className="num px-2 py-2 text-right text-[13px]" title={s.note}>{s.value == null ? <span className="text-muted">—</span> : Math.round(s.value).toLocaleString("en-GB")}</td>
                      <td className="px-2 py-2 text-xs">
                        {l ? (
                          <>
                            <span>{when(l.updated_at)}</span>
                            {i.outdated && <span className="ml-1.5 rounded bg-warn-soft px-1.5 py-0.5 text-[11px] font-semibold text-warn">outdated</span>}
                            {l.run && <div className="truncate"><Link className="text-accent hover:underline" href={`/runs/${l.run.id}`} onClick={(e) => e.stopPropagation()}>{l.run.name}</Link></div>}
                          </>
                        ) : <span className="text-warn">Not screened yet</span>}
                      </td>
                    </tr>,
                    isOpen && (
                      <tr key={`${i.favourite.id}-d`} className="border-b border-line bg-surface-2/50">
                        <td colSpan={9} className="px-4 py-3">
                          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
                            <p className="text-xs leading-snug">{l?.status === "error" ? l.error : l?.why ?? "No result yet: re-screen favourites to screen it."}</p>
                            <FavouriteNote note={i.favourite.note} onSave={(t) => saveNote(i, t)} />
                          </div>
                        </td>
                      </tr>
                    ),
                  ];
                })}
                {!rows.length && <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-muted">Nothing matches these filters.</td></tr>}
              </tbody>
            </table>
          </div>
          </div>
        </>
      )}
    </div>
  );
}
