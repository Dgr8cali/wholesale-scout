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
const GOOD = new Set(["pass", "buy", "ok", "in stock", "good", "worked", "order samples", "go", "connected", "high", "done", "approved", "exported", "uploaded"])
const WARN = new Set(["warn", "wait", "check", "low", "too early", "medium", "maybe", "pending", "stale", "low stock", "review"])
const BAD = new Set(["fail", "skip", "drop", "drop it", "out", "did not work", "error", "failed", "rejected"])

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

/*
 * The app's one verdict vocabulary (display only; stored values stay as they are). Sentence case,
 * always an icon as well as the colour.
 */

/** A wholesale product decision (a result's pass/warn/fail, or the product page's buy/wait/skip). */
export const PRODUCT_DECISION: Record<string, { label: string; tone: Tone }> = {
  pass: { label: "Buy", tone: "good" }, buy: { label: "Buy", tone: "good" },
  warn: { label: "Check", tone: "warn" }, wait: { label: "Check", tone: "warn" },
  fail: { label: "Skip", tone: "bad" }, skip: { label: "Skip", tone: "bad" },
}
/** A Gatekeeper gate's result (wholesale gates and Private label's gates and checks). */
export const GATE_RESULT: Record<string, { label: string; tone: Tone }> = {
  pass: { label: "Pass", tone: "good" }, warn: { label: "Check", tone: "warn" }, fail: { label: "Fail", tone: "bad" },
}
/** A Private label candidate's decision (Gatekeeper's verdict class). */
export const CANDIDATE_DECISION: Record<string, { label: string; tone: Tone }> = {
  pass: { label: "Order samples", tone: "good" }, warn: { label: "Check", tone: "warn" }, fail: { label: "Drop", tone: "bad" },
}
/** A stock item's level. */
export const STOCK_LEVEL: Record<string, { label: string; tone: Tone }> = {
  ok: { label: "In stock", tone: "good" }, low: { label: "Low", tone: "warn" }, out: { label: "Out", tone: "bad" },
}
export const NOT_SCORED = "Not scored"

/** The word for a value in one of the vocabularies above ("Not scored" when it has none). */
export const decisionLabel = (map: Record<string, { label: string }>, v: string | null | undefined) => (v && map[v]?.label) || NOT_SCORED

function VocabChip({ map, value, className, title, children }: { map: Record<string, { label: string; tone: Tone }>; value: string | null | undefined; className?: string; title?: string; children?: ReactNode }) {
  const m = value ? map[value] : undefined
  return <StatusChip tone={m?.tone ?? "neutral"} className={className} title={title}>{m?.label ?? NOT_SCORED}{children}</StatusChip>
}

/** Buy / Check / Skip (or Not scored). */
export const ProductDecision = (p: { verdict: string | null | undefined; className?: string; title?: string; children?: ReactNode }) => <VocabChip map={PRODUCT_DECISION} value={p.verdict} className={p.className} title={p.title}>{p.children}</VocabChip>
/** Pass / Check / Fail (or Not scored). */
export const GateResult = (p: { status: string | null | undefined; className?: string; title?: string }) => <VocabChip map={GATE_RESULT} value={p.status} className={p.className} title={p.title} />
/** Order samples / Check / Drop (or Not scored). */
export const CandidateDecision = (p: { cls: string | null | undefined; className?: string; title?: string }) => <VocabChip map={CANDIDATE_DECISION} value={p.cls} className={p.className} title={p.title} />
/** In stock / Low / Out. */
export const StockLevel = (p: { status: string | null | undefined; className?: string; title?: string }) => <VocabChip map={STOCK_LEVEL} value={p.status} className={p.className} title={p.title} />
