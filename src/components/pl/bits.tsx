import type { Status } from "@/lib/pl/gatekeeper";
import { cn } from "@/lib/utils";
import { TONE, type FieldSource } from "./types";

export function Dot({ status, className }: { status: Status; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 flex-none rounded-full bg-current", TONE[status].text, className)} />;
}

const STATUS_LABEL: Record<Status, string> = { pass: "Pass", warn: "Check", fail: "Fail", empty: "Not scored" };

export function StatusPill({ status, label, big }: { status: Status; label?: string; big?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap", TONE[status].soft, TONE[status].text, big ? "px-3 py-1.5 text-sm" : "px-2.5 py-1 text-xs")}>
      <Dot status={status} />{label ?? STATUS_LABEL[status]}
    </span>
  );
}

const SOURCE: Record<FieldSource, { label: string; cls: string; title: string }> = {
  keepa: { label: "Keepa", cls: "bg-brand-soft text-brand", title: "Filled from Keepa; Refresh from Keepa updates it" },
  poe: { label: "POE", cls: "bg-warn-soft text-warn", title: "Filled from an Opportunity Explorer capture" },
  fees: { label: "Fees", cls: "bg-pass-soft text-pass", title: "Worked out from the rate card" },
  manual: { label: "Manual", cls: "bg-empty-soft text-ink-2", title: "Typed by you: no refresh overwrites it" },
};

export function SourceChip({ source }: { source: FieldSource }) {
  const s = SOURCE[source];
  return <span title={s.title} className={cn("rounded px-1.5 py-px text-[10px] font-semibold tracking-wide uppercase", s.cls)}>{s.label}</span>;
}

/** A labelled figure: the readouts under Gates 6 and 7. */
export function Readout({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: Status | null }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg bg-surface-2 px-3 py-2.5">
      <span className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</span>
      <span className={cn("num text-base font-medium", tone && tone !== "empty" && TONE[tone].text)}>{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}
