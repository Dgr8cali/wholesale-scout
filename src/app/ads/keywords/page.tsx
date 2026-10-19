"use client";

import { Suspense, useEffect, useState } from "react";
import { KeywordBank } from "@/components/ads/KeywordBank";
import { ProductPicker, useAdsProduct } from "@/components/ads/ProductPicker";
import { usePageCrumbs } from "@/components/Crumbs";
import { ErrorState } from "@/components/States";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/ui/client";

interface Dash { asins: { asin: string; title: string | null }[]; plans: { asin: string }[]; looks: Record<string, { title: string | null }> }

export default function AdsKeywordsPage() {
  return <Suspense><AdsKeywords /></Suspense>;
}

/** Ads → Keywords: the keyword bank, product by product (?asin= picks it; the picker rewrites it). */
function AdsKeywords() {
  usePageCrumbs([{ label: "Ads", href: "/ads/dashboard" }, { label: "Keywords" }]);
  const [products, setProducts] = useState<{ asin: string; title: string | null }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asin, setAsin] = useAdsProduct(products?.map((p) => p.asin) ?? [], { all: false, ready: !!products });
  useEffect(() => {
    api<Dash>("/api/ads/dashboard")
      .then((r) => {
        // The dashboard's products: those with campaigns, then those only launching (a plan, no campaign data yet).
        const launchOnly = (r.plans ?? []).filter((p) => !r.asins.some((a) => a.asin === p.asin));
        setProducts([...r.asins.map((a) => ({ asin: a.asin, title: r.looks?.[a.asin]?.title ?? a.title })), ...launchOnly.map((p) => ({ asin: p.asin, title: r.looks?.[p.asin]?.title ?? null }))]);
      })
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
        {(products.length > 0 || asin) && <ProductPicker products={products} value={asin} onChange={setAsin} all={false} />}
      </div>
      {!products.length && !asin ? <p className="panel p-4 text-sm text-muted-foreground">No product has ad campaigns yet.</p> : asin && <KeywordBank key={asin} asin={asin} />}
    </div>
  );
}
