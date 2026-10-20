"use client";

import { ArrowRightIcon, KanbanIcon, MoveIcon, PlusIcon, UploadIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { useDialogs } from "@/components/Dialogs";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { CandidateDecision, StatusChip } from "@/components/ui/status-chip";
import { Switch } from "@/components/ui/switch";
import type { RateCard } from "@/lib/fees/rateCard";
import { STAGE_HINT, STAGE_LABEL, STAGES, isBackward, type GateSeg, type Stage } from "@/lib/pl/pipeline";
import type { PipelineCard } from "@/lib/server/plPipeline";
import { api } from "@/lib/ui/client";
import { cn } from "@/lib/utils";
import { NewCandidate } from "./NewCandidate";

interface Board { cards: PipelineCard[]; card: RateCard }

const SEG_CLS: Record<GateSeg["seg"], string> = { passed: "bg-primary", progress: "bg-highlight", todo: "bg-muted-foreground/25" };

/** Eight segments, Gate 0 first: passed teal, in progress amber, not started grey. */
export function GateBar({ gates, label, className }: { gates: GateSeg[]; label: string; className?: string }) {
  return (
    <div role="img" aria-label={label} title={label} className={cn("flex gap-0.5", className)}>
      {gates.map((g) => <span key={g.n} className={cn("h-1.5 flex-1 rounded-full", SEG_CLS[g.seg])} />)}
    </div>
  );
}

/** Private label's home: the pipeline from research to selling. Drag a card between columns, or use its Move to… menu. */
export function PipelineBoard() {
  const router = useRouter();
  const { confirm } = useDialogs();
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showParked, setShowParked] = useState(false);
  const [adding, setAdding] = useState(false);
  const [over, setOver] = useState<Stage | null>(null);

  const load = useCallback(() => api<Board>("/api/pl/pipeline").then((b) => { setBoard(b); setError(null); }, (e: Error) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const move = useCallback(async (c: PipelineCard, to: Stage) => {
    if (c.kind !== "candidate" || c.stage === to) return;
    if (c.parked) { toast.error(`${c.name} is parked: unpark it first`); return; }
    if (isBackward(c.stage, to) && !(await confirm({
      title: `Move “${c.name}” back to ${STAGE_LABEL[to]}?`,
      description: `It's in ${STAGE_LABEL[c.stage]} now. Nothing is deleted: its quotes, checklist and gates stay, and it stays in ${STAGE_LABEL[to]} until you move it or something new happens.`,
      confirmLabel: `Move to ${STAGE_LABEL[to]}`,
    }))) return;
    // At once on the board; the server's card replaces it.
    setBoard((b) => b && { ...b, cards: b.cards.map((x) => (x.id === c.id ? { ...x, stage: to } : x)) });
    try {
      const r = await api<{ card: PipelineCard }>(`/api/pl/candidates/${c.id}/stage`, { method: "POST", json: { stage: to } });
      setBoard((b) => b && { ...b, cards: b.cards.map((x) => (x.id === c.id ? r.card : x)) });
      toast.success(`${c.name} → ${STAGE_LABEL[to]}`);
    } catch (e) {
      toast.error((e as Error).message);
      load();
    }
  }, [confirm, load]);

  const unpark = async (c: PipelineCard) => {
    try {
      await api(`/api/pl/candidates/${c.id}`, { method: "PATCH", json: { unpark: true } });
      toast.success(`${c.name} unparked`);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const header = (
    <PageHeader
      title="Pipeline"
      crumbs={[{ label: "Private label", href: "/pl" }, { label: "Pipeline" }]}
      subtitle="Every candidate from research to selling, with its next step."
      info={<>
        <p>Research covers Gates 0–3 and Validate Gates 4–7; Sourcing is quotes, samples, artwork and the PO; Launch is inbound stock, the listing and the first ads; Live is selling.</p>
        <p>A card sits where its records put it (the launch checklist, quotes, messaged suppliers, then the gates) until you move it: drag it, or use its Move to… menu. Moving back asks first. Products already selling without a candidate show in Live.</p>
      </>}
      actions={<>
        <Button variant="secondary" asChild><Link href="/pl/niches"><UploadIcon /> Import niches</Link></Button>
        <Button onClick={() => setAdding(true)}><PlusIcon /> New candidate</Button>
      </>}
    />
  );
  if (error && !board) return <div className="space-y-6">{header}<ErrorState title="Couldn't load the pipeline" message={error} onRetry={load} /></div>;
  if (!board) return <div className="space-y-6">{header}<div className="grid gap-3 lg:grid-cols-5">{STAGES.map((s) => <Skeleton key={s} className="h-64 rounded-[14px]" />)}</div></div>;

  const parked = board.cards.filter((c) => c.parked);
  const shown = board.cards.filter((c) => showParked || !c.parked);
  const jump = (s: Stage) => document.getElementById(`stage-${s}`)?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  const drop = (to: Stage) => (e: DragEvent) => {
    e.preventDefault();
    setOver(null);
    const c = board.cards.find((x) => x.id === e.dataTransfer.getData("text/plain"));
    if (c) void move(c, to);
  };

  return (
    <div className="space-y-4">
      {header}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {parked.length > 0 && (
          <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={showParked} onCheckedChange={setShowParked} /> Show parked ({parked.length})
          </label>
        )}
        <Link href="/pl/candidates" className="text-sm text-primary hover:underline">Candidates as a table →</Link>
      </div>
      {/* Phones: one column a screen, swiped; this strip jumps to one. */}
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 lg:hidden" role="group" aria-label="Go to a column">
        {STAGES.map((s) => (
          <button key={s} type="button" onClick={() => jump(s)} className="flex-none cursor-pointer rounded-full border border-border px-3 py-1 text-meta hover:bg-accent">
            {STAGE_LABEL[s]} <span className="num text-muted-foreground">{shown.filter((c) => c.stage === s).length}</span>
          </button>
        ))}
      </div>
      <div className="-mx-4 flex items-start snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:snap-none lg:grid-cols-5 lg:overflow-visible lg:px-0">
        {STAGES.map((s) => {
          const cards = shown.filter((c) => c.stage === s);
          return (
            <section key={s} id={`stage-${s}`} aria-labelledby={`stage-${s}-title`}
              onDragOver={(e) => { e.preventDefault(); setOver(s); }} onDragLeave={() => setOver((o) => (o === s ? null : o))} onDrop={drop(s)}
              className={cn("flex w-[calc(100vw-3rem)] flex-none snap-start scroll-ml-4 flex-col gap-2 rounded-[14px] bg-muted/50 p-2 sm:w-80 lg:w-auto lg:min-w-0", over === s && "ring-2 ring-primary")}>
              <header className="px-1.5 pt-1">
                <h2 id={`stage-${s}-title`} className="flex items-center gap-2 text-sm font-semibold">{STAGE_LABEL[s]} <span className="num rounded-full bg-card px-2 text-xs font-medium text-muted-foreground">{cards.length}</span></h2>
                <p className="text-xs text-muted-foreground">{STAGE_HINT[s]}</p>
              </header>
              {cards.length ? cards.map((c) => <Card key={c.id} c={c} onMove={move} onUnpark={unpark} />)
                : <p className="rounded-[10px] border border-dashed border-border px-3 py-6 text-center text-meta text-muted-foreground">Nothing here yet</p>}
            </section>
          );
        })}
      </div>
      {!board.cards.some((c) => c.kind === "candidate") && (
        <p className="text-sm text-muted-foreground"><KanbanIcon className="mr-1 inline size-4" /> No candidates yet: add one, or import Opportunity Explorer niches and make the best into candidates.</p>
      )}
      <NewCandidate open={adding} onOpenChange={setAdding} card={board.card} onCreated={async (id) => router.push(`/pl/candidates/${id}`)} />
    </div>
  );
}

function Card({ c, onMove, onUnpark }: { c: PipelineCard; onMove: (c: PipelineCard, to: Stage) => void; onUnpark: (c: PipelineCard) => void }) {
  const candidate = c.kind === "candidate";
  return (
    <article draggable={candidate && !c.parked} onDragStart={(e) => { e.dataTransfer.setData("text/plain", c.id); e.dataTransfer.effectAllowed = "move"; }}
      aria-label={c.name} className={cn("space-y-2 rounded-[10px] border border-border bg-card p-3 shadow-xs", candidate && !c.parked && "cursor-grab active:cursor-grabbing", c.parked && "opacity-70")}>
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 text-sm leading-snug font-medium"><Link href={c.href} className="hover:underline">{c.name}</Link></h3>
        {candidate && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="-mt-1 -mr-1 size-7" aria-label={`Move ${c.name} to…`} title="Move to…"><MoveIcon /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Move to…</DropdownMenuLabel>
              {c.parked ? <DropdownMenuItem onSelect={() => onUnpark(c)}>Unpark</DropdownMenuItem>
                : STAGES.map((s) => (
                  <DropdownMenuItem key={s} disabled={s === c.stage} onSelect={() => onMove(c, s)}>
                    {STAGE_LABEL[s]}{s === c.stage ? " (here)" : ""}
                  </DropdownMenuItem>
                ))}
              {c.moved && <><DropdownMenuSeparator /><p className="max-w-56 px-2 py-1 text-xs text-muted-foreground">You moved it here; its records alone say {STAGE_LABEL[c.derived]}.</p></>}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {c.detail && <p className="text-meta text-muted-foreground">{c.detail}</p>}
      {candidate && c.gates.length > 0 && <GateBar gates={c.gates} label={c.gateLabel} />}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {c.parked ? <StatusChip tone="neutral" icon={false}>{c.status === "dropped" ? "Dropped" : "Parked"}</StatusChip>
          : candidate ? (c.verdict && c.verdict.cls !== "empty" ? <CandidateDecision cls={c.verdict.cls} title={c.verdict.title} /> : <StatusChip tone="neutral" icon={false}>{c.verdict?.title ?? "Not scored"}</StatusChip>)
          : <StatusChip tone="good">Selling</StatusChip>}
        <span className="ml-auto flex items-center gap-2 text-meta">
          {candidate && <Link href={c.href} className="font-medium text-primary hover:underline">Open</Link>}
          {c.links.map((l) => <Link key={l.label} href={l.href} className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline">{l.label} <ArrowRightIcon className="size-3" /></Link>)}
        </span>
      </div>
    </article>
  );
}
