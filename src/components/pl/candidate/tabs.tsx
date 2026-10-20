"use client";

import { useCallback, useEffect, useState } from "react";
import { ErrorState } from "@/components/States";
import { Skeleton } from "@/components/ui/skeleton";
import { capitalFor } from "@/lib/pl/gatekeeper";
import type { LaunchStep, PlStatus } from "@/lib/pl/launch";
import type { Quote } from "@/lib/pl/quotes";
import { api } from "@/lib/ui/client";
import { LaunchSection, type AdsSummary } from "../Launch";
import { ListingSection } from "../ListingSection";
import { QuotesSection } from "../Quotes";
import { ReviewMiner } from "../ReviewMiner";
import { SuppliersSection } from "../Suppliers";
import { valuesOf } from "../types";
import { CriticalReviewsTable } from "./parts";
import type { CandidateState } from "./useCandidate";

export interface Extras { quotes: Quote[]; steps: LaunchStep[]; listingAsin: string | null; chosenQuote: string | null; chosenLanded: number | null; ads: AdsSummary | null }

/** The candidate's quotes, launch checklist, listing ASIN and ads figures (`/extras`), for the tabs that show them. */
export function useExtras(id: string) {
  const [x, setX] = useState<Extras | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api<Extras>(`/api/pl/candidates/${id}/extras`).then((r) => { setX(r); setError(null); }, (e: Error) => setError(e.message)), [id]);
  useEffect(() => { void load(); }, [load]);
  return { x, error, load };
}

const wait = <div className="space-y-3"><Skeleton className="h-40 rounded-[14px]" /><Skeleton className="h-64 rounded-[14px]" /></div>;

/** Reviews: Gate 4's review miner (pasted and extension-captured reviews, themes, the AI summary) and each listing's critical reviews. */
export function ReviewsTab({ s }: { s: CandidateState }) {
  const { data, fields, saveField, reload } = s;
  if (s.error && !data) return <ErrorState title="Couldn't load the candidate" message={s.error} onRetry={s.load} />;
  if (!data) return wait;
  return (
    <div className="space-y-4">
      <ReviewMiner candidateId={data.candidate.id} asins={data.asins} product={data.candidate.niche_keyword || data.candidate.name} fields={fields} onSave={saveField} onAsinsChanged={async () => { await reload(); }} />
      {data.asins.length > 0 && (
        <section className="panel space-y-2 p-4">
          <h2 className="text-base font-semibold">Critical reviews by listing</h2>
          <CriticalReviewsTable asins={data.asins} />
        </section>
      )}
    </div>
  );
}

/** Suppliers & quotes: the shared Alibaba supplier table for this candidate, then its quotes. */
export function SuppliersTab({ id, s, onChanged }: { id: string; s: CandidateState; onChanged: () => void }) {
  const { data, fields, reload } = s;
  const e = useExtras(id);
  if (s.error && !data) return <ErrorState title="Couldn't load the candidate" message={s.error} onRetry={s.load} />;
  if (!data || !e.x) return wait;
  const c = data.candidate;
  const refresh = () => { void e.load(); onChanged(); };
  return (
    <div className="space-y-4">
      <SuppliersSection candidateId={c.id} onQuoted={refresh} />
      <QuotesSection c={{ id: c.id, name: c.name, niche_keyword: c.niche_keyword, category: c.category, sell: fields.sell?.value ? Number(fields.sell.value) : null, fields }}
        quotes={e.x.quotes} chosenQuote={e.x.chosenQuote} onChanged={refresh} onFieldsChanged={() => { void reload(); refresh(); }} />
    </div>
  );
}

/** Listing: the Listing Writer, unchanged. */
export function ListingTab({ id }: { id: string }) {
  return <ListingSection candidateId={id} />;
}

/** Launch: the checklist from samples to the first review, the listing ASIN and the budget against Gate 7. */
export function LaunchTab({ id, s, onChanged }: { id: string; s: CandidateState; onChanged: () => void }) {
  const { data, fields } = s;
  const e = useExtras(id);
  if (s.error && !data) return <ErrorState title="Couldn't load the candidate" message={s.error} onRetry={s.load} />;
  if (!data || !e.x) return wait;
  const num = (k: string) => (fields[k]?.value ? Number(fields[k]!.value) : null);
  const units = num("units"), landed = num("landed");
  const plan = { stock: units != null && landed != null ? units * landed : null, samples: num("samples"), inspection: num("inspection"), photography: num("photography"), trademark: num("trademark"), launchAds: num("launchAds") };
  return (
    <LaunchSection candidateId={data.candidate.id} status={data.candidate.status as PlStatus} steps={e.x.steps} listingAsin={e.x.listingAsin} ads={e.x.ads}
      plan={plan} budget={capitalFor(valuesOf(fields), data.settings).amount} onChanged={() => { void e.load(); onChanged(); }} />
  );
}
