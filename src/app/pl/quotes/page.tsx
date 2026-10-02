"use client";

import { usePageCrumbs } from "@/components/Crumbs";
import { ComingSoon } from "@/components/ComingSoon";

export default function QuotesPage() {
  usePageCrumbs([{ label: "Private label", href: "/pl/candidates" }, { label: "Quotes" }]);
  return (
    <ComingSoon title="Quotes" what="Supplier quotes for a candidate side by side: unit price at each quantity break, MOQ, sample cost, lead time and freight to the UK, each turned into a landed cost that feeds Gate 0 and Gate 6.">
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Three quotes per candidate, the cheapest landed cost taken for the gates.</li>
        <li>Samples ordered and received, with notes against the complaint you mean to fix (Gate 4).</li>
      </ul>
    </ComingSoon>
  );
}
