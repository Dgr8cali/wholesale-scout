"use client";

import { useRouter } from "next/navigation";
import { usePageCrumbs } from "@/components/Crumbs";
import { NicheHunt } from "@/components/pl/NicheHunt";

/** Private label → Niche Hunt: niches that already pass Gates 0 and 1, from Keepa's Product Finder. */
export default function NicheHuntPage() {
  usePageCrumbs([{ label: "Private label", href: "/pl/candidates" }, { label: "Niche Hunt" }]);
  const router = useRouter();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Niche Hunt</h1>
        <p className="text-sm text-muted-foreground">Products that already pass Gates 0 and 1, from Keepa&apos;s Product Finder, grouped by leaf category: each leaf is a niche. Direct mode asks Keepa once per category with the thresholds applied; leaf mode sizes each leaf first. Turn a niche into a candidate.</p>
      </div>
      <NicheHunt onCandidate={(id) => router.push(`/pl/candidates?c=${id}`)} />
    </div>
  );
}
