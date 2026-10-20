"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ReceiptTextIcon, RocketIcon } from "lucide-react";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { CandidateDecision, StatusChip } from "@/components/ui/status-chip";
import { Switch } from "@/components/ui/switch";
import { withAdsDefaults } from "@/lib/pl/adsDefaults";
import { capitalFor, evaluate } from "@/lib/pl/gatekeeper";
import type { PlStatus } from "@/lib/pl/launch";
import { priceMultiple } from "@/lib/pl/quotes";
import { api } from "@/lib/ui/client";
import { cn } from "@/lib/utils";
import { CandidateExtras } from "./Extras";
import { valuesOf, type ListResponse } from "./types";

const MULT_CLS = { pass: "text-success", warn: "text-warn-ink", fail: "text-danger" } as const;
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
  if (error) return <ErrorState title="Couldn't load the candidates" message={error} />;
  if (!list) return <Skeleton className="h-64 rounded-xl" />;
  type Row = (typeof rows)[number];
  const sel = rows.find((r) => r.c.id === picked) ?? rows[0] ?? null;
  const columns: DataColumn<Row>[] = [
    { id: "name", header: "Candidate", mobile: "title", sortValue: (r) => r.c.name, cell: (r) => <span className="font-medium">{r.c.name}</span> },
    { id: "status", header: "Stage", mobile: 2, sortValue: (r) => STATUS_RANK[r.c.status] ?? 9, cell: (r) => <StatusChip tone="neutral" icon={false}>{r.c.status}</StatusChip> },
    {
      id: "verdict", header: "Verdict", mobile: 1, sortValue: (r) => r.ev.sc.total,
      cell: (r) => <span className="inline-flex flex-wrap items-center gap-1.5"><CandidateDecision cls={r.ev.v.cls === "empty" ? null : r.ev.v.cls} title={r.ev.v.title} /> <span className="num text-meta text-muted-foreground">{r.ev.sc.answered === 10 ? `${r.ev.sc.total}/30` : `${r.ev.sc.answered}/10 scored`}</span></span>,
    },
    { id: "quotes", header: "Quotes", numeric: true, sortValue: (r) => r.quotes, cell: (r) => r.quotes || "—" },
    { id: "landed", header: "Landed / unit", numeric: true, sortValue: (r) => r.landed, cell: (r) => <>{r.landed != null ? `£${r.landed.toFixed(2)}` : "—"}{r.c.chosen_landed != null && <span className="text-xs text-muted-foreground"> quote</span>}</> },
    { id: "multiple", header: "Multiple", numeric: true, mobile: 3, sortValue: (r) => r.m?.multiple ?? null, cell: (r) => <span className={cn("font-medium", r.m && MULT_CLS[r.m.status])}>{r.m ? `${r.m.multiple.toFixed(2)}×` : "—"}</span> },
    { id: "next", header: "Next launch step", sortValue: (r) => (r.c.launch?.done ? r.c.launch.next : null), cell: (r) => <span className="text-meta">{r.c.launch?.done ? r.c.launch.next ?? "All done" : r.inLaunch ? "Samples ordered" : "—"}</span> },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">{mode === "launch" ? "Candidates whose verdict is Order samples, or at samples or launched." : "Every candidate not dropped."}</span>
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm"><Switch checked={all} onCheckedChange={setAll} /> Show all candidates{mode === "quotes" ? " (dropped too)" : ""}</label>
      </div>
      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(r) => r.c.id}
        storageKey={`pl.${mode}`}
        caption="Candidates"
        onRowClick={(r) => setPicked(r.c.id)}
        rowClassName={(r) => (sel?.c.id === r.c.id ? "bg-primary-soft hover:bg-primary-soft" : undefined)}
        empty={{
          icon: mode === "launch" ? <RocketIcon /> : <ReceiptTextIcon />,
          title: mode === "launch" ? "No candidate is ready to launch yet" : "No candidates yet",
          description: mode === "launch" ? "One gets here when its verdict is Order samples (24+ with every gate clear), or turn on Show all candidates." : "Add a candidate to collect its supplier quotes here.",
          action: <Button variant="secondary" asChild><Link href="/pl/candidates">Candidates</Link></Button>,
        }}
      />
      {sel && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="section-title">{sel.c.name}</h2>
            <Link href={`/pl/candidates/${sel.c.id}${mode === "quotes" ? "?tab=suppliers" : "?tab=launch"}`} className="text-meta text-primary hover:underline">Open the candidate →</Link>
          </div>
          <CandidateExtras key={sel.c.id} show={mode}
            c={{ id: sel.c.id, name: sel.c.name, niche_keyword: sel.c.niche_keyword, category: sel.c.category, sell: sel.sell, fields: sel.c.fields }}
            status={sel.c.status as PlStatus} verdictTitle={sel.ev.v.title} budget={capitalFor(valuesOf(sel.c.fields), list.settings).amount}
            onFieldsChanged={load} onStatus={() => load()} />
        </div>
      )}
    </div>
  );
}
