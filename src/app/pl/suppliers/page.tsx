"use client";

import { FactoryIcon, ReceiptTextIcon } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PlOverview } from "@/components/pl/Overview";
import { SuppliersPanel } from "@/components/pl/Suppliers";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTab } from "@/lib/ui/useTab";

const TABS = ["suppliers", "quotes"] as const;
type Tab = (typeof TABS)[number];

export default function SuppliersAndQuotesPage() {
  return <Suspense><SuppliersAndQuotes /></Suspense>;
}

/**
 * Private label → Suppliers & quotes: every candidate's Alibaba supplier leads, scored (?candidate=
 * filters them), and the quotes those suppliers sent, each turned into a landed cost.
 */
function SuppliersAndQuotes() {
  const [tab, setTab] = useTab(TABS);
  const candidate = useSearchParams().get("candidate") ?? "";
  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppliers & quotes"
        crumbs={[{ label: "Private label", href: "/pl/candidates" }, { label: "Suppliers & quotes" }]}
        subtitle={tab === "suppliers" ? "Alibaba listings from the extension, scored against each candidate's targets." : "Supplier quotes side by side, each turned into a landed cost per unit."}
        info={tab === "suppliers" ? <>
          <p>Supplier Scout: Alibaba listings you sent from the extension, each scored 0–100 against its candidate&apos;s Gate 6 target price, MOQ and unit (price 35, MOQ 20, trust 25, relevance 20), so you only message the top few. Open a candidate for its RFQ, then <b>Add quote</b> when they answer.</p>
          <p>See <Link className="text-primary underline" href="/help/howto/pl-finding-suppliers">Private label: finding suppliers</Link>.</p>
        </> : <>
          <p>Each quote becomes a landed cost per unit and the cash a first order needs, with Gatekeeper&apos;s price multiple. Write the one you trust into Gate 0 and Gate 7, choose it, and send the RFQ to more suppliers.</p>
          <p>See <Link className="text-primary underline" href="/help/howto/pl-quotes-and-landed-cost">Private label: quotes and landed cost</Link>.</p>
        </>}
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-6">
        <TabsList aria-label="Suppliers and quotes">
          <TabsTrigger value="suppliers" className="px-3"><FactoryIcon /> Suppliers</TabsTrigger>
          <TabsTrigger value="quotes" className="px-3"><ReceiptTextIcon /> Quotes</TabsTrigger>
        </TabsList>
        <TabsContent value="suppliers"><section className="panel p-4"><SuppliersPanel key={candidate} showCandidate initialFilter={candidate} /></section></TabsContent>
        <TabsContent value="quotes"><PlOverview mode="quotes" /></TabsContent>
      </Tabs>
    </div>
  );
}
