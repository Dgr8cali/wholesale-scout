"use client";

import { CloudDownloadIcon, CrosshairIcon, ScanSearchIcon, StoreIcon, UploadIcon } from "lucide-react";
import { Suspense, type ReactNode } from "react";
import { CheckSource } from "@/components/newrun/CheckSource";
import { HuntSource } from "@/components/newrun/HuntSource";
import { QogitaSource } from "@/components/newrun/QogitaSource";
import { SellerSource } from "@/components/newrun/SellerSource";
import { UploadSource } from "@/components/newrun/UploadSource";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTab } from "@/lib/ui/useTab";

const TABS = ["upload", "check", "qogita", "hunt", "seller"] as const;
type Tab = (typeof TABS)[number];

/** Each source: its tab label, one subtitle line, and the longer explanation for the InfoTip. */
const SOURCE: Record<Tab, { label: string; icon: ReactNode; subtitle: string; info: ReactNode }> = {
  upload: {
    label: "Upload file", icon: <UploadIcon />, subtitle: "Supplier price lists, xlsx or csv, several at once.",
    info: <p>Drop, Map, Review, Screen. A layout you&apos;ve mapped before is recognised, so a supplier&apos;s next file needs no setup.</p>,
  },
  check: {
    label: "Check ASINs", icon: <ScanSearchIcon />, subtitle: "Paste ASINs, EANs or Amazon links, each with a landed cost if you have one.",
    info: <p>They&apos;re screened like an upload (gates, fees, Keepa, gating) and land in Runs. With no cost you still get everything else, and the most it can cost landed.</p>,
  },
  qogita: {
    label: "Qogita", icon: <CloudDownloadIcon />, subtitle: "Pull in-stock products from Qogita and screen them; saved pulls re-run nightly.",
    info: <p>Screened like an uploaded price list (supplier Qogita, prices per piece, ex-VAT). Price and delivery are filtered after the pull; the MOV limit applies to each passing row&apos;s supplier offers.</p>,
  },
  hunt: {
    label: "Hunt", icon: <CrosshairIcon />, subtitle: "Products your profile wants, found with Keepa's Product Finder before you have a supplier.",
    info: <p>The matches are screened as a run with no cost (each shows the most it can cost landed); a pass links to <b>Find on Qogita</b> to look for a supplier by its EAN.</p>,
  },
  seller: {
    label: "Scan a seller", icon: <StoreIcon />, subtitle: "A seller's storefront, screened as a run.",
    info: <p>Its ASINs become a run like Check ASINs with no cost: the Buy Box, sales, sellers, Amazon, gating and the most each can cost landed, and whether this seller holds the Buy Box.</p>,
  },
};

export default function NewRunPage() {
  return <Suspense><NewRun /></Suspense>;
}

/** Wholesale → New run: every way to start a screening run, one tab each (?tab=). */
function NewRun() {
  // ?asins= (Check ASINs) and ?seller= (Scan a seller) prefill their tab, so they stay while it's open.
  const [tab, setTab] = useTab(TABS);
  const s = SOURCE[tab];
  return (
    <div className="space-y-6">
      <PageHeader title="New run" crumbs={[{ label: "Wholesale", href: "/runs" }, { label: "New run" }]} subtitle={s.subtitle} info={s.info} />
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-6">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList aria-label="Source">
            {TABS.map((t) => <TabsTrigger key={t} value={t} className="flex-none px-3">{SOURCE[t].icon}{SOURCE[t].label}</TabsTrigger>)}
          </TabsList>
        </div>
        <TabsContent value="upload"><UploadSource /></TabsContent>
        <TabsContent value="check"><CheckSource /></TabsContent>
        <TabsContent value="qogita"><QogitaSource /></TabsContent>
        <TabsContent value="hunt"><HuntSource /></TabsContent>
        <TabsContent value="seller"><SellerSource /></TabsContent>
      </Tabs>
    </div>
  );
}
