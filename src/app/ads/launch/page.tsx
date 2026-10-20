"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { asinOf } from "@/components/ads/ProductPicker";
import { LaunchExport, LaunchForm, LaunchPlan, useLaunchBuilder } from "@/components/ads/LaunchBuilder";
import { ErrorState } from "@/components/States";
import { PageHeader } from "@/components/ui/page-header";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { FormSkeleton, TableSkeleton } from "@/components/ui/skeletons";

/** Ads → Launch: a product's four launch campaigns as a bulk Create sheet, with the 60-day plan. */
export default function AdsLaunchPage() {
  return <Suspense><AdsLaunch /></Suspense>;
}

function AdsLaunch() {
  // The URL is the source of truth: ?candidateId=… (with its ?asin=) or ?asin=…; "Start from" shows it and rewrites it.
  const params = useSearchParams();
  const router = useRouter();
  const candidateId = params.get("candidateId") ?? "";
  const urlAsin = asinOf(params.get("asin"));
  const source = candidateId ? `cand:${candidateId}` : urlAsin ? `asin:${urlAsin}` : "";
  const pickSource = (v: string) => {
    const [k, id] = v.split(":");
    router.replace(k === "asin" ? `/ads/launch?asin=${id}` : k === "cand" ? `/ads/launch?candidateId=${encodeURIComponent(id)}` : "/ads/launch", { scroll: false });
  };
  const b = useLaunchBuilder(candidateId, urlAsin);
  const { pick, form, error } = b;

  if (error) return <ErrorState title="Couldn't load the launcher" message={error} />;
  if (!pick || !form) return <div className="space-y-6"><FormSkeleton fields={6} /><TableSkeleton rows={4} columns={5} /></div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Launch"
        crumbs={[{ label: "Ads", href: "/ads/dashboard" }, { label: "Launch" }]}
        subtitle="Four launch campaigns for a new product, as one bulk sheet to upload in Amazon Ads."
        info={<>
          <p><b>Auto</b> (close match and substitutes on, loose match and complements off), <b>Broad</b> research on the head terms (bid × 0.8), <b>Exact</b> on the head terms (bid × 1.0) and <b>product targeting</b> on competitors (bid × 0.9). Budget split 30 / 20 / 40 / 10; top-of-search adjustment 0% to start.</p>
          <p>Creating the sheet saves it under Bulk exports, puts the product in its launch phase (weeks 1–2: the rules propose harvests and negatives only) and shows the 60-day plan on the dashboard. A private-label candidate&apos;s Launch tab has the same builder, after its checklist and stock check.</p>
        </>}
      />
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1"><span className="field-label">Start from</span>
          <NativeSelect value={source} onChange={(e) => pickSource(e.target.value)} aria-label="Start from">
            <NativeSelectOption value="">— pick a product —</NativeSelectOption>
            {urlAsin && !candidateId && !pick.products.some((p) => p.asin === urlAsin) && <NativeSelectOption value={`asin:${urlAsin}`}>{urlAsin} · not an Ads product yet</NativeSelectOption>}
            {candidateId && !pick.candidates.some((c) => c.id === candidateId) && <NativeSelectOption value={`cand:${candidateId}`}>A candidate that isn&apos;t listed</NativeSelectOption>}
            <optgroup label="Ads products">{pick.products.map((p) => <NativeSelectOption key={p.asin} value={`asin:${p.asin}`}>{p.asin}{p.title ? ` · ${p.title.slice(0, 40)}` : ""}</NativeSelectOption>)}</optgroup>
            <optgroup label="Private-label candidates">{pick.candidates.map((c) => <NativeSelectOption key={c.id} value={`cand:${c.id}`}>{c.name}</NativeSelectOption>)}</optgroup>
          </NativeSelect></label>
        {pick.defaults.notes.map((n) => <p key={n} className="pb-2 text-xs text-warn-ink">{n}</p>)}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <LaunchForm b={b} />
        <section className="space-y-3">
          <LaunchPlan b={b} />
          <LaunchExport b={b} />
        </section>
      </div>
    </div>
  );
}
