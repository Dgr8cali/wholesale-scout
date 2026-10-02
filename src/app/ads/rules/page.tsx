"use client";

import { usePageCrumbs } from "@/components/Crumbs";
import { ComingSoon } from "@/components/ComingSoon";

export default function AdsRulesPage() {
  usePageCrumbs([{ label: "Ads", href: "/ads/dashboard" }, { label: "Rules" }]);
  return <ComingSoon title="Rules" what="Your bidding and negative-keyword rules in plain terms, e.g. lower the bid 15% on a target above your target ACoS after 20 clicks, or add a search term as negative exact after 15 clicks and no sale." note="Connect Amazon Ads once API access is approved." />;
}
