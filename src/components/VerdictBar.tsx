import { cn } from "@/lib/utils";

export interface VerdictCounts { pass: number; warn: number; fail: number; error: number; pending: number }

const SEGMENTS = [
  { key: "pass", label: "pass", className: "bg-pass" },
  { key: "warn", label: "warn", className: "bg-warn" },
  { key: "fail", label: "fail", className: "bg-fail" },
  { key: "error", label: "error", className: "bg-fail/40" },
  { key: "pending", label: "to screen", className: "bg-muted-foreground/20" },
] as const;

/** A run's rows as one stacked bar (pass / warn / fail / error / still to screen), with counts under it. */
export function VerdictBar({ counts, legend = true, legendClassName, className }: { counts: VerdictCounts; legend?: boolean; legendClassName?: string; className?: string }) {
  const total = SEGMENTS.reduce((s, x) => s + counts[x.key], 0);
  const summary = SEGMENTS.filter((s) => counts[s.key]).map((s) => `${counts[s.key]} ${s.label}`).join(", ") || "no rows";
  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={summary}>
        {total > 0 && SEGMENTS.map((s) => counts[s.key] > 0 && (
          <span key={s.key} className={s.className} style={{ width: `${(counts[s.key] / total) * 100}%` }} />
        ))}
      </div>
      {legend && (
        <div className={cn("flex flex-wrap gap-x-3 text-2xs text-muted-foreground", legendClassName)} aria-hidden="true">
          {SEGMENTS.filter((s) => counts[s.key] > 0 || s.key !== "error" && s.key !== "pending").map((s) => (
            <span key={s.key} className="flex items-center gap-1">
              <span className={cn("size-1.5 rounded-full", s.className)} />
              <span className="num text-foreground">{counts[s.key].toLocaleString("en-GB")}</span> {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
