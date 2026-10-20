"use client";

import { AlertTriangleIcon, RotateCwIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Nothing here yet: an icon (the logo when none fits better), a title, one line on what to do,
 * and one action button.
 */
export function EmptyState({ icon, title, children, action, className }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div data-slot="empty-state" className={cn("panel flex flex-col items-center gap-3 px-6 py-12 text-center", className)}>
      {icon ? <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary-ink [&_svg]:size-5">{icon}</span> : <Logo size={40} className="opacity-90" />}
      <div className="max-w-md">
        <p className="section-title">{title}</p>
        {children && <p className="mt-1 text-sm text-muted-foreground">{children}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/**
 * Something failed to load: what, why, and Try again (the given retry, else reloading the page).
 * `compact`: one line inside a page that's otherwise working (a refresh or a step that failed), with
 * Try again only when there's something to retry.
 */
export function ErrorState({ title = "Something went wrong", message, onRetry, action, className, compact = false }: { title?: ReactNode; message?: ReactNode; onRetry?: () => void; action?: ReactNode; className?: string; compact?: boolean }) {
  const retry = onRetry ?? (() => window.location.reload());
  if (compact) {
    return (
      <div role="alert" className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger", className)}>
        <AlertTriangleIcon className="size-4 flex-none" aria-hidden />
        <p className="min-w-0 flex-1 break-words"><span className="font-medium">{title}</span>{message && <>: {message}</>}</p>
        {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}><RotateCwIcon /> Try again</Button>}
        {action}
      </div>
    );
  }
  return (
    <div role="alert" className={cn("panel flex flex-col items-center gap-3 border-danger/30 px-6 py-12 text-center", className)}>
      <span className="flex size-12 items-center justify-center rounded-full bg-danger-soft text-danger"><AlertTriangleIcon className="size-5" /></span>
      <div className="max-w-lg">
        <p className="section-title">{title}</p>
        {message && <p className="mt-1 text-sm break-words text-muted-foreground">{message}</p>}
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={retry}><RotateCwIcon /> Try again</Button>
        {action}
      </div>
    </div>
  );
}
