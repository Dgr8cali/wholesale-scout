import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * A whole row that's one action: a choice in a list or popover (a product to pick, a suggested
 * question), or a heading that opens its row's detail. Left-aligned, full width, a hover surface.
 */
function ListButton({ className, type = "button", ...props }: React.ComponentProps<"button">) {
  return (
    <button
      data-slot="list-button"
      type={type}
      className={cn(
        "flex min-h-9 w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-left text-sm max-sm:min-h-11 hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-50 aria-selected:bg-primary-soft aria-selected:text-primary-ink",
        className,
      )}
      {...props}
    />
  )
}

export { ListButton }
