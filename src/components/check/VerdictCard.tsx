"use client";

import { ExternalLinkIcon, LoaderIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { ProductThumb } from "@/components/ProductThumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { VerdictCard as Card } from "@/lib/server/check";
import { monthsLabel } from "@/lib/screening/order";
import { gbp, pct } from "@/lib/ui/client";
import { amazonLastSeen } from "@/lib/ui/when";
import { cn } from "@/lib/utils";
import { Checked } from "./Checked";
import { ApplyKit } from "@/components/documents/ApplyKit";

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
export function VerdictCard({ card, onFetchAnyway }: { card: Card; onFetchAnyway?: () => Promise<void> }) {
  const [fetching, setFetching] = useState(false);
  const nf = card.notFetched ? `not fetched: failed at ${card.notFetched.label.toLowerCase()}` : null;
  const g = card.gating ? GATING[card.gating.status] ?? GATING.unknown : null;
  const verdict = card.verdict ?? (card.pending ? null : "fail");
  const seen = card.amazon && !card.amazon.sellingNow ? amazonLastSeen(card.amazon.lastSeenDays, card.amazon.lastSeenAt, card.checkedAt) : null;
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
          {!card.pending && <Checked at={card.checkedAt} recheck={card.recheck} />}
        </div>
        {card.gating?.applyUrl && (
          <div className="flex items-center gap-2">
            <ApplyKit brand={card.brand} applyUrl={card.gating.applyUrl} compact />
            <Button asChild size="sm" variant="outline">
              <a href={card.gating.applyUrl} target="_blank" rel="noreferrer">Apply to sell <ExternalLinkIcon /></a>
            </Button>
          </div>
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
        <Stat label="Sales / mo" note={nf ?? (card.sellers != null ? `${card.sellers} seller${card.sellers === 1 ? "" : "s"}` : undefined)}>{card.salesPerMonth ?? "—"}</Stat>
        <Stat label="Your share" note={nf ?? "per month"}>{card.yourSharePerMonth ?? "—"}</Stat>
        <Stat label="Months to sell" note={nf ?? (card.orderQty != null ? `first order ${card.orderQty}` : card.costKnown ? undefined : "needs a cost")}>
          {card.monthsToSell != null ? monthsLabel(card.monthsToSell) : "—"}
        </Stat>
        <Stat label="Amazon" text note={seen?.label}>
          {!card.amazon ? "—" : card.amazon.sellingNow ? <span className="text-fail">selling now</span> : card.amazon.lastSeenDays == null && card.keepaHistory ? "never" : "not now"}
        </Stat>
        <Stat label="Gating" text note={card.fees?.total != null ? `fees ${gbp(card.fees.total)}` : undefined}>
          {g ? <span className={cn(g.variant === "pass" && "text-pass", g.variant === "warn" && "text-warn", g.variant === "fail" && "text-fail")}>{g.label}</span> : "—"}
        </Stat>
      </div>
      {card.why && <p className="text-xs text-muted-foreground">{card.why}</p>}
      {card.notFetched && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs">
          <span>
            Stopped at <b>{card.notFetched.label}</b> before Keepa: Buy Box, offers and Amazon are from Amazon&apos;s current offers (free); sales,
            your share and history weren&apos;t fetched.
          </span>
          {onFetchAnyway && (
            <Button size="sm" variant="outline" disabled={fetching} onClick={async () => { setFetching(true); try { await onFetchAnyway(); } finally { setFetching(false); } }}>
              {fetching ? "Fetching…" : "Fetch anyway"}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
