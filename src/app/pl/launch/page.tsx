"use client";

import { usePageCrumbs } from "@/components/Crumbs";
import { ComingSoon } from "@/components/ComingSoon";

export default function LaunchPage() {
  usePageCrumbs([{ label: "Private label", href: "/pl/candidates" }, { label: "Launch" }]);
  return (
    <ComingSoon title="Launch" what="A launch checklist for a candidate that cleared every gate: trademark, listing copy and images, the first order and inspection, inbound shipment, and the launch ads, tracked against the Gate 7 budget.">
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Spend so far against the launch budget, with the 10% buffer.</li>
        <li>The first 60 days of sales and ads, from Ads once it&apos;s connected.</li>
      </ul>
    </ComingSoon>
  );
}
