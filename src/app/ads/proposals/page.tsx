"use client";

import { usePageCrumbs } from "@/components/Crumbs";
import { ComingSoon } from "@/components/ComingSoon";

export default function AdsProposalsPage() {
  usePageCrumbs([{ label: "Ads", href: "/ads/dashboard" }, { label: "Proposals" }]);
  return <ComingSoon title="Proposals" what="The changes your rules suggest, one by one: what, why and the expected effect, to approve or reject. Nothing changes in Amazon Ads without your approval." note="Connect Amazon Ads once API access is approved." />;
}
