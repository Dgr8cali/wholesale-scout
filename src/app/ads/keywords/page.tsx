"use client";

import { useEffect, useState } from "react";
import { KeywordBank } from "@/components/ads/KeywordBank";
import { usePageCrumbs } from "@/components/Crumbs";
import { ErrorState } from "@/components/States";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/ui/client";

/** Ads → Keywords: the keyword bank, product by product. */
export default function AdsKeywordsPage() {
  usePageCrumbs([{ label: "Ads", href: "/ads/dashboard" }, { label: "Keywords" }]);
  const [products, setProducts] = useState<{ asin: string; title: string | null }[] | null>(null);
  const [asin, setAsin] = useState<string>(() => (typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("asin") ?? ""));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ asins: { asin: string; title: string | null }[]; looks: Record<string, { title: string | null }> }>("/api/ads/dashboard")
      .then((r) => { const ps = r.asins.map((a) => ({ asin: a.asin, title: r.looks?.[a.asin]?.title ?? a.title })); setProducts(ps); setAsin((cur) => cur || ps[0]?.asin || ""); })
      .catch((e: Error) => setError(e.message));
  }, []);
  if (error) return <ErrorState title="Couldn't load the products" message={error} />;
  if (!products) return <Skeleton className="h-64 rounded-lg" />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-3xl">
          <h1 className="page-title">Keyword bank</h1>
          <p className="text-sm text-muted-foreground">One place per product for every term worth knowing: Opportunity Explorer&apos;s search terms (from a linked private-label candidate), harvested terms, n-gram winners, rank-tracked terms and your own. Each with its searches a month, what the ads made of it, its organic rank and where it stands. <b>Add as exact</b> and <b>Add as negative</b> queue approved proposals for the next bulk sheet; <b>Track rank</b> adds it to the rank checks. The launcher&apos;s head terms come from here.</p>
        </div>
        {products.length > 0 && (
          <NativeSelect value={asin} onChange={(e) => setAsin(e.target.value)} aria-label="Product">
            {products.map((p) => <NativeSelectOption key={p.asin} value={p.asin}>{p.asin}{p.title ? ` · ${p.title.slice(0, 50)}` : ""}</NativeSelectOption>)}
          </NativeSelect>
        )}
      </div>
      {!products.length ? <p className="panel p-4 text-sm text-muted-foreground">No product has ad campaigns yet.</p> : asin && <KeywordBank key={asin} asin={asin} />}
    </div>
  );
}
