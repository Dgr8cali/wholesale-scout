import { ArrowDownIcon, ArrowUpIcon } from "lucide-react"
import * as React from "react"

import { cn } from "@/lib/utils"

/** A column header's sort control: the label and an arrow on the sorted column (numbers' arrows lead). */
function SortButton({ sorted: dir, numeric, className, children, type = "button", ...props }: React.ComponentProps<"button"> & { sorted: "asc" | "desc" | null | false; numeric?: boolean }) {
  return (
    <button
      data-slot="sort-button"
      type={type}
      title="Sort by this column (click again to reverse)"
      className={cn("inline-flex cursor-pointer items-center gap-1 rounded-sm hover:text-foreground max-sm:min-h-11", numeric && "flex-row-reverse", dir && "text-foreground", className)}
      {...props}
    >
      <span>{children}</span>
      {dir === "asc" ? <ArrowUpIcon className="size-3" aria-hidden /> : dir === "desc" ? <ArrowDownIcon className="size-3" aria-hidden /> : <span className="inline-block size-3" aria-hidden />}
    </button>
  )
}

export { SortButton }
