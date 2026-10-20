"use client";

import { FlaskConicalIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { valuesOf, type CandidateRow, type ListResponse } from "@/components/pl/types";
import { NewCandidate } from "@/components/pl/NewCandidate";
import { Workspace } from "@/components/pl/Workspace";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { CandidateDecision, StatusChip, Verdict } from "@/components/ui/status-chip";
import { Switch } from "@/components/ui/switch";
import { capitalText, evaluate, type Status } from "@/lib/pl/gatekeeper";
import { withAdsDefaults } from "@/lib/pl/adsDefaults";
import { priceMultiple } from "@/lib/pl/quotes";
import { api } from "@/lib/ui/client";
import { ago } from "@/lib/ui/when";
import { cn } from "@/lib/utils";

const VERDICT_RANK: Record<Status, number> = { pass: 3, warn: 2, fail: 1, empty: 0 };
type Scored = { c: CandidateRow; ev: ReturnType<typeof evaluate> };

export default function CandidatesPage() {
  return <Suspense><Candidates /></Suspense>;
}

/** Private label → Candidates: Gatekeeper's eight gates, scorecard and verdict for products you might launch. */
function Candidates() {
  const router = useRouter();
  const params = useSearchParams();
  const [list, setList] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(() => params.get("new") === "1");
  const [showParked, setShowParked] = useState(false);
  const selected = params.get("c");

  const load = useCallback(() => api<ListResponse>("/api/pl/candidates").then(setList).catch((e: Error) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const select = useCallback((id: string | null) => router.replace(id ? `/pl/candidates?c=${id}` : "/pl/candidates", { scroll: false }), [router]);

  useEffect(() => {
    if (list && !selected && list.candidates.length) select((list.candidates.find((c) => c.status !== "parked") ?? list.candidates[0]).id);
  }, [list, selected, select]);

  const all = useMemo(() => (list ? list.candidates.map((c) => ({ c, ev: evaluate(withAdsDefaults(valuesOf(c.fields), list.adsCpc), c.category, list.settings, list.card, new Date(), c.waivers ?? []) })) : []), [list]);
  // Parked candidates sit in their own collapsed section, newest parked first.
  const scored = all.filter((x) => x.c.status !== "parked");
  const parked = all.filter((x) => x.c.status === "parked").sort((a, b) => (b.c.parked_at ?? "").localeCompare(a.c.parked_at ?? ""));

  if (error) return <ErrorState title="Couldn't load Private label" message={error} onRetry={load} />;
  if (!list) return <div className="space-y-6"><Skeleton className="h-16 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div>;

  const patchRow = (id: string, p: Partial<CandidateRow>) => setList((l) => l && { ...l, candidates: l.candidates.map((c) => (c.id === id ? { ...c, ...p } : c)) });

  const rows = showParked || parked.some((x) => x.c.id === selected) ? [...scored, ...parked] : scored;
  const open = (id: string) => {
    select(id);
    requestAnimationFrame(() => document.getElementById("candidate-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const columns: DataColumn<Scored>[] = [
    {
      id: "name", header: "Candidate", mobile: "title", sortValue: ({ c }) => c.name,
      cell: ({ c }) => (
        <button type="button" onClick={(e) => { e.stopPropagation(); open(c.id); }} className="min-w-0 cursor-pointer text-left">
          <span className="block font-medium hover:underline">{c.name}</span>
          {c.niche_keyword && <span className="block text-meta text-muted-foreground">{c.niche_keyword}</span>}
        </button>
      ),
    },
    {
      id: "verdict", header: "Verdict", mobile: 1, sortValue: ({ ev }) => VERDICT_RANK[ev.v.cls],
      cell: ({ c, ev }) => c.status === "parked"
        ? <Verdict verdict="parked" tone="neutral" title={c.park_reason ?? undefined} />
        : <CandidateDecision cls={ev.v.cls === "empty" ? null : ev.v.cls} title={`${ev.v.title}. ${ev.v.text}`} />,
    },
    { id: "score", header: "Score", numeric: true, mobile: 2, sortValue: ({ ev }) => (ev.sc.answered === 10 ? ev.sc.total : -1), cell: ({ ev }) => (ev.sc.answered === 10 ? `${ev.sc.total}/30` : <span className="text-muted-foreground">{ev.sc.answered}/10 scored</span>) },
    { id: "status", header: "Stage", mobile: 3, sortValue: ({ c }) => c.status, cell: ({ c, ev }) => <span className="inline-flex flex-wrap items-center gap-1.5"><StatusChip tone="neutral" icon={false}>{c.status}</StatusChip>{ev.waivedCount > 0 && <StatusChip tone="warn" title={ev.waivedLine ?? ""}>{ev.waivedCount} waived</StatusChip>}</span> },
    { id: "landed", header: "Landed · multiple", numeric: true, sortValue: ({ c }) => c.chosen_landed ?? (c.fields.landed?.value ? Number(c.fields.landed.value) : null), cell: ({ c }) => <CandidateLine c={c} /> },
    { id: "keepa", header: "Keepa", sortValue: ({ c }) => c.refreshed_at, cell: ({ c }) => <span className="text-meta whitespace-nowrap text-muted-foreground">{c.refreshed_at ? ago(c.refreshed_at) : "not fetched"}</span> },
  ];
  const capital = list.settings.budget.toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Candidates"
        crumbs={[{ label: "Private label", href: "/pl" }, { label: "Candidates" }]}
        subtitle={`Products you might launch, scored against Gatekeeper's eight gates.`}
        info={<>
          <p>Should ~{capitalText(list.settings.budget)} launch your own product into this niche? A candidate must clear every gate <em>and</em> score well; a good score never overrides a failed gate.</p>
          <p>Thresholds: launch capital {capital}, min multiple {list.settings.minMultiple}×, steady margin {list.settings.minSteadyMargin}% (<Link className="text-primary underline" href="/settings?tab=pl">Settings → Private label</Link>). Rate card: {list.card.name}; peak rates apply automatically in October–December.</p>
        </>}
        actions={<Button onClick={() => setAdding(true)}><PlusIcon /> New candidate</Button>}
      />

      <div className="space-y-3">
        {parked.length > 0 && (
          <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={showParked} onCheckedChange={setShowParked} /> Show parked ({parked.length})
          </label>
        )}
        <DataTable
          rows={rows}
          columns={columns}
          getRowId={(x) => x.c.id}
          storageKey="pl.candidates"
          caption="Candidates"
          onRowClick={(x) => open(x.c.id)}
          rowClassName={(x) => cn(x.c.id === selected && "bg-primary-soft hover:bg-primary-soft", x.c.status === "parked" && "text-muted-foreground")}
          empty={{
            icon: <FlaskConicalIcon />, title: parked.length ? "Every candidate is parked" : "Score a product against the eight gates",
            description: parked.length ? "Show the parked ones, or add a new candidate." : "Add a candidate with up to ten page-one ASINs; Keepa fills the market and history gates.",
            action: <Button onClick={() => setAdding(true)}><PlusIcon /> New candidate</Button>,
          }}
        />
      </div>

      {selected && list.candidates.some((c) => c.id === selected) && (
        <section id="candidate-detail" className="min-w-0 scroll-mt-20">
          <Workspace key={selected} id={selected} settings={list.settings} card={list.card} adsCpc={list.adsCpc}
            onChanged={(id, p) => patchRow(id, p as Partial<CandidateRow>)}
            onDeleted={(id) => { setList((l) => l && { ...l, candidates: l.candidates.filter((c) => c.id !== id) }); select(null); }} />
        </section>
      )}
      <NewCandidate open={adding} onOpenChange={setAdding} card={list.card} onCreated={async (id) => { await load(); select(id); }} />
    </div>
  );
}

/** Under a candidate in the list: the chosen landed cost, the price multiple, the next launch step. */
function CandidateLine({ c }: { c: CandidateRow }) {
  const sell = c.fields.sell?.value ? Number(c.fields.sell.value) : null;
  const landed = c.chosen_landed ?? (c.fields.landed?.value ? Number(c.fields.landed.value) : null);
  const m = priceMultiple(sell, landed);
  const step = c.launch?.done ? c.launch.next : null;
  if (landed == null && !step) return null;
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-x-2 text-meta text-muted-foreground">
      {landed != null && <span title={c.chosen_landed != null ? "The chosen quote's landed cost per unit" : "Gate 0's landed cost per unit"}>landed £{landed.toFixed(2)}{c.chosen_landed != null ? " (quote)" : ""}</span>}
      {m && <span className={cn("num font-semibold", m.status === "pass" ? "text-pass" : m.status === "warn" ? "text-warn" : "text-fail")} title="Sell ÷ landed: 3.5× passes, 3× warns">{m.multiple.toFixed(1)}×</span>}
      {step && <span className="truncate" title="Next launch step">next: {step}</span>}
    </span>
  );
}
