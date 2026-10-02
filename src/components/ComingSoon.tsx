import type { ReactNode } from "react";

/** A workspace page that's planned but not built yet: what it will do, and what it's waiting on. */
export function ComingSoon({ title, what, children, note }: { title: string; what: string; children?: ReactNode; note?: ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="page-title">{title}</h1>
        <span className="rounded-full bg-empty-soft px-2 py-0.5 text-xs font-semibold text-empty">Coming soon</span>
      </div>
      <section className="panel max-w-3xl space-y-3 p-5">
        <p className="text-sm">{what}</p>
        {children}
        {note && <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted-foreground">{note}</p>}
      </section>
    </div>
  );
}
