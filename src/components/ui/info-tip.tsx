"use client"

import { CircleHelpIcon } from "lucide-react"
import type { ReactNode } from "react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

/**
 * A small "?" that opens the long explanation a page or a field used to print as a paragraph.
 * The page keeps one subtitle line; everything else lives here.
 */
export function InfoTip({ children, label = "More about this", className, align = "start" }: { children: ReactNode; label?: string; className?: string; align?: "start" | "center" | "end" }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn("inline-flex size-6 flex-none cursor-pointer items-center justify-center rounded-full max-sm:-m-2.5 max-sm:size-11 text-muted-foreground transition-colors outline-none hover:bg-subtle hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40 [&_svg]:size-4", className)}
        >
          <CircleHelpIcon />
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-[min(26rem,calc(100vw-2rem))] space-y-2 text-sm leading-relaxed text-foreground [&_p+p]:mt-2">
        {children}
      </PopoverContent>
    </Popover>
  )
}

/** A section's small uppercase heading, with its explanation in an InfoTip instead of a paragraph. */
export function SectionTitle({ title, children, className }: { title: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <h2 className="section-label">{title}</h2>
      {children && <InfoTip label={typeof title === "string" ? `About ${title}` : "More about this"}>{children}</InfoTip>}
    </div>
  )
}
