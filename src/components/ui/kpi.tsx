import Link from "next/link"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/** A figure (a number, £, %): shown in Plex Mono. */
const isFigure = (v: ReactNode) => (typeof v === "number" || typeof v === "string") && /^[-+£$€≈~\s]*[\d.,]+[\s%kKmM×]*$/.test(String(v))

/** A key figure: label, the value (mono when it's a figure), one line of context; a link when it leads somewhere. */
export function Kpi({ label, value, hint, icon, href, className }: { label: ReactNode; value: ReactNode; hint?: ReactNode; icon?: ReactNode; href?: string; className?: string }) {
  const body = (
    <div data-slot="kpi" className={cn("panel flex h-full items-start gap-3 p-4 transition-colors", href && "hover:border-border-strong", className)}>
      {icon && <span className="flex size-9 flex-none items-center justify-center rounded-lg bg-primary-soft text-primary-ink [&_svg]:size-4">{icon}</span>}
      <div className="min-w-0">
        <p className="text-meta text-muted-foreground">{label}</p>
        <p className={cn("stat-value mt-0.5 truncate", isFigure(value) && "num")}>{value}</p>
        {hint && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  )
  return href ? <Link href={href} className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/40">{body}</Link> : body
}
