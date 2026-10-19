"use client";

import { ListIcon, TextSearchIcon, WholeWordIcon } from "lucide-react";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { KeywordBank } from "@/components/ads/KeywordBank";
import { NgramsTab } from "@/components/ads/NgramsTab";
import { ProductPicker, useAdsProduct } from "@/components/ads/ProductPicker";
import { SearchTermsTable, type TermRow } from "@/components/ads/SearchTermsTable";
import { EmptyState, ErrorState } from "@/components/States";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/ui/client";
import { useTab } from "@/lib/ui/useTab";

const TABS = ["keywords", "ngrams", "all"] as const;
type Tab = (typeof TABS)[number];

interface Dash {
  asins: { asin: string; title: string | null }[]; plans: { asin: string }[]; looks: Record<string, { title: string | null }>;
  campaigns: { id: string; name: string }[]; terms: TermRow[];
}

const SUBTITLE: Record<Tab, string> = {
  keywords: "The keyword bank: every term worth knowing for the product, with what to do about it.",
  ngrams: "Its search terms' words and word pairs, summed, with what Rules 9 and 10 make of them.",
  all: "Every search term the product's ads matched, with its status against the target.",
};

export default function SearchTermsPage() {
  return <Suspense><SearchTerms /></Suspense>;
}

/** Ads → Search terms: Keywords, N-grams and All search terms for one product, picked once at the top (?asin=). */
function SearchTerms() {
  const [d, setD] = useState<Dash | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<Dash>("/api/ads/dashboard").then(setD).catch((e: Error) => setError(e.message)); }, []);
  // The dashboard's products: those with campaigns, then those only launching (a plan, no campaign data yet).
  const products = useMemo(() => {
    if (!d) return [];
    const launchOnly = (d.plans ?? []).filter((p) => !d.asins.some((a) => a.asin === p.asin));
    return [...d.asins.map((a) => ({ asin: a.asin, title: d.looks?.[a.asin]?.title ?? a.title })), ...launchOnly.map((p) => ({ asin: p.asin, title: d.looks?.[p.asin]?.title ?? null }))];
  }, [d]);
  const [asin, setAsin] = useAdsProduct(products.map((p) => p.asin), { all: false, ready: !!d });
  const [tab, setTab] = useTab(TABS, ["asin"]);
  const terms = useMemo(() => (d?.terms ?? []).filter((t) => t.asin === asin), [d, asin]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Search terms"
        crumbs={[{ label: "Ads", href: "/ads/dashboard" }, { label: "Search terms" }]}
        subtitle={SUBTITLE[tab]}
        info={<>
          <p><b>Keywords</b>: one place per product for every term worth knowing: Opportunity Explorer&apos;s search terms (from a linked private-label candidate), harvested terms, n-gram winners, rank-tracked terms and your own. <b>Add as exact</b> and <b>Add as negative</b> queue approved proposals for the next bulk sheet; <b>Track rank</b> adds it to the rank checks. The launcher&apos;s head terms come from here.</p>
          <p><b>N-grams</b> splits the search terms into words and word pairs; <b>All search terms</b> lists each term with its spend, orders and status. The product picker applies to every tab. See <Link className="text-primary underline" href="/help/howto/ads-keyword-bank">Ads: keyword bank</Link>.</p>
        </>}
      />
      {error ? <ErrorState title="Couldn't load the products" message={error} />
        : !d ? <Skeleton className="h-64 rounded-xl" />
        : !products.length && !asin ? <EmptyState title="No product has ad campaigns yet">Import a bulk export on the Dashboard to see its search terms.</EmptyState>
        : (
          <>
            <div><ProductPicker products={products} value={asin} onChange={setAsin} all={false} /></div>
            <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-6">
              <TabsList aria-label="Search terms">
                <TabsTrigger value="keywords" className="px-3"><TextSearchIcon /> Keywords</TabsTrigger>
                <TabsTrigger value="ngrams" className="px-3"><WholeWordIcon /> N-grams</TabsTrigger>
                <TabsTrigger value="all" className="px-3"><ListIcon /> All search terms</TabsTrigger>
              </TabsList>
              <TabsContent value="keywords">{asin && <KeywordBank key={asin} asin={asin} />}</TabsContent>
              <TabsContent value="ngrams">{asin && <NgramsTab asin={asin} />}</TabsContent>
              <TabsContent value="all"><SearchTermsTable key={asin} rows={terms} campaigns={d.campaigns} /></TabsContent>
            </Tabs>
          </>
        )}
    </div>
  );
}
