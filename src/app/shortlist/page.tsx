"use client";

import { EyeIcon, StarIcon } from "lucide-react";
import { Suspense } from "react";
import { FavouritesTab } from "@/components/shortlist/FavouritesTab";
import { WatchingTab } from "@/components/shortlist/WatchingTab";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTab } from "@/lib/ui/useTab";

const TABS = ["products", "watching"] as const;
type Tab = (typeof TABS)[number];

export default function ShortlistPage() {
  return <Suspense><Shortlist /></Suspense>;
}

/**
 * Wholesale → Shortlist: the products you've starred (the favourites table), two ways. Products:
 * each with its latest result, to re-screen or export. Watching: the condition that would make it
 * a buy, the weekly re-check and its alerts. One list of records; the tabs are two sets of tools.
 */
function Shortlist() {
  const [tab, setTab] = useTab(TABS);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Shortlist"
        crumbs={[{ label: "Wholesale", href: "/runs" }, { label: "Shortlist" }]}
        subtitle={tab === "products" ? "Products you've starred, each with its latest result." : "What would make each starred product a buy, checked every Sunday."}
        info={<>
          <p>Star a result (or use the extension) to put it here. <b>Products</b> shows each with its latest result from any run, to re-screen with a profile or export to xlsx.</p>
          <p><b>Watching</b> shows the same products with their condition (e.g. Buy Box at or above a price). Every Sunday they&apos;re re-checked (Keepa only where the history is over 7 days old; gating refreshed) and anything that now passes or meets its condition is listed and emailed. A starred product without a condition is simply re-checked weekly.</p>
        </>}
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-6">
        <TabsList aria-label="View">
          <TabsTrigger value="products" className="px-3"><StarIcon /> Products</TabsTrigger>
          <TabsTrigger value="watching" className="px-3"><EyeIcon /> Watching</TabsTrigger>
        </TabsList>
        <TabsContent value="products"><FavouritesTab /></TabsContent>
        <TabsContent value="watching"><WatchingTab /></TabsContent>
      </Tabs>
    </div>
  );
}
