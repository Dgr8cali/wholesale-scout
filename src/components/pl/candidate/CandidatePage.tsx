"use client";

import { ArchiveIcon, ArrowRightIcon, CheckIcon, ClipboardListIcon, FactoryIcon, LayoutListIcon, MessageSquareTextIcon, PenLineIcon, RocketIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useDialogs } from "@/components/Dialogs";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { STAGE_LABEL, type CandidateTab, type NextAction } from "@/lib/pl/pipeline";
import type { PipelineCard } from "@/lib/server/plPipeline";
import { api } from "@/lib/ui/client";
import { useTab } from "@/lib/ui/useTab";
import { GateBar } from "../PipelineBoard";
import { OverviewTab } from "./OverviewTab";
import { useCandidate } from "./useCandidate";
import dynamic from "next/dynamic";

// Each tab but Overview loads when it's first opened (the Listing Writer and the launch builder are large).
const tabWait = () => <div className="space-y-3"><Skeleton className="h-40 rounded-[14px]" /><Skeleton className="h-64 rounded-[14px]" /></div>;
const GatesTab = dynamic(() => import("./GatesTab").then((m) => m.GatesTab), { loading: tabWait });
const ReviewsTab = dynamic(() => import("./tabs").then((m) => m.ReviewsTab), { loading: tabWait });
const SuppliersTab = dynamic(() => import("./tabs").then((m) => m.SuppliersTab), { loading: tabWait });
const ListingTab = dynamic(() => import("./tabs").then((m) => m.ListingTab), { loading: tabWait });
const LaunchTab = dynamic(() => import("./tabs").then((m) => m.LaunchTab), { loading: tabWait });

const TABS = ["overview", "gates", "reviews", "suppliers", "listing", "launch"] as const satisfies readonly CandidateTab[];
/** Old in-page anchors (the extension links to #suppliers) open their tab. */
const HASH_TAB: Record<string, CandidateTab> = { "#suppliers": "suppliers", "#quotes": "suppliers", "#listing": "listing", "#launch": "launch", "#reviews": "reviews", "#gates": "gates" };

/**
 * A candidate's page (/pl/candidates/[id]): the header with its gates, next action, Park and the one
 * primary action, then a tab for each part of the job. Each tab loads its own data when opened.
 */
export function CandidatePage({ id }: { id: string }) {
  const [tab, setTab] = useTab(TABS);
  const [card, setCard] = useState<PipelineCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Bumped when the header's action changes data a tab shows (it reloads).
  const [version, setVersion] = useState(0);
  const { prompt } = useDialogs();

  const loadCard = useCallback(() => api<{ card: PipelineCard }>(`/api/pl/pipeline?id=${id}`).then((r) => { setCard(r.card); setError(null); }, (e: Error) => setError(e.message)), [id]);
  useEffect(() => { void loadCard(); }, [loadCard]);
  useEffect(() => {
    const t = HASH_TAB[window.location.hash];
    if (t) setTab(t);
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error && !card) return <ErrorState title="Couldn't load the candidate" message={error} onRetry={loadCard} />;
  if (!card) return <div className="space-y-6"><Skeleton className="h-20 rounded-[14px]" /><Skeleton className="h-10 w-2/3 rounded-[10px]" /><Skeleton className="h-96 rounded-[14px]" /></div>;

  const parked = card.status === "parked";
  const doStep = async (n: NextAction) => {
    if (!n.step) return;
    setBusy(true);
    try {
      await api(`/api/pl/candidates/${id}/launch`, { method: "PUT", json: { step: n.step, done: true } });
      toast.success(`${n.label.replace(/^Mark /, "").replace(/^./, (c) => c.toUpperCase())}: done`);
      await loadCard();
      setVersion((v) => v + 1);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const park = async () => {
    const reason = await prompt({ title: `Park "${card.name}"?`, description: "Shelved, not deleted: it leaves the board (Show parked lists it), keeps every gate, quote and note, and Unpark puts it back where it was.", label: "Why (e.g. waiting for Q1 prices; supplier MOQ too high for now)", confirmLabel: "Park it" });
    if (!reason) return;
    try { await api(`/api/pl/candidates/${id}`, { method: "PATCH", json: { status: "parked", park_reason: reason } }); toast.success("Parked"); await loadCard(); setVersion((v) => v + 1); } catch (e) { toast.error((e as Error).message); }
  };
  const unpark = async () => {
    try { await api(`/api/pl/candidates/${id}`, { method: "PATCH", json: { unpark: true } }); toast.success("Unparked"); await loadCard(); setVersion((v) => v + 1); } catch (e) { toast.error((e as Error).message); }
  };

  const n = card.next;
  const primary: ReactNode = parked ? <Button onClick={unpark}>Unpark</Button>
    : !n ? null
    : n.step ? <Button onClick={() => doStep(n)} loading={busy}>{!busy && <CheckIcon />} {n.label}</Button>
    : <Button asChild><Link href={`?tab=${n.tab}${n.gate ? `&gate=${n.gate}` : ""}`} scroll={false}>{n.label} <ArrowRightIcon /></Link></Button>;
  const gatesChip = card.gatesPassed === 8 ? "All 8 gates passed" : `Gates ${card.gatesPassed}/8`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={card.name}
        crumbs={[{ label: "Candidates", href: "/pl/candidates" }, { label: card.name }]}
        subtitle={
          <span className="flex flex-wrap items-center gap-1.5">
            <StatusChip tone={card.gatesPassed === 8 ? "good" : "neutral"} icon={card.gatesPassed === 8}>{gatesChip}</StatusChip>
            {parked ? <StatusChip tone="warn">Parked{card.detail ? `: ${card.detail}` : ""}</StatusChip>
              : n && <StatusChip tone="info" icon={false} title={n.detail}>Next: {n.label}</StatusChip>}
            <Link href="/pl" className="text-meta text-muted-foreground hover:text-foreground hover:underline">{STAGE_LABEL[card.stage]} on the pipeline</Link>
          </span>
        }
        actions={<>
          {!parked && <Button variant="secondary" onClick={park}><ArchiveIcon /> Park</Button>}
          {primary}
        </>}
      />
      <GateBar gates={card.gates} label={card.gateLabel} className="max-w-md" />
      <Tabs value={tab} onValueChange={(v) => setTab(v as CandidateTab)} className="gap-5">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList aria-label={`${card.name}`} className="w-max">
            <TabsTrigger value="overview" className="px-3"><LayoutListIcon /> Overview</TabsTrigger>
            <TabsTrigger value="gates" className="px-3"><ClipboardListIcon /> Gates ({card.gatesPassed}/8)</TabsTrigger>
            <TabsTrigger value="reviews" className="px-3"><MessageSquareTextIcon /> Reviews</TabsTrigger>
            <TabsTrigger value="suppliers" className="px-3"><FactoryIcon /> Suppliers &amp; quotes</TabsTrigger>
            <TabsTrigger value="listing" className="px-3"><PenLineIcon /> Listing</TabsTrigger>
            <TabsTrigger value="launch" className="px-3"><RocketIcon /> Launch</TabsTrigger>
          </TabsList>
        </div>
        {/* Only the open tab is mounted, so each loads its own data. */}
        <TabsContent value="overview"><Loaded key={`o${version}`} id={id} onChanged={loadCard}>{(s) => <OverviewTab s={s} next={parked ? null : n} action={primary} onDeleted={() => setCard(null)} />}</Loaded></TabsContent>
        <TabsContent value="gates"><Loaded key={`g${version}`} id={id} onChanged={loadCard}>{(s) => <GatesTab s={s} />}</Loaded></TabsContent>
        <TabsContent value="reviews"><Loaded key={`r${version}`} id={id} onChanged={loadCard}>{(s) => <ReviewsTab s={s} />}</Loaded></TabsContent>
        <TabsContent value="suppliers"><Loaded key={`s${version}`} id={id} onChanged={loadCard}>{(s) => <SuppliersTab id={id} s={s} onChanged={loadCard} />}</Loaded></TabsContent>
        <TabsContent value="listing"><ListingTab key={`l${version}`} id={id} /></TabsContent>
        <TabsContent value="launch"><Loaded key={`x${version}`} id={id} onChanged={loadCard}>{(s) => <LaunchTab id={id} s={s} onChanged={loadCard} />}</Loaded></TabsContent>
      </Tabs>
    </div>
  );
}

/** The candidate's record for one tab, loaded when that tab mounts. */
function Loaded({ id, onChanged, children }: { id: string; onChanged: () => void; children: (s: ReturnType<typeof useCandidate>) => ReactNode }) {
  const s = useCandidate(id, onChanged);
  return <>{children(s)}</>;
}
