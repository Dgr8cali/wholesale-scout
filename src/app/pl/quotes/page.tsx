"use client";

import { usePageCrumbs } from "@/components/Crumbs";
import { PlOverview } from "@/components/pl/Overview";

/** Private label → Quotes. */
export default function QuotesPage() {
  usePageCrumbs([{ label: "Private label", href: "/pl/candidates" }, { label: "Quotes" }]);
  return (
    <div className="space-y-4">
      <div className="max-w-3xl">
        <h1 className="page-title">Quotes</h1>
        <p className="text-sm text-muted-foreground">Supplier quotes side by side, each turned into a landed cost per unit and the cash a first order needs, with Gatekeeper&apos;s price multiple. Write the one you trust into Gate 0 and Gate 7, choose it, and send the RFQ to more suppliers.</p>
      </div>
      <PlOverview mode="quotes" />
    </div>
  );
}
