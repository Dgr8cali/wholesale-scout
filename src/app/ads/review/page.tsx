"use client";

import { LoaderIcon, RefreshCwIcon, SparklesIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { CostLine, DataSent, Uncited, type Run } from "@/components/ads/AiPanels";
import { usePageCrumbs } from "@/components/Crumbs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ReviewResult } from "@/lib/ads/ai";
import { RULES } from "@/lib/ads/rules";
import { api } from "@/lib/ui/client";
import { cn } from "@/lib/utils";

const lastMonth = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
};
const monthName = (m: string) => new Date(`${m}-01`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
const VERDICT: Record<string, string> = { worked: "bg-pass-soft text-pass", "did not work": "bg-fail-soft text-fail", "too early": "bg-warn-soft text-warn", "not measurable": "bg-empty-soft text-ink-2" };

export default function AdsReviewPage() {
  return <Suspense><Review /></Suspense>;
}

/** Ads → Review: the monthly AI review, per product then account-wide, run on your click (or the schedule you turned on). */
function Review() {
  usePageCrumbs([{ label: "Ads", href: "/ads/dashboard" }, { label: "Review" }]);
  const params = useSearchParams();
  const router = useRouter();
  const asked = params.get("month") ?? "";
  const month = /^\d{4}-\d{2}$/.test(asked) ? asked : lastMonth();
  const [loaded, setLoaded] = useState<{ month: string; run: Run<ReviewResult> | null } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api<{ latest: Run<ReviewResult> | null }>(`/api/ads/ai/review?month=${month}`)
      .then((r) => { if (live) setLoaded({ month, run: r.latest && { ...r.latest, cached: true } }); })
      .catch((e: Error) => toast.error(e.message));
    return () => { live = false; };
  }, [month]);
  const ready = loaded?.month === month;
  const run = ready ? loaded.run : null;

  const go = async (force: boolean) => {
    setBusy(true);
    try {
      setLoaded({ month, run: await api<Run<ReviewResult>>("/api/ads/ai/review", { method: "POST", json: { month, force } }) });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const ruleLabel = (id: string) => RULES.find((r) => r.id === id)?.label;

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <h1 className="page-title">Monthly review</h1>
          <p className="text-sm text-muted-foreground">Claude reads the month&apos;s figures from your imports, per product then account-wide, checks whether last month&apos;s applied batches worked (14 days before against 14 after) and ranks three recommendations by expected profit. It never sets bids or budgets: changes still come from the <Link className="underline" href="/ads/rules">rules</Link>. It runs only when you click, or on the 1st at 06:00 if you turn that on in Settings → Ads.</p>
        </div>
        <div className="flex items-center gap-2">
          <Input type="month" className="w-40" value={month} onChange={(e) => { if (e.target.value) router.replace(`/ads/review?month=${e.target.value}`); }} />
          {run
            ? <Button variant="outline" disabled={busy} onClick={() => go(true)} title="Ask again even if the data hasn't changed">{busy ? <LoaderIcon className="animate-spin" /> : <RefreshCwIcon />} Re-run</Button>
            : <Button disabled={busy || !ready} onClick={() => go(false)}>{busy ? <LoaderIcon className="animate-spin" /> : <SparklesIcon />} Run review</Button>}
        </div>
      </div>

      {busy && <p className="text-sm text-muted-foreground">Reviewing {monthName(month)}… (about 30 seconds)</p>}
      {ready && !run && !busy && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No review of {monthName(month)} yet. Run review asks Claude once; what it cost shows here afterwards.</p>}

      {run && (
        <>
          <section className="space-y-2">
            <h2 className="text-base font-semibold">Recommendations</h2>
            <ol className="space-y-2">
              {run.result.recommendations.map((r) => (
                <li key={r.rank} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="num font-semibold text-brand">{r.rank}.</span>
                    <b>{r.title}</b>
                    {r.expected_profit_gbp_month != null && <span className="text-xs text-pass">about £{r.expected_profit_gbp_month.toFixed(0)} a month</span>}
                    <span className="ml-auto text-xs">
                      {r.maps_to === "manual" ? <span className="text-muted-foreground">Manual action</span> : <Link className="underline" href="/ads/rules">Rule: {ruleLabel(r.maps_to) ?? r.maps_to}</Link>}
                    </span>
                  </div>
                  <p className="mt-1">{r.detail}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">Did last month&apos;s changes work?</h2>
            {run.result.batches.length
              ? <ul className="space-y-2">{run.result.batches.map((b) => (
                  <li key={b.label} className="text-sm"><b>{b.label}</b> <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", VERDICT[b.verdict] ?? VERDICT["not measurable"])}>{b.verdict}</span> {b.detail}</li>
                ))}</ul>
              : <p className="text-sm text-muted-foreground">No batches were uploaded between the start of the previous month and the end of this one, so there&apos;s nothing to measure yet.</p>}
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold">By product</h2>
            {run.result.products.map((p) => (
              <div key={p.asin} className="text-sm"><span className="font-mono text-xs text-muted-foreground">{p.asin}</span><p className="whitespace-pre-line">{p.narrative}</p></div>
            ))}
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">Account-wide</h2>
            <p className="whitespace-pre-line text-sm">{run.result.account_narrative}</p>
          </section>

          <div className="space-y-1">
            <Uncited list={run.uncited} />
            <CostLine run={run} what="review" />
          </div>
        </>
      )}
      <DataSent key={month} url={`/api/ads/ai/review?month=${month}&preview=1`} />
    </div>
  );
}
