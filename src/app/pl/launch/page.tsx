"use client";

import { usePageCrumbs } from "@/components/Crumbs";
import { PlOverview } from "@/components/pl/Overview";

/** Private label → Launch. */
export default function LaunchPage() {
  usePageCrumbs([{ label: "Private label", href: "/pl/candidates" }, { label: "Launch" }]);
  return (
    <div className="space-y-4">
      <div className="max-w-3xl">
        <h1 className="page-title">Launch</h1>
        <p className="text-sm text-muted-foreground">From samples to the first review: the checklist with dates, notes and costs, the listing ASIN that links the candidate to Ads, and the budget against Gate 7.</p>
      </div>
      <PlOverview mode="launch" />
    </div>
  );
}
