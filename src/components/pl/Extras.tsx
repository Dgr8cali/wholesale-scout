"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { LaunchStep, PlStatus } from "@/lib/pl/launch";
import type { Quote } from "@/lib/pl/quotes";
import { api } from "@/lib/ui/client";
import { LaunchSection, type AdsSummary } from "./Launch";
import { ListingSection } from "./ListingSection";
import { QuotesSection, type QuotesCandidate } from "./Quotes";
import { SuppliersSection } from "./Suppliers";

interface Extras { quotes: Quote[]; steps: LaunchStep[]; listingAsin: string | null; chosenQuote: string | null; chosenLanded: number | null; ads: AdsSummary | null }

/**
 * A candidate's Suppliers, Quotes, Listing and Launch sections (Listing on the candidate itself only). Launch shows once the verdict is "Order samples" or
 * the candidate is at samples or launched (always on the Launch page).
 */
export function CandidateExtras({ c, status, verdictTitle, budget, show = "both", onFieldsChanged, onStatus }: {
  c: QuotesCandidate; status: PlStatus; verdictTitle: string; budget: number;
  show?: "both" | "quotes" | "launch";
  onFieldsChanged: () => void;
  onStatus: (s: PlStatus) => void;
}) {
  const [x, setX] = useState<Extras | null>(null);
  const [v, setV] = useState(0);
  const load = useCallback(() => api<Extras>(`/api/pl/candidates/${c.id}/extras`).then((r) => { setX(r); setV((n) => n + 1); }).catch(() => {}), [c.id]);
  useEffect(() => { load(); }, [load]);
  if (!x) return <Skeleton className="h-40 rounded-xl" />;
  const n = (k: string) => (c.fields[k]?.value ? Number(c.fields[k]!.value) : null);
  const units = n("units"), landed = n("landed");
  const plan = { stock: units != null && landed != null ? units * landed : null, samples: n("samples"), inspection: n("inspection"), photography: n("photography"), trademark: n("trademark"), launchAds: n("launchAds") };
  const launchOn = show === "launch" || (show === "both" && (verdictTitle === "Order samples" || status === "samples" || status === "launched"));
  return (
    <>
      {/* On Suppliers & quotes → Quotes the supplier table is the Suppliers tab, not repeated here. */}
      {show === "both" && <SuppliersSection candidateId={c.id} onQuoted={load} />}
      {show === "quotes" && <p className="text-sm"><Link className="font-medium text-primary hover:underline" href={`/pl/suppliers?candidate=${c.id}`}>{c.name}&apos;s Alibaba suppliers →</Link> <span className="text-muted-foreground">to message with the RFQ, then Add quote</span></p>}
      {show !== "launch" && <QuotesSection key={`q${v}`} c={c} quotes={x.quotes} chosenQuote={x.chosenQuote} onChanged={load} onFieldsChanged={() => { onFieldsChanged(); load(); }} />}
      {show === "both" && <ListingSection candidateId={c.id} />}
      {launchOn && (
        <LaunchSection key={`l${v}`} candidateId={c.id} status={status} steps={x.steps} listingAsin={x.listingAsin} ads={x.ads} plan={plan} budget={budget}
          onChanged={(s) => { if (s) onStatus(s); load(); }} />
      )}
    </>
  );
}
