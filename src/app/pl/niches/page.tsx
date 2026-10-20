"use client";

import { ListIcon, TelescopeIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense } from "react";
import { MyNiches } from "@/components/pl/MyNiches";
import { NicheHunt } from "@/components/pl/NicheHunt";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTab } from "@/lib/ui/useTab";

const TABS = ["mine", "find"] as const;
type Tab = (typeof TABS)[number];

export default function NichesPage() {
  return <Suspense><Niches /></Suspense>;
}

/**
 * Private label → Niches: My niches (Opportunity Explorer downloads, scored and flagged, with the
 * shortlist and incumbent checks) and Find niches (Niche Hunt: Keepa's Product Finder, niches that
 * already pass Gates 0 and 1). Both turn a niche into a candidate.
 */
function Niches() {
  const router = useRouter();
  const [tab, setTab] = useTab(TABS);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Niches"
        crumbs={[{ label: "Private label", href: "/pl" }, { label: "Niches" }]}
        subtitle={tab === "mine" ? "Opportunity Explorer niches, scored 0–100 from their own figures." : "Niches that already pass Gates 0 and 1, from Keepa's Product Finder."}
        info={tab === "mine" ? <>
          <p>Opportunity Explorer category downloads, every niche scored 0–100 from its own figures (demand, growth, price, fragmentation, units a product) and flagged. No Keepa tokens until you ask for an incumbent check.</p>
          <p>See <Link className="text-primary underline" href="/help/howto/pl-importing-niches">Private label: importing Opportunity Explorer niches</Link>.</p>
        </> : <>
          <p>Products that already pass Gates 0 and 1, from Keepa&apos;s Product Finder, grouped by leaf category: each leaf is a niche. Direct mode asks Keepa once per category with the thresholds applied; leaf mode sizes each leaf first.</p>
          <p>Turn a niche into a candidate. See <Link className="text-primary underline" href="/help/concepts/niche-hunt">Niche Hunt</Link>.</p>
        </>}
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-6">
        <TabsList aria-label="Niches">
          <TabsTrigger value="mine" className="px-3"><ListIcon /> My niches</TabsTrigger>
          <TabsTrigger value="find" className="px-3"><TelescopeIcon /> Find niches</TabsTrigger>
        </TabsList>
        <TabsContent value="mine"><MyNiches /></TabsContent>
        <TabsContent value="find"><NicheHunt onCandidate={(id) => router.push(`/pl/candidates/${id}`)} /></TabsContent>
      </Tabs>
    </div>
  );
}
