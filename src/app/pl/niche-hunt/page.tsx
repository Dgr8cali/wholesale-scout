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
        <p className="text-sm text-muted-foreground">Leaf by leaf: Keepa sizes each leaf category with wide filters, then the most promising are detailed and qualified strictly against Gate 0 and Gate 1. Turn a niche into a candidate.</p>
      </div>
      <NicheHunt onCandidate={(id) => router.push(`/pl/candidates?c=${id}`)} />
    </div>
  );
}
