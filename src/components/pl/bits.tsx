import type { Status } from "@/lib/pl/gatekeeper";
import { decisionLabel, GATE_RESULT, StatusChip, type Tone } from "@/components/ui/status-chip";
import { cn } from "@/lib/utils";
import { TONE, type FieldSource } from "./types";

export function Dot({ status, className }: { status: Status; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 flex-none rounded-full bg-current", TONE[status].text, className)} />;
}

const STATUS_TONE: Record<Status, Tone> = { pass: "good", warn: "warn", fail: "bad", empty: "neutral" };

/** A gate or check result (Pass / Check / Fail / Not scored), or another label in the same tone: the shared StatusChip. */
export function StatusPill({ status, label, big }: { status: Status; label?: string; big?: boolean }) {
  return <StatusChip tone={STATUS_TONE[status]} className={big ? "h-8 px-3 text-sm" : undefined}>{label ?? decisionLabel(GATE_RESULT, status)}</StatusChip>;
}

const SOURCE: Record<FieldSource, { label: string; cls: string; title: string }> = {
  keepa: { label: "Keepa", cls: "bg-brand-soft text-link", title: "Filled from Keepa; Refresh from Keepa updates it" },
  poe: { label: "POE", cls: "bg-warn-soft text-warn", title: "Filled from an Opportunity Explorer capture" },
  poe_derived: { label: "POE (derived)", cls: "bg-warn-soft text-warn", title: "Worked out from an Opportunity Explorer capture, which doesn't state it: how, under the field" },
  fees: { label: "Fees", cls: "bg-pass-soft text-pass", title: "Worked out from the rate card" },
  manual: { label: "Manual", cls: "bg-empty-soft text-ink-2", title: "Typed by you: no refresh overwrites it" },
  quote: { label: "Quote", cls: "bg-pass-soft text-pass", title: "From a supplier quote's landed-cost calculator (Quotes); your own value wins over it" },
};

export function SourceChip({ source }: { source: FieldSource }) {
  const s = SOURCE[source];
  return <span title={s.title} className={cn("rounded px-1.5 py-px text-xs font-semibold tracking-wide uppercase", s.cls)}>{s.label}</span>;
}

/** A labelled figure: the readouts under Gates 6 and 7. */
export function Readout({ label, value, sub, tone }: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; tone?: Status | null }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg bg-surface-2 px-3 py-2.5">
      <span className="text-xs tracking-wide text-muted-foreground uppercase">{label}</span>
      <span className={cn("num text-base font-medium", tone && tone !== "empty" && TONE[tone].text)}>{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}
