"use client"

import type { ReactNode } from "react"

import { usePageCrumbs, type Crumb } from "@/components/Crumbs"
import { InfoTip } from "@/components/ui/info-tip"
import { cn } from "@/lib/utils"

/**
 * The top of every page: the breadcrumb (shown above the title by the shell, from `crumbs`), the
 * title (the same words as the menu item), at most one subtitle line, an optional InfoTip for the
 * long explanation, and the page's primary action on the right. The primary action lives here only.
 */
export function PageHeader({ title, subtitle, info, actions, crumbs, className }: {
  title: ReactNode
  subtitle?: ReactNode
  info?: ReactNode
  actions?: ReactNode
  crumbs?: Crumb[]
  className?: string
}) {
  usePageCrumbs(crumbs ?? null)
  return (
    <header data-slot="page-header" className={cn("flex flex-wrap items-start justify-between gap-x-6 gap-y-3", className)}>
      {/* At least 16rem before it shares the row: on a phone the actions wrap below instead of squeezing the title. */}
      <div className="min-w-0 flex-[1_1_16rem]">
        <div className="flex items-center gap-1.5">
          <h1 className="page-title">{title}</h1>
          {info && <InfoTip label={`About ${typeof title === "string" ? title : "this page"}`}>{info}</InfoTip>}
        </div>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground sm:truncate">{subtitle}</p>}
      </div>
      {actions && <div className="flex max-w-full min-w-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
