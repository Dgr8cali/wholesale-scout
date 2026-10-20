import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

/*
 * Loading placeholders in the shape of what's coming, so nothing jumps when the data lands: a table
 * (DataTable's header and rows; cards on a phone), a row of key figures, a panel of lines, a form.
 * Each says "Loading" to screen readers once.
 */

/** A DataTable while it loads: the card, a header row and `rows` rows (cards on a phone). */
export function TableSkeleton({ rows = 8, columns = 6, className }: { rows?: number; columns?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={cn("panel overflow-hidden", className)}>
      <div className="hidden sm:block">
        <div className="flex gap-4 border-b border-border px-3 py-3">
          {Array.from({ length: columns }, (_, i) => <Skeleton key={i} className={cn("h-3", i === 0 ? "w-40" : "w-16", i > 0 && "ml-auto")} />)}
        </div>
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="flex items-center gap-4 border-b border-divider px-3 py-3 last:border-b-0">
            {Array.from({ length: columns }, (_, i) => <Skeleton key={i} className={cn("h-4", i === 0 ? "w-48 max-w-[40%]" : "w-14", i > 0 && "ml-auto")} />)}
          </div>
        ))}
      </div>
      <ul className="divide-y divide-divider sm:hidden">
        {Array.from({ length: Math.min(rows, 5) }, (_, r) => (
          <li key={r} className="space-y-2 px-3 py-3">
            <Skeleton className="h-4 w-3/4" />
            <div className="flex gap-3"><Skeleton className="h-3 w-16" /><Skeleton className="h-3 w-16" /><Skeleton className="h-3 w-16" /></div>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** A row of Kpi tiles (two a row on a phone). */
export function KpiSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={cn("grid grid-cols-2 gap-3", count >= 4 && "lg:grid-cols-4", count === 3 && "sm:grid-cols-3", count >= 5 && "sm:grid-cols-5", className)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="panel space-y-2 p-3 sm:p-4"><Skeleton className="h-3 w-20" /><Skeleton className="h-6 w-24" /><Skeleton className="h-3 w-28" /></div>
      ))}
    </div>
  )
}

/** A panel of text lines (a card, a section, a chart's place). */
export function PanelSkeleton({ lines = 4, height, className }: { lines?: number; height?: string; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={cn("panel space-y-3 p-4", height, className)}>
      <Skeleton className="h-4 w-40" />
      {Array.from({ length: lines }, (_, i) => <Skeleton key={i} className={cn("h-3", i % 3 === 2 ? "w-2/3" : "w-full")} />)}
    </div>
  )
}

/** A settings or entry form: labels above inputs. */
export function FormSkeleton({ fields = 4, className }: { fields?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={cn("panel space-y-5 p-4 sm:p-5", className)}>
      <Skeleton className="h-4 w-48" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: fields }, (_, i) => (
          <div key={i} className="space-y-1.5"><Skeleton className="h-3 w-24" /><Skeleton className="h-10 w-full rounded-lg" /></div>
        ))}
      </div>
    </div>
  )
}

/** A short list (recent items, documents, a history). */
export function ListSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={cn("space-y-2", className)}>
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-9 w-full rounded-lg" />)}
    </div>
  )
}
