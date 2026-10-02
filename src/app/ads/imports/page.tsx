"use client";

import { usePageCrumbs } from "@/components/Crumbs";
import { ComingSoon } from "@/components/ComingSoon";

export default function AdsImportsPage() {
  usePageCrumbs([{ label: "Ads", href: "/ads/dashboard" }, { label: "Imports" }]);
  return <ComingSoon title="Imports" what="Upload Amazon Ads reports (search term, targeting, campaign) until the Ads API is connected. Each import is kept, so trends build up over time." note="Connect Amazon Ads once API access is approved." />;
}
