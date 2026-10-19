"use client";

import { ListFilterIcon, SlidersHorizontalIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { AdsSettingsTab } from "@/components/ads/AdSettingsTab";
import { RulesTab } from "@/components/ads/RulesTab";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTab } from "@/lib/ui/useTab";

const TABS = ["rules", "settings"] as const;
type Tab = (typeof TABS)[number];

export default function AdsRulesPage() {
  return <Suspense><AdsRules /></Suspense>;
}

/** Ads → Rules: every rule (thresholds, on/off, mode, dry run) and the ad settings they work from, in one place. */
function AdsRules() {
  const [tab, setTab] = useTab(TABS);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Rules"
        crumbs={[{ label: "Ads", href: "/ads/dashboard" }, { label: "Rules" }]}
        subtitle={tab === "rules" ? "The rules behind Proposals, with what each would propose now." : "Target ACoS, bid smoothing, keyword lists and the AI review: what the rules work from."}
        info={<>
          <p>The rules behind <Link className="text-primary underline" href="/ads/proposals">Proposals</Link>. Each runs on the imported data whenever you import or open Proposals; what it suggests waits for your approval.</p>
          <p>The target ACoS is each product&apos;s (launch or steady) on the dashboard, else the default on the <b>Ad settings</b> tab.</p>
        </>}
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-6">
        <TabsList aria-label="Rules">
          <TabsTrigger value="rules" className="px-3"><ListFilterIcon /> Rules</TabsTrigger>
          <TabsTrigger value="settings" className="px-3"><SlidersHorizontalIcon /> Ad settings</TabsTrigger>
        </TabsList>
        <TabsContent value="rules"><RulesTab /></TabsContent>
        <TabsContent value="settings"><AdsSettingsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
