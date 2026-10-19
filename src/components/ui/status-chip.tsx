import { CheckCircle2Icon, CircleIcon, InfoIcon, TriangleAlertIcon, XCircleIcon } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/** good = success, warn = check/wait, bad = drop/fail, neutral = grey, info = brand. */
export type Tone = "good" | "warn" | "bad" | "neutral" | "info"

const TONE: Record<Tone, { cls: string; Icon: typeof CheckCircle2Icon }> = {
  good: { cls: "bg-success-soft text-success", Icon: CheckCircle2Icon },
  warn: { cls: "bg-warn-soft text-warn-ink", Icon: TriangleAlertIcon },
  bad: { cls: "bg-danger-soft text-danger", Icon: XCircleIcon },
  neutral: { cls: "bg-neutral-soft text-neutral", Icon: CircleIcon },
  info: { cls: "bg-primary-soft text-primary-ink", Icon: InfoIcon },
}

/** A status as a round chip: always an icon as well as the colour. */
export function StatusChip({ tone, children, className, icon = true, title }: { tone: Tone; children: ReactNode; className?: string; icon?: boolean; title?: string }) {
  const { cls, Icon } = TONE[tone]
  return (
    <span data-slot="status-chip" data-tone={tone} title={title} className={cn("inline-flex h-6 w-fit flex-none items-center gap-1 rounded-full px-2.5 text-xs font-medium whitespace-nowrap", cls, className)}>
      {icon && <Icon className="size-3.5 flex-none" aria-hidden="true" />}
      {children}
    </span>
  )
}

// Every verdict word the app uses, by tone (phase 3 standardises the words themselves).
const GOOD = new Set(["pass", "buy", "ok", "good", "worked", "order samples", "go", "connected", "high", "done", "approved", "exported", "uploaded"])
const WARN = new Set(["warn", "wait", "check", "too early", "medium", "maybe", "pending", "stale", "low stock", "review"])
const BAD = new Set(["fail", "skip", "drop", "drop it", "out", "no demand", "did not work", "error", "failed", "rejected"])

/** The tone a verdict word takes. */
export function verdictTone(verdict: string | null | undefined): Tone {
  const v = (verdict ?? "").trim().toLowerCase()
  if (GOOD.has(v)) return "good"
  if (WARN.has(v)) return "warn"
  if (BAD.has(v)) return "bad"
  return "neutral"
}

/** One component for every verdict, the same colours and icons everywhere; the word is kept as given. */
export function Verdict({ verdict, tone, className, title }: { verdict: string; tone?: Tone; className?: string; title?: string }) {
  return <StatusChip tone={tone ?? verdictTone(verdict)} className={className} title={title}>{verdict}</StatusChip>
}
