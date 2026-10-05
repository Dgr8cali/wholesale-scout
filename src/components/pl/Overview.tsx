"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SortTh, useSortable } from "@/components/SortableTable";
import { ErrorState } from "@/components/States";
import { Skeleton } from "@/components/ui/skeleton";
import { withAdsDefaults } from "@/lib/pl/adsDefaults";
import { evaluate } from "@/lib/pl/gatekeeper";
import type { PlStatus } from "@/lib/pl/launch";
import { priceMultiple } from "@/lib/pl/quotes";
import { api } from "@/lib/ui/client";
import { cn } from "@/lib/utils";
import { CandidateExtras } from "./Extras";
import { valuesOf, type ListResponse } from "./types";

const MULT_CLS = { pass: "text-pass", warn: "text-warn", fail: "text-fail" } as const;
const STATUS_RANK: Record<string, number> = { draft: 0, researching: 1, samples: 2, launched: 3, parked: 4, dropped: 5 };

/**
 * Private label → Quotes or Launch: every candidate with its status, verdict, quotes, chosen landed
 * cost, price multiple and next launch step; pick one to work on its quotes or its launch.
 */
export function PlOverview({ mode }: { mode: "quotes" | "launch" }) {
  const [list, setList] = useState<ListResponse | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const load = useCallback(() => Promise.all([
    api<ListResponse>("/api/pl/candidates").then(setList),
    api<{ candidates: { id: string; quotes: number }[] }>("/api/pl/overview").then((r) => setCounts(Object.fromEntries(r.candidates.map((c) => [c.id, c.quotes])))),
  ]).catch((e: Error) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => (list?.candidates ?? []).map((c) => {
    const ev = evaluate(withAdsDefaults(valuesOf(c.fields), list!.adsCpc), c.category, list!.settings, list!.card, new Date(), c.waivers ?? []);
    const sell = c.fields.sell?.value ? Number(c.fields.sell.value) : null;
    const landed = c.chosen_landed ?? (c.fields.landed?.value ? Number(c.fields.landed.value) : null);
    const inLaunch = ev.v.title === "Order samples" || c.status === "samples" || c.status === "launched";
    return { c, ev, sell, landed, m: priceMultiple(sell, landed), quotes: counts[c.id] ?? 0, inLaunch };
  }).filter((r) => (mode === "launch" && !all ? r.inLaunch : all || (r.c.status !== "dropped" && r.c.status !== "parked"))), [list, counts, mode, all]);
  const s = useSortable(`pl.${mode}`, rows, {
    name: { value: (r) => r.c.name }, status: { value: (r) => STATUS_RANK[r.c.status] ?? 9, kind: "number" }, verdict: { value: (r) => r.ev.sc.total, kind: "number" },
    quotes: { value: (r) => r.quotes, kind: "number" }, landed: { value: (r) => r.landed, kind: "number" }, multiple: { value: (r) => r.m?.multiple ?? null, kind: "number" },
    next: { value: (r) => r.c.launch?.done ? r.c.launch.next : null },
  });

  if (error) return <ErrorState title="Couldn't load the candidates" message={error} />;
  if (!list) return <Skeleton className="h-64 rounded-lg" />;
  const sel = rows.find((r) => r.c.id === picked) ?? s.rows[0] ?? null;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">{mode === "launch" ? "Candidates whose verdict is Order samples, or at samples or launched." : "Every candidate not dropped."}</span>
        <label className="ml-auto flex items-center gap-2 text-sm"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show all candidates{mode === "quotes" ? " (dropped too)" : ""}</label>
      </div>
      {!rows.length ? (
        <p className="panel p-4 text-sm text-muted-foreground">{mode === "launch" ? "No candidate is ready to launch yet: one gets here when its verdict is Order samples (24+ with every gate clear), or tick Show all candidates." : "No candidates yet."} <Link href="/pl/candidates" className="text-brand hover:underline">Candidates →</Link></p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-[11px] tracking-wide text-muted-foreground uppercase">
              <SortTh {...s.th("name")} className="px-2 py-1.5">Candidate</SortTh>
              <SortTh {...s.th("status")} className="px-2 py-1.5">Status</SortTh>
              <SortTh {...s.th("verdict")} className="px-2 py-1.5">Verdict</SortTh>
              <SortTh {...s.th("quotes")} numeric className="px-2 py-1.5 text-right">Quotes</SortTh>
              <SortTh {...s.th("landed")} numeric className="px-2 py-1.5 text-right">Landed / unit</SortTh>
              <SortTh {...s.th("multiple")} numeric className="px-2 py-1.5 text-right">Multiple</SortTh>
              <SortTh {...s.th("next")} className="px-2 py-1.5">Next launch step</SortTh>
            </tr></thead>
            <tbody>{s.rows.map((r) => (
              <tr key={r.c.id} onClick={() => setPicked(r.c.id)} className={cn("cursor-pointer border-b last:border-b-0 hover:bg-surface-2", sel?.c.id === r.c.id && "bg-brand-soft hover:bg-brand-soft")}>
                <td className="px-2 py-1.5 font-medium">{r.c.name}</td>
                <td className="px-2 py-1.5"><span className="rounded border px-1 text-[11px] tracking-wide uppercase">{r.c.status}</span></td>
                <td className="px-2 py-1.5 text-xs">{r.ev.v.title} <span className="text-muted-foreground">{r.ev.sc.answered === 10 ? `${r.ev.sc.total}/30` : `${r.ev.sc.answered}/10 scored`}</span></td>
                <td className="num px-2 py-1.5 text-right">{r.quotes || "—"}</td>
                <td className="num px-2 py-1.5 text-right">{r.landed != null ? `£${r.landed.toFixed(2)}` : "—"}{r.c.chosen_landed != null && <span className="text-xs text-muted-foreground"> quote</span>}</td>
                <td className={cn("num px-2 py-1.5 text-right font-medium", r.m && MULT_CLS[r.m.status])}>{r.m ? `${r.m.multiple.toFixed(2)}×` : "—"}</td>
                <td className="px-2 py-1.5 text-xs">{r.c.launch?.done ? r.c.launch.next ?? "All done" : r.inLaunch ? "Samples ordered" : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {sel && (
        <div className="space-y-3">
          <div className="flex items-baseline gap-2">
            <h2 className="font-heading text-lg font-bold">{sel.c.name}</h2>
            <Link href={`/pl/candidates?c=${sel.c.id}`} className="text-xs text-brand hover:underline">Open the candidate →</Link>
          </div>
          <CandidateExtras key={sel.c.id} show={mode}
            c={{ id: sel.c.id, name: sel.c.name, niche_keyword: sel.c.niche_keyword, category: sel.c.category, sell: sel.sell, fields: sel.c.fields }}
            status={sel.c.status as PlStatus} verdictTitle={sel.ev.v.title} budget={list.settings.budget}
            onFieldsChanged={load} onStatus={() => load()} />
        </div>
      )}
    </div>
  );
}
