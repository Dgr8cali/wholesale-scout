"use client";

import { ExternalLinkIcon, LoaderIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ProductThumb } from "@/components/ProductThumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { VerdictCard as Card } from "@/lib/server/check";
import { monthsLabel } from "@/lib/screening/order";
import { gbp, pct } from "@/lib/ui/client";
import { cn } from "@/lib/utils";

const GATING: Record<string, { label: string; variant: "pass" | "warn" | "fail" | "muted" }> = {
  open: { label: "Open", variant: "pass" },
  approval_required: { label: "Approval needed", variant: "warn" },
  blocked: { label: "Blocked", variant: "fail" },
  unknown: { label: "Unknown", variant: "muted" },
};

function Stat({ label, children, note, strong, text }: { label: string; children: ReactNode; note?: ReactNode; strong?: boolean; text?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("truncate text-sm", !text && "num", strong && "text-base font-semibold")}>{children}</p>
      {note && <p className="line-clamp-2 text-2xs text-muted-foreground">{note}</p>}
    </div>
  );
}

/** A check's verdict at a glance: verdict, score, profit, hurdle, share, months, gating. */
export function VerdictCard({ card }: { card: Card }) {
  const g = card.gating ? GATING[card.gating.status] ?? GATING.unknown : null;
  const verdict = card.verdict ?? (card.pending ? null : "fail");
  return (
    <section className="panel space-y-3 p-4" aria-label="Verdict">
      <div className="flex flex-wrap items-start gap-3">
        <ProductThumb url={card.imageUrl} asin={card.asin} title={card.title ?? card.asin ?? ""} brand={null} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {verdict
              ? <Badge variant={verdict} className="text-sm uppercase">{verdict}</Badge>
              : <Badge variant="muted"><LoaderIcon className="animate-spin" /> Screening</Badge>}
            {card.score != null && (
              <Badge variant={card.band === "green" ? "pass" : card.band === "amber" ? "warn" : "muted"} title="Win score">Score {Math.round(card.score)}</Badge>
            )}
            {card.pending && card.verdict && <Badge variant="muted" title="More data is still coming in"><LoaderIcon className="animate-spin" /> updating</Badge>}
            {!card.keepaHistory && !card.pending && <Badge variant="muted" title="Sales, history and Amazon presence need Keepa">no Keepa history</Badge>}
          </div>
          <p className="mt-1 line-clamp-2 text-sm font-medium">{card.title ?? card.asin}</p>
          <p className="text-xs text-muted-foreground">
            {card.asin}{card.ean ? ` · EAN ${card.ean}` : ""}
            {card.amazonUrl && <> · <a className="inline-flex items-center gap-0.5 underline-offset-2 hover:underline" href={card.amazonUrl} target="_blank" rel="noreferrer">Amazon <ExternalLinkIcon className="size-3" /></a></>}
          </p>
        </div>
        {card.gating?.applyUrl && (
          <Button asChild size="sm" variant="outline">
            <a href={card.gating.applyUrl} target="_blank" rel="noreferrer">Apply to sell <ExternalLinkIcon /></a>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 lg:grid-cols-8">
        <Stat label={card.costKnown ? `Profit at ${gbp(card.landed)}` : "Profit"} strong
          note={card.costKnown ? (card.roi != null ? `${pct(card.roi)} ROI · ${pct(card.margin)} margin` : undefined) : "no cost given"}>
          {card.costKnown ? gbp(card.profit) : "—"}
        </Stat>
        <Stat label={card.hurdle.kind === "landed" ? "Max landed" : "Hurdle"} strong
          note={card.hurdle.kind === "landed" ? "clears the floors at or under" : "sell price that clears the floors"}>
          {gbp(card.hurdle.value)}
        </Stat>
        <Stat label="Sells at" note={card.priceSource ?? undefined}>{gbp(card.sellPrice)}</Stat>
        <Stat label="Sales / mo" note={card.sellers != null ? `${card.sellers} seller${card.sellers === 1 ? "" : "s"}` : undefined}>{card.salesPerMonth ?? "—"}</Stat>
        <Stat label="Your share" note="per month">{card.yourSharePerMonth ?? "—"}</Stat>
        <Stat label="Months to sell" note={card.orderQty != null ? `first order ${card.orderQty}` : card.costKnown ? undefined : "needs a cost"}>
          {card.monthsToSell != null ? monthsLabel(card.monthsToSell) : "—"}
        </Stat>
        <Stat label="Amazon" text note={card.amazon?.lastSeenDays != null && !card.amazon.sellingNow ? `last seen ${card.amazon.lastSeenDays} days ago` : undefined}>
          {!card.amazon ? "—" : card.amazon.sellingNow ? <span className="text-fail">selling now</span> : card.amazon.lastSeenDays == null && card.keepaHistory ? "never" : "not now"}
        </Stat>
        <Stat label="Gating" text note={card.fees?.total != null ? `fees ${gbp(card.fees.total)}` : undefined}>
          {g ? <span className={cn(g.variant === "pass" && "text-pass", g.variant === "warn" && "text-warn", g.variant === "fail" && "text-fail")}>{g.label}</span> : "—"}
        </Stat>
      </div>
      {card.why && <p className="text-xs text-muted-foreground">{card.why}</p>}
    </section>
  );
}
