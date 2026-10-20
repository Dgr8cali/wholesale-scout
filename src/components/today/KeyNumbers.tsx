"use client";

import { AwardIcon, CoinsIcon, FlaskConicalIcon, LightbulbIcon, PoundSterlingIcon, RepeatIcon, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { TodayNumbers } from "@/lib/server/nextSteps";

const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** One figure: icon, short label, value, one wrapping line of context. Never truncated. */
function Num({ icon: Icon, label, value, hint, href }: { icon: LucideIcon; label: string; value: string; hint?: string; href: string }) {
  return (
    <Link href={href} className="panel flex min-w-0 flex-col gap-1 p-2.5 transition-colors outline-none hover:border-border-strong focus-visible:ring-3 focus-visible:ring-ring/40">
      <Icon aria-hidden className="size-4 flex-none text-primary-ink" />
      <span className="min-w-0">
        <span className="block text-meta leading-tight text-muted-foreground">{label}</span>
        <span className="num mt-0.5 block text-lg leading-tight font-semibold">{value}</span>
        {hint && <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{hint}</span>}
      </span>
    </Link>
  );
}

/** The one row of key numbers under the steps: six at most, each opening the page behind it. */
export function KeyNumbers({ n }: { n: TodayNumbers }) {
  const a = n.adSpend;
  const spend = a && a.days > 0
    ? { value: `£${a.cost.toFixed(2)}`, hint: `ACoS ${a.sales ? `${Math.round((a.cost / a.sales) * 100)}%` : "—"} on £${a.sales.toFixed(2)}` }
    : { value: "—", hint: a?.lastData ? `No ad data since ${day(a.lastData)}` : "No ad data yet" };
  return (
    <section aria-label="Key numbers" className="grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-2">
      <Num icon={PoundSterlingIcon} label="Ad spend, 7 days" value={spend.value} hint={spend.hint} href="/ads/dashboard" />
      <Num icon={LightbulbIcon} label="Proposals" value={String(n.proposals)} hint="open, to review" href="/ads/proposals?tab=review" />
      <Num icon={FlaskConicalIcon} label="Candidates" value={String(n.candidates)} hint="in progress" href="/pl/candidates" />
      <Num icon={RepeatIcon} label="To reorder" value={String(n.stockDue)} hint="due or within a week" href="/stock/reorder" />
      <Num icon={CoinsIcon} label="Keepa tokens" value={n.keepa == null ? "—" : n.keepa.toLocaleString("en-GB")} hint="left now" href="/runs" />
      <Num icon={AwardIcon} label="Brands to approve" value={n.brandsAwaiting.toLocaleString("en-GB")} hint="with a Buy product" href="/brands" />
    </section>
  );
}
