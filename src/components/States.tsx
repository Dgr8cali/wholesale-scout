import { AlertTriangleIcon, RotateCwIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Nothing here yet: an icon, what's missing, what to do about it. */
export function EmptyState({ icon, title, children, action, className }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("panel flex flex-col items-center gap-3 px-6 py-14 text-center", className)}>
      {icon && <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-5">{icon}</span>}
      <div className="max-w-md">
        <p className="section-title">{title}</p>
        {children && <p className="mt-1 text-sm text-muted-foreground">{children}</p>}
      </div>
      {action}
    </div>
  );
}

/** Something failed to load: what, why, and a way to try again. */
export function ErrorState({ title = "Something went wrong", message, onRetry, action, className }: { title?: ReactNode; message?: ReactNode; onRetry?: () => void; action?: ReactNode; className?: string }) {
  return (
    <div role="alert" className={cn("panel flex flex-col items-center gap-3 border-fail/30 px-6 py-12 text-center", className)}>
      <span className="flex size-12 items-center justify-center rounded-full bg-fail-soft text-fail"><AlertTriangleIcon className="size-5" /></span>
      <div className="max-w-lg">
        <p className="section-title">{title}</p>
        {message && <p className="mt-1 text-sm break-words text-muted-foreground">{message}</p>}
      </div>
      <div className="flex gap-2">
        {onRetry && <Button variant="outline" onClick={onRetry}><RotateCwIcon /> Try again</Button>}
        {action}
      </div>
    </div>
  );
}
