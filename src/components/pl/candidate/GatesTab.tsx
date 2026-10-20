"use client";

import { ChevronLeftIcon, ChevronRightIcon, MessageSquareTextIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { gateBlurb } from "@/lib/pl/gatekeeper";
import { cn } from "@/lib/utils";
import { StatusPill } from "../bits";
import { TONE, valuesOf } from "../types";
import { WaivePopover } from "../WaivePopover";
import { CheckRow, FieldRow, GateExtras, ReferencePanel, ScorecardPanel, WaivedChip, WaiversPanel } from "./parts";
import type { CandidateState } from "./useCandidate";

const SCORE = "score";

/**
 * The Gates tab: Gatekeeper's eight gates one at a time (?gate=0–7), then the scorecard and waivers
 * (?gate=score). Every field, check, waiver and compliance rule as before; Gate 4's review miner is on
 * the Reviews tab.
 */
export function GatesTab({ s }: { s: CandidateState }) {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const { data, ev, fields, derived, exworksDerived, saveField, waive, unwaive, reload, load } = s;
  if (s.error && !data) return <ErrorState title="Couldn't load the candidate" message={s.error} onRetry={load} />;
  if (!data || !ev) return <div className="space-y-3"><Skeleton className="h-12 rounded-[14px]" /><Skeleton className="h-96 rounded-[14px]" /></div>;

  const steps = [...ev.gates.map((x) => x.g.n), SCORE];
  const asked = params.get("gate");
  const at = asked && steps.includes(asked) ? asked : steps[0];
  const go = (n: string) => {
    const q = new URLSearchParams(params.toString());
    q.set("tab", "gates");
    q.set("gate", n);
    router.replace(`${path}?${q}`, { scroll: false });
  };
  const i = steps.indexOf(at);
  const cur = ev.gates.find((x) => x.g.n === at);

  return (
    <div className="space-y-4">
      <nav aria-label="Gates" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ol className="flex min-w-max gap-1.5 sm:min-w-0 sm:flex-wrap">
          {ev.gates.map(({ g, status, waiver }) => (
            <li key={g.id}>
              <button type="button" onClick={() => go(g.n)} aria-current={at === g.n ? "step" : undefined} title={`Gate ${g.n}: ${g.title}`}
                className={cn("relative flex cursor-pointer items-center gap-2 rounded-[10px] border px-2.5 py-1.5 text-sm", at === g.n ? "border-primary bg-primary-soft font-medium text-primary-ink" : "border-border hover:bg-accent")}>
                <span className={cn("flex size-6 flex-none items-center justify-center rounded-md text-xs font-bold", TONE[status].solid)}>{g.n}</span>
                <span className="hidden max-w-32 truncate xl:inline">{g.title}</span>
                <span className="sr-only">{waiver ? "waived" : status === "empty" ? "not complete" : status}</span>
              </button>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => go(SCORE)} aria-current={at === SCORE ? "step" : undefined}
              className={cn("flex cursor-pointer items-center gap-2 rounded-[10px] border px-2.5 py-1.5 text-sm", at === SCORE ? "border-primary bg-primary-soft font-medium text-primary-ink" : "border-border hover:bg-accent")}>
              Scorecard <span className="num text-muted-foreground">{ev.sc.answered === 10 ? `${ev.sc.total}/30` : `${ev.sc.answered}/10`}</span>
            </button>
          </li>
        </ol>
      </nav>

      {cur ? (() => {
        const { g, rows, status, rawStatus, waiver: gateWaiver } = cur;
        return (
          <section className="panel overflow-hidden" aria-labelledby={`gate-${g.n}`}>
            <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
              <span className={cn("flex size-8 flex-none items-center justify-center rounded-lg text-sm font-bold", TONE[status].solid)}>{g.n}</span>
              <h2 id={`gate-${g.n}`} className="min-w-0 flex-1 text-base font-semibold">{g.title}</h2>
              <span className="hidden text-xs text-muted-foreground sm:inline">{g.tool}</span>
              {gateWaiver ? (
                <span className="flex items-center gap-1.5">
                  <WaivedChip waiver={gateWaiver} />
                  <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => unwaive(gateWaiver)}>Remove waiver</button>
                </span>
              ) : (rawStatus === "fail" || rawStatus === "warn") && (
                <WaivePopover title={`Waive Gate ${g.n}: ${g.title}`} onWaive={(reason) => waive(g.id, null, reason)}
                  trigger={<button type="button" className="text-xs font-medium text-primary hover:underline">Waive gate</button>} />
              )}
              <StatusPill status={status} label={gateWaiver ? "Waived" : undefined} />
            </div>
            <div className={cn("flex flex-col gap-3.5 border-l-[3px] px-4 pt-3.5 pb-4", TONE[status].border)}>
              <p className="max-w-[70ch] text-sm text-ink-2">{gateBlurb(g, valuesOf(fields), data.settings)}</p>
              <div className="grid grid-cols-1 gap-x-3.5 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.fields.map((fd) => (
                  <FieldRow key={fd.k} def={fd} field={fields[fd.k]} why={data.why[fd.k]} onSave={saveField}
                    derived={fd.k === "adsLaunch" || fd.k === "adsSteady" ? derived[fd.k] : fd.k === "targetExworks" ? exworksDerived : undefined}
                    manualOnly={g.id === "g5" && ["headBid", "ltBid", "sponsored"].includes(fd.k)} />
                ))}
              </div>
              {g.id === "g2" && <ReferencePanel data={data} onChanged={async () => { await reload(); }} />}
              {g.id === "g4" ? (
                <p className="flex flex-wrap items-center gap-2 rounded-lg bg-subtle px-3 py-2.5 text-sm">
                  <MessageSquareTextIcon className="size-4 text-primary-ink" /> The review miner and the critical reviews of each listing are on the
                  <Link className="font-medium text-primary hover:underline" href={`${path}?tab=reviews`}>Reviews tab</Link>.
                </p>
              ) : <GateExtras g={g} data={data} fields={fields} settings={data.settings} card={data.card} onSave={saveField} onAsinsChanged={async () => { await reload(); }} />}
              <div className="overflow-hidden rounded-lg border">
                {rows.map((r, k) => <CheckRow key={k} row={r} gate={g} gateWaived={!!gateWaiver} onWaive={(reason) => waive(g.id, r.label, reason)} onUnwaive={unwaive} />)}
              </div>
            </div>
          </section>
        );
      })() : (
        <div className="space-y-4">
          <ScorecardPanel ev={ev} />
          <WaiversPanel waivers={data.waivers ?? []} ev={ev} onUnwaive={unwaive} />
          <p className="text-xs text-muted-foreground">24–30 order samples · 18–23 only if weak lines are movable · under 18 drop</p>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <Button variant="secondary" size="sm" disabled={i <= 0} onClick={() => go(steps[i - 1])}><ChevronLeftIcon /> {i > 0 ? (steps[i - 1] === SCORE ? "Scorecard" : `Gate ${steps[i - 1]}`) : "Back"}</Button>
        <Button variant="secondary" size="sm" disabled={i >= steps.length - 1} onClick={() => go(steps[i + 1])}>{i < steps.length - 1 ? (steps[i + 1] === SCORE ? "Scorecard" : `Gate ${steps[i + 1]}`) : "Next"} <ChevronRightIcon /></Button>
      </div>
    </div>
  );
}
