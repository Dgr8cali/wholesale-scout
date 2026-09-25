"use client";

import { ChevronDownIcon, ChevronUpIcon, XIcon } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { ProductThumb } from "@/components/ProductThumb";
import { VerdictBadge } from "@/components/VerdictBadge";
import { Button } from "@/components/ui/button";
import type { Sparks } from "@/lib/sparkline";
import { RestrictionLink } from "@/lib/ui/RestrictionLink";
import { gbp, pct } from "@/lib/ui/client";
import { brandOf, dormantOf } from "@/lib/ui/resultRows";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Sparkline } from "./Sparkline";
import { titleOf, type Result } from "./types";

/**
 * A result's details in a panel on the right, beside the table rather than over a backdrop.
 * Up/Down (or K/J) step through the rows shown; Escape closes.
 */
export function DetailDrawer({ r, index, count, sparks, onStep, onClose, children }: {
  r: Result;
  index: number;
  count: number;
  sparks: Sparks | null | undefined;
  onStep: (by: -1 | 1) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [r.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector("[role=dialog],[role=alertdialog]")) return;
      if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); onStep(1); }
      else if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); onStep(-1); }
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onStep, onClose]);

  const money = (label: string, v: ReactNode, cls?: string) => (
    <div className="rounded-lg bg-muted/60 px-2.5 py-1.5">
      <p className="text-2xs text-muted-foreground">{label}</p>
      <p className={cn("num text-sm font-semibold", cls)}>{v}</p>
    </div>
  );

  return (
    <aside aria-label="Result details" className="fixed top-(--app-header) right-0 bottom-0 z-40 flex w-full max-w-[28rem] flex-col border-l bg-background shadow-2xl">
      <div className="flex flex-none items-center gap-1 border-b px-3 py-2">
        <Button variant="ghost" size="icon-sm" aria-label="Previous row (Up)" disabled={index <= 0} onClick={() => onStep(-1)}><ChevronUpIcon /></Button>
        <Button variant="ghost" size="icon-sm" aria-label="Next row (Down)" disabled={index >= count - 1} onClick={() => onStep(1)}><ChevronDownIcon /></Button>
        <span className="num text-xs text-muted-foreground" aria-live="polite">{index + 1} of {count}</span>
        <span className="ml-2 hidden text-2xs text-muted-foreground sm:inline">↑ ↓ to step · Esc to close</span>
        <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label="Close details" onClick={onClose}><XIcon /></Button>
      </div>
      <div ref={body} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="flex gap-3">
          <ProductThumb url={r.product?.image_url} asin={r.product?.asin} title={titleOf(r)} brand={brandOf(r)} size={72} />
          <div className="min-w-0">
            <h2 className="section-title leading-snug">{titleOf(r)}</h2>
            <p className="num mt-0.5 text-xs text-muted-foreground">
              {[brandOf(r), r.product?.ean].filter(Boolean).join(" · ")}
              {r.product?.asin && <> · <a className="text-brand hover:underline" href={`https://www.amazon.co.uk/dp/${r.product.asin}`} target="_blank" rel="noreferrer">{r.product.asin}</a></>}
            </p>
            {r.offer?.supplier && <p className="text-xs text-muted-foreground">{r.offer.supplier.name}</p>}
            <div className="mt-1.5 flex items-center gap-2">
              <VerdictBadge verdict={r.verdict} error={r.status === "error"} />
              {dormantOf(r) && <Badge variant="muted">dormant</Badge>}
              {r.score != null && <span className="num text-xs text-muted-foreground">score {Math.round(r.score)}{r.band ? ` · ${r.band}` : ""}</span>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {money("Sell", gbp(r.sell_price))}
          {money("Profit", gbp(r.profit), r.profit != null && r.profit < 0 ? "text-fail" : undefined)}
          {money("ROI", pct(r.roi))}
          {money("Margin", pct(r.margin))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="eyebrow mb-1">Sales rank, 90 days</p>
            {sparks === undefined ? <div className="h-9 animate-pulse rounded bg-muted" /> : <Sparkline values={sparks?.rank} invert width={190} height={36} label="Sales rank over 90 days; up is a better rank" />}
          </div>
          <div>
            <p className="eyebrow mb-1">Buy Box, 90 days</p>
            {sparks === undefined ? <div className="h-9 animate-pulse rounded bg-muted" /> : <Sparkline values={sparks?.buyBox} width={190} height={36} label="Buy Box price over 90 days" />}
          </div>
        </div>

        <p className="text-sm leading-snug">
          {r.status === "error" ? r.error : r.why}
          <RestrictionLink outcomes={r.gate_outcomes} asin={r.product?.asin} />
        </p>

        {children}
      </div>
    </aside>
  );
}
