"use client";

import { CircleCheckIcon, ClockIcon, PartyPopperIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/States";
import { Button } from "@/components/ui/button";
import type { NextStep } from "@/lib/server/nextSteps";
import { api } from "@/lib/ui/client";

/** The first this many; "Show all" opens the rest. */
const SHOWN = 5;

const longDate = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** One numbered job: what, why (with the numbers), the button that does it, and Later / Done. */
function StepCard({ n, step, onHide }: { n: number; step: NextStep; onHide: (s: NextStep, action: "snooze" | "dismiss") => void }) {
  return (
    <li className="panel flex gap-3 p-4 sm:gap-4 sm:p-5">
      <span aria-hidden className="num flex size-8 flex-none items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary-ink">{n}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium tracking-[0.06em] text-muted-foreground uppercase">
          {step.workspace} · {step.minutes} min
        </p>
        <h3 className="mt-1 text-base leading-snug font-semibold text-balance">{step.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{step.why}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2">
          <Button asChild size="sm"><Link href={step.cta.href}>{step.cta.label}</Link></Button>
          {step.help && <Button asChild size="sm" variant="ghost"><Link href={step.help.href}>{step.help.label}</Link></Button>}
          <span className="ml-auto flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => onHide(step, "snooze")} aria-label={`Later: hide "${step.title}" for 24 hours`}><ClockIcon /> Later</Button>
            <Button size="sm" variant="ghost" onClick={() => onHide(step, "dismiss")} aria-label={`Done: hide "${step.title}" until something changes`}><CircleCheckIcon /> Done</Button>
          </span>
        </div>
      </div>
    </li>
  );
}

/** The numbered steps (top five, then Show all), or "You're all caught up" with what's coming up. */
export function NextSteps({ steps, next, onChange }: { steps: NextStep[]; next: { date: string; title: string } | null; onChange: () => void }) {
  const [all, setAll] = useState(false);
  const [gone, setGone] = useState<Set<string>>(new Set());
  const list = steps.filter((s) => !gone.has(s.id));

  const save = (s: NextStep, action: "snooze" | "dismiss" | "restore") => api("/api/today/steps", { method: "POST", json: { id: s.id, action, fingerprint: s.fingerprint } });
  const hide = (s: NextStep, action: "snooze" | "dismiss") => {
    setGone((g) => new Set(g).add(s.id));
    save(s, action).then(
      () => toast(action === "snooze" ? "Hidden until this time tomorrow" : "Done: it comes back if something changes", {
        action: { label: "Undo", onClick: () => save(s, "restore").then(() => { setGone((g) => { const x = new Set(g); x.delete(s.id); return x; }); onChange(); }) },
      }),
      (e) => { setGone((g) => { const x = new Set(g); x.delete(s.id); return x; }); toast.error(`Couldn't save: ${(e as Error).message}`); },
    );
  };

  if (!list.length) {
    return (
      <EmptyState icon={<PartyPopperIcon />} title="You're all caught up">
        {next ? <>Next up: {next.title}, on {longDate(next.date)}.</> : "Nothing is scheduled. New steps show here as soon as something needs you."}
      </EmptyState>
    );
  }
  const shown = all ? list : list.slice(0, SHOWN);
  return (
    <div className="space-y-3">
      <ol className="space-y-3" aria-label="Next steps">
        {shown.map((s, i) => <StepCard key={s.id} n={i + 1} step={s} onHide={hide} />)}
      </ol>
      {list.length > SHOWN && (
        <Button variant="secondary" size="sm" onClick={() => setAll((a) => !a)} aria-expanded={all}>
          {all ? "Show the top 5" : `Show all (${list.length})`}
        </Button>
      )}
    </div>
  );
}
