"use client";

import Link from "next/link";
import { PlOverview } from "@/components/pl/Overview";
import { PageHeader } from "@/components/ui/page-header";

/** Private label → Launch checklist. */
export default function LaunchPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Launch checklist"
        crumbs={[{ label: "Private label", href: "/pl/candidates" }, { label: "Launch checklist" }]}
        subtitle="From samples to the first review, one candidate at a time."
        info={<>
          <p>The checklist with dates, notes and costs, the listing ASIN that links the candidate to Ads, and the budget against Gate 7.</p>
          <p>A candidate shows here once its verdict is Order samples, or it&apos;s at samples or launched. Pick one in the table to work on its launch, or <Link className="text-primary underline" href="/pl/candidates">open it under Candidates</Link>.</p>
        </>}
      />
      <PlOverview mode="launch" />
    </div>
  );
}
