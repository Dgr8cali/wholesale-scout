"use client"

import { Loader2Icon, UploadIcon } from "lucide-react"
import { useRef, useState, type ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * The one file drop zone: drop files on it, or click (or Enter/Space) to choose. `large` is a page's
 * main drop target; `compact` is a one-line control inside a form. It hands the FileList over as is;
 * what happens to the files is the caller's.
 */
export function FileDrop({
  onFiles, accept, multiple = false, title, hint, icon, busy = false, disabled = false, size = "large", className,
}: {
  onFiles: (files: FileList) => void
  accept?: string
  multiple?: boolean
  title: ReactNode
  hint?: ReactNode
  icon?: ReactNode
  busy?: boolean
  disabled?: boolean
  size?: "large" | "compact"
  className?: string
}) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const off = disabled || busy
  const open = () => { if (!off) input.current?.click() }
  return (
    <div
      role="button"
      tabIndex={off ? -1 : 0}
      aria-disabled={off || undefined}
      data-slot="file-drop"
      onClick={open}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open() } }}
      onDragOver={(e) => { e.preventDefault(); if (!off) setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (!off && e.dataTransfer.files.length) onFiles(e.dataTransfer.files) }}
      className={cn(
        "cursor-pointer border-2 border-dashed border-border-strong bg-card text-center transition-colors outline-none hover:border-primary hover:bg-primary-soft/40 focus-visible:ring-3 focus-visible:ring-ring/40",
        size === "large" ? "flex flex-col items-center gap-2 rounded-xl px-6 py-10" : "inline-flex max-w-full items-center gap-2 rounded-lg px-4 py-2.5 text-left text-sm",
        over && "border-primary bg-primary-soft",
        off && "cursor-not-allowed opacity-50 hover:border-border-strong hover:bg-card",
        className,
      )}
    >
      {size === "large" ? (
        <>
          <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary-ink [&_svg]:size-5">
            {busy ? <Loader2Icon className="animate-spin" /> : icon ?? <UploadIcon />}
          </span>
          <span className="section-title">{title}</span>
          {hint && <span className="max-w-2xl text-meta text-muted-foreground">{hint}</span>}
        </>
      ) : (
        <>
          <span className="flex-none text-muted-foreground [&_svg]:size-4">{busy ? <Loader2Icon className="animate-spin" /> : icon ?? <UploadIcon />}</span>
          <span className="min-w-0 truncate font-medium">{title}</span>
          {hint && <span className="hidden text-meta text-muted-foreground sm:inline">{hint}</span>}
        </>
      )}
      <input ref={input} type="file" accept={accept} multiple={multiple} hidden onChange={(e) => { if (e.target.files?.length) onFiles(e.target.files); e.target.value = "" }} />
    </div>
  )
}
