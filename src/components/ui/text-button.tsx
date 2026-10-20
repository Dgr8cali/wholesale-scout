import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * An action inside a sentence or a row's small print ("Edit", "Remove waiver", "all · none"):
 * `link` is teal and underlined like a link, `plain` is body text underlined on hover (a name that opens its record), `quiet` is muted until hovered, `danger` red.
 * Anything that sits on its own is a Button instead.
 */
function TextButton({ tone = "link", className, type = "button", ...props }: React.ComponentProps<"button"> & { tone?: "link" | "plain" | "quiet" | "danger" }) {
  return (
    <button
      data-slot="text-button"
      // Kept when a trigger's asChild takes over data-slot: marks an inline text action.
      data-text-button=""
      type={type}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1 rounded-sm text-left disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-3.5 [&_svg]:shrink-0",
        tone === "link" && "link",
        tone === "plain" && "hover:underline",
        tone === "quiet" && "text-muted-foreground hover:text-foreground",
        tone === "danger" && "text-muted-foreground hover:text-danger",
        className,
      )}
      {...props}
    />
  )
}

export { TextButton }
