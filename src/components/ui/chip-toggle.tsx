import { XIcon } from "lucide-react"
import * as React from "react"

import { cn } from "@/lib/utils"

/** A round on/off chip (a filter's "Hide flagged: Spike", "Stock only"): aria-pressed, teal when on. */
function ChipToggle({ pressed, onPressedChange, className, children, ...props }: Omit<React.ComponentProps<"button">, "onChange"> & { pressed: boolean; onPressedChange: (pressed: boolean) => void }) {
  return (
    <button
      data-slot="chip-toggle"
      type="button"
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        "inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors max-sm:min-h-11 [&_svg]:size-3.5",
        pressed ? "border-primary bg-primary-soft text-primary-ink" : "border-border text-muted-foreground hover:bg-subtle hover:text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

/** A chip that removes what it names on click (an active filter, a picked brand). */
function ChipRemove({ label, className, children, ...props }: React.ComponentProps<"button"> & { label: string }) {
  return (
    <button
      data-slot="chip-remove"
      type="button"
      aria-label={label}
      className={cn("inline-flex min-h-7 cursor-pointer items-center gap-1 rounded-full bg-primary-soft px-2.5 text-xs font-medium text-primary-ink hover:bg-primary-soft/70 max-sm:min-h-11", className)}
      {...props}
    >
      {children}
      <XIcon className="size-3" aria-hidden />
    </button>
  )
}

export { ChipRemove, ChipToggle }
