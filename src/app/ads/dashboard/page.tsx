"use client";

import { usePageCrumbs } from "@/components/Crumbs";
import { ComingSoon } from "@/components/ComingSoon";

export default function AdsDashboardPage() {
  usePageCrumbs([{ label: "Ads", href: "/ads/dashboard" }, { label: "Dashboard" }]);
  return <ComingSoon title="Dashboard" what="Your Sponsored Products at a glance: spend, sales, ACoS against your target, and the campaigns, ad groups and search terms moving it most, per day and per week." note="Connect Amazon Ads once API access is approved." />;
}
