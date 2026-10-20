import * as React from "react"

import { cn } from "@/lib/utils"

/** One step of a stepper (Gates 0–7, the launch steps, an upload's steps): aria-current on the one shown. */
function StepButton({ current, done, className, type = "button", ...props }: React.ComponentProps<"button"> & { current?: boolean; done?: boolean }) {
  return (
    <button
      data-slot="step-button"
      type={type}
      aria-current={current ? "step" : undefined}
      data-done={done || undefined}
      className={cn(
        "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-meta font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50 max-sm:min-h-11 [&_svg]:size-3.5 [&_svg]:shrink-0",
        current ? "border-primary bg-primary-soft text-primary-ink" : "border-border text-muted-foreground hover:bg-subtle hover:text-foreground",
        className,
      )}
      {...props}
    />
  )
}

export { StepButton }
