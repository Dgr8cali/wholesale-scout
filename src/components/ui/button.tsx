import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2Icon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

/**
 * Buttons: primary (one per page, in the PageHeader), secondary, ghost and danger (every delete,
 * always behind a confirm). Sizes: default 40px, sm 32px. Disabled is 50% opacity with a
 * not-allowed cursor and no spinner; `loading` shows the spinner, adds "…" and disables.
 * The older names still work: default = primary, outline = secondary, destructive = danger.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground not-disabled:hover:bg-primary-hover",
        default: "bg-primary text-primary-foreground not-disabled:hover:bg-primary-hover",
        secondary: "border-border-strong bg-card text-foreground not-disabled:hover:bg-subtle aria-expanded:bg-subtle",
        outline: "border-border-strong bg-card text-foreground not-disabled:hover:bg-subtle aria-expanded:bg-subtle",
        ghost: "text-foreground not-disabled:hover:bg-subtle aria-expanded:bg-subtle",
        danger: "border-danger/25 bg-danger-soft text-danger not-disabled:hover:border-danger/50 focus-visible:border-danger/50 focus-visible:ring-danger/25",
        destructive: "border-danger/25 bg-danger-soft text-danger not-disabled:hover:border-danger/50 focus-visible:border-danger/50 focus-visible:ring-danger/25",
        link: "h-auto! px-0! text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 gap-2 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        sm: "h-8 gap-1.5 px-3 text-meta has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        xs: "h-7 gap-1 rounded-md px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        lg: "h-11 gap-2 px-5 text-base",
        icon: "size-10",
        "icon-xs": "size-7 rounded-md [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-8",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
)

/** "Save" → "Save…" while loading (text children only). */
const withEllipsis = (children: React.ReactNode): React.ReactNode => {
  if (typeof children === "string") return children.endsWith("…") ? children : `${children}…`
  if (Array.isArray(children)) {
    const last = children.length - 1
    return children.map((c, i) => (i === last && typeof c === "string" ? withEllipsis(c) : c))
  }
  return children
}

function Button({
  className,
  variant = "primary",
  size = "default",
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /** Busy: a spinner, "…" after the label, and disabled. */
    loading?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"
  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-loading={loading || undefined}
      aria-busy={loading || undefined}
      disabled={asChild ? undefined : disabled || loading}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {loading && !asChild ? <><Loader2Icon className="animate-spin" aria-hidden="true" />{withEllipsis(children)}</> : children}
    </Comp>
  )
}

export { Button, buttonVariants }
