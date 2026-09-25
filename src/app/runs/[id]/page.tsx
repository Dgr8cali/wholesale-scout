"use client";

import { useParams, useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { GATE_LABELS, GATE_ORDER, GROUP_LABELS, type GateId, type GroupId } from "@/lib/screening/config";
import type { GateOutcome } from "@/lib/screening/gates";
import { api, gbp, pct, when } from "@/lib/ui/client";

interface Result {
  id: string;
  status: "pending" | "done" | "error";
  verdict: "pass" | "warn" | "fail" | null;
  failed_gate: GateId | null;
  gate_outcomes: GateOutcome[];
  fees: {
    source: string; referralCategory: string; referralPct: number; referral: number | null; fba: number | null;
    storage: number | null; returns: number | null; total: number | null; tier: string | null; fbaSource: string;
    dimsEstimated: boolean; outputVat: number | null;
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
  product: { ean: string; asin: string | null; title: string | null; brand: string | null; category: string | null } | null;
  offer: { unit_cost: number; currency: string; unit_cost_gbp: number; moq: number | null; pack_units: number; title: string | null; source_ref: string | null; supplier: { name: string } | null } | null;
}

interface Run {
  id: string; source: string; status: string; started_at: string; finished_at: string | null;
  row_count: number; processed_count: number; token_cost: number; profile: { name: string } | null; error: string | null;
}

type SortKey = "score" | "profit" | "roi" | "margin" | "sell_price" | "landed_cost" | "hurdle_price" | "title" | "verdict";

const VERDICT_STYLE = { pass: "bg-pass-soft text-pass", warn: "bg-warn-soft text-warn", fail: "bg-fail-soft text-fail" } as const;
const BAND_STYLE = { green: "bg-pass text-white", amber: "bg-warn text-white", grey: "bg-surface-2 text-muted" } as const;
const STATUS_ICON: Record<string, string> = { pass: "✓", warn: "!", fail: "✕", skipped: "–", off: "·" };
const STATUS_STYLE: Record<string, string> = { pass: "bg-pass", warn: "bg-warn", fail: "bg-fail", skipped: "bg-muted", off: "bg-line" };

const titleOf = (r: Result) => r.product?.title ?? r.offer?.title ?? r.product?.ean ?? "";

export default function RunPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [run, setRun] = useState<Run | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "score", dir: -1 });
  const [verdicts, setVerdicts] = useState<Set<string>>(new Set(["pass", "warn", "fail"]));
  const [band, setBand] = useState<string>("");
  const [failedGate, setFailedGate] = useState<string>("");
  const [q, setQ] = useState("");
  // Cancels the processing loop of the current effect (and on delete).
  const cancel = useRef<() => void>(() => {});

  const fetchRun = useCallback(() => api<{ run: Run; results: Result[] }>(`/api/runs/${id}`), [id]);
  const apply = useCallback((r: { run: Run; results: Result[] }) => {
    setRun(r.run);
    setResults(r.results);
  }, []);

  // Drive the processor in chunks until the run is done, refreshing the table as rows land.
  useEffect(() => {
    let cancelled = false;
    cancel.current = () => {
      cancelled = true;
    };
    (async () => {
      try {
        const first = await fetchRun();
        apply(first);
        if (first.run.status === "done" || cancelled) return;
        setProcessing(true);
        let failures = 0;
        while (!cancelled) {
          try {
            const p = await api<{ done: boolean }>(`/api/runs/${id}/process`, { method: "POST" });
            failures = 0;
            if (cancelled) break;
            apply(await fetchRun());
            if (p.done) break;
          } catch (e) {
            if (++failures >= 3) throw e;
            await new Promise((r) => setTimeout(r, 3000 * failures));
          }
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setProcessing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, fetchRun, apply]);

  const done = results.filter((r) => r.status !== "pending");
  const failedGates = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of done) if (r.failed_gate) m.set(r.failed_gate, (m.get(r.failed_gate) ?? 0) + 1);
    return GATE_ORDER.filter((g) => m.has(g)).map((g) => ({ gate: g, n: m.get(g)! }));
  }, [done]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = done.filter((r) =>
      (r.status === "error" ? verdicts.has("fail") : r.verdict != null && verdicts.has(r.verdict)) &&
      (!band || r.band === band) &&
      (!failedGate || r.failed_gate === failedGate) &&
      (!needle || [titleOf(r), r.product?.brand, r.product?.ean, r.product?.asin, r.offer?.supplier?.name, r.why].some((x) => x?.toLowerCase().includes(needle))),
    );
    const val = (r: Result): number | string | null =>
      sort.key === "title" ? titleOf(r).toLowerCase() : sort.key === "verdict" ? ({ pass: 0, warn: 1, fail: 2 }[r.verdict ?? "fail"]) : (r[sort.key] as number | null);
    return filtered.sort((a, b) => {
      const x = val(a), y = val(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [done, verdicts, band, failedGate, q, sort]);

  const counts = {
    pass: done.filter((r) => r.verdict === "pass").length,
    warn: done.filter((r) => r.verdict === "warn").length,
    fail: done.filter((r) => r.verdict === "fail" || r.status === "error").length,
    green: done.filter((r) => r.band === "green").length,
  };

  function exportXlsx() {
    const data = rows.map((r) => ({
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
    XLSX.writeFile(wb, `wholesale-scout-${(run?.source ?? "run").replace(/[^\w-]+/g, "_").slice(0, 40)}.xlsx`);
  }

  const th = (key: SortKey, label: string, right = false) => (
    <th className={`whitespace-nowrap px-3 py-2 ${right ? "text-right" : ""}`}>
      <button className="uppercase tracking-wide hover:text-ink" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === "title" ? 1 : -1 }))}>
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
          <h1 className="h1">{run.source}</h1>
          <p className="text-sm text-muted">
            {run.profile?.name ?? "Profile"} · started {when(run.started_at)} · {total} products · {run.token_cost} Keepa tokens
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={exportXlsx} disabled={!rows.length}>Export {rows.length} to xlsx</button>
          <button className="btn text-fail" onClick={async () => {
            if (!confirm("Delete this run and its results?")) return;
            cancel.current();
            await api(`/api/runs/${id}`, { method: "DELETE" }).catch(() => {});
            router.push("/");
          }}>Delete</button>
        </div>
      </div>

      {(processing || run.status !== "done") && (
        <div className="card space-y-2 p-4">
          <div className="flex justify-between text-sm">
            <span>{processing ? "Screening…" : "Paused"} {done.length} of {total}</span>
            <span className="text-muted">Row gates first; Keepa and SP-API only for rows that survive them</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full bg-accent transition-all" style={{ width: `${total ? (done.length / total) * 100 : 0}%` }} />
          </div>
        </div>
      )}
      {error && <p className="rounded-md bg-fail-soft px-3 py-2 text-sm text-fail">{error}</p>}

      <div className="card flex flex-wrap items-end gap-4 p-3">
        <div className="flex gap-1">
          {(["pass", "warn", "fail"] as const).map((v) => (
            <button key={v} onClick={() => setVerdicts((s) => { const n = new Set(s); if (n.has(v)) n.delete(v); else n.add(v); return n; })}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${verdicts.has(v) ? VERDICT_STYLE[v] : "bg-surface-2 text-muted line-through"}`}>
              {v} {counts[v]}
            </button>
          ))}
        </div>
        <label className="space-y-1">
          <span className="label">Band</span>
          <select className="input w-32" value={band} onChange={(e) => setBand(e.target.value)}>
            <option value="">Any</option><option value="green">Green</option><option value="amber">Amber</option><option value="grey">Grey</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="label">Why it failed</span>
          <select className="input w-56" value={failedGate} onChange={(e) => { setFailedGate(e.target.value); if (e.target.value) setVerdicts(new Set(["fail"])); }}>
            <option value="">Any</option>
            {failedGates.map((f) => <option key={f.gate} value={f.gate}>{GATE_LABELS[f.gate]} ({f.n})</option>)}
          </select>
        </label>
        <label className="min-w-48 flex-1 space-y-1">
          <span className="label">Search</span>
          <input className="input" placeholder="Name, brand, EAN, ASIN, supplier, why" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <span className="text-sm text-muted">{counts.green} green</span>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs text-muted">
            <tr>
              {th("verdict", "Verdict")}
              {th("score", "Score", true)}
              {th("title", "Product")}
              {th("landed_cost", "Landed", true)}
              {th("sell_price", "Sell", true)}
              {th("profit", "Profit", true)}
              {th("roi", "ROI", true)}
              {th("margin", "Margin", true)}
              {th("hurdle_price", "Hurdle", true)}
              <th className="px-3 py-2 uppercase tracking-wide">Why</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isOpen = open.has(r.id);
              return (
                <Fragment key={r.id}>
                  <tr className="cursor-pointer border-b border-line align-top hover:bg-surface-2"
                    onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })}>
                    <td className="px-3 py-2">
                      {r.status === "error"
                        ? <span className="rounded-full bg-fail-soft px-2 py-0.5 text-xs font-semibold text-fail">error</span>
                        : r.verdict && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${VERDICT_STYLE[r.verdict]}`}>{r.verdict}</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.score != null && r.band
                        ? <span className={`num inline-block min-w-9 rounded px-1.5 py-0.5 text-center text-xs font-semibold ${BAND_STYLE[r.band]}`}>{Math.round(r.score)}</span>
                        : <span className="text-muted">—</span>}
                    </td>
                    <td className="max-w-[340px] px-3 py-2">
                      <div className="truncate font-medium" title={titleOf(r)}>{titleOf(r)}</div>
                      <div className="num truncate text-xs text-muted">
                        {r.product?.ean}
                        {r.product?.asin && <> · <a className="text-accent hover:underline" href={`https://www.amazon.co.uk/dp/${r.product.asin}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{r.product.asin}</a></>}
                        {r.offer?.supplier && <> · {r.offer.supplier.name}{r.offer_count > 1 ? ` (+${r.offer_count - 1})` : ""}</>}
                      </div>
                    </td>
                    <td className="num px-3 py-2 text-right">{gbp(r.landed_cost)}</td>
                    <td className="num px-3 py-2 text-right">{gbp(r.sell_price)}</td>
                    <td className={`num px-3 py-2 text-right ${r.profit != null && r.profit < 0 ? "text-fail" : ""}`}>{gbp(r.profit)}</td>
                    <td className="num px-3 py-2 text-right">{pct(r.roi)}</td>
                    <td className="num px-3 py-2 text-right">{pct(r.margin)}</td>
                    <td className="num px-3 py-2 text-right">{gbp(r.hurdle_price)}</td>
                    <td className="min-w-[320px] px-3 py-2 text-xs leading-snug">{r.status === "error" ? r.error : r.why}</td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-line bg-surface-2/50">
                      <td colSpan={10} className="px-4 py-3">
                        <Detail r={r} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!rows.length && (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-sm text-muted">{done.length ? "Nothing matches these filters." : "Rows appear here as they're screened."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Detail({ r }: { r: Result }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr_1fr]">
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Gates</p>
        <ul className="space-y-1">
          {r.gate_outcomes.map((g) => (
            <li key={g.gate} className="flex gap-2 text-xs">
              <span className={`flex h-4 w-4 flex-none items-center justify-center rounded-full text-[10px] font-bold text-white ${STATUS_STYLE[g.status]}`}>{STATUS_ICON[g.status]}</span>
              <span className="w-40 flex-none font-medium">{g.label}</span>
              <span className="text-muted">{g.detail}</span>
            </li>
          ))}
          {r.failed_gate && <li className="text-xs text-muted">Stopped at {GATE_LABELS[r.failed_gate]}; later gates didn&apos;t run.</li>}
        </ul>
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
      </div>
    </div>
  );
}
