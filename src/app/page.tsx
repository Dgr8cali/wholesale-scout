"use client";

import { UploadIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ErrorState } from "@/components/States";
import { ACTED, AskScoutButton, AskScoutPanel } from "@/components/today/AskScout";
import { KeyNumbers } from "@/components/today/KeyNumbers";
import { NextSteps } from "@/components/today/NextSteps";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import type { TodayView } from "@/lib/server/nextSteps";
import { api } from "@/lib/ui/client";

const today = () => new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export default function TodayPage() {
  const [view, setView] = useState<TodayView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api<TodayView>("/api/today").then((v) => { setView(v); setError(null); }, (e) => setError((e as Error).message));
  }, []);
  useEffect(() => {
    load();
    // Fresh when you come back to the tab.
    window.addEventListener("focus", load);
    // An action confirmed in Ask Scout (a step snoozed or done) shows at once.
    window.addEventListener(ACTED, load);
    return () => { window.removeEventListener("focus", load); window.removeEventListener(ACTED, load); };
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Today"
        crumbs={[{ label: "Home" }, { label: "Today" }]}
        subtitle={today()}
        info={<>
          <p>The most useful jobs to do now, from your own data: imports due, proposals to review, launch milestones, costs to add, stock to reorder, candidates&apos; next actions, suppliers and brands to chase. Problems with the nightly cron, Keepa or SP-API come first.</p>
          <p>Later hides a step for 24 hours. Done hides it until something behind it changes.</p>
          <p>Ask Scout answers questions from your own data with read-only lookups, shows the numbers it used and what each answer cost. It can suggest a small action that happens only when you press Confirm (with Undo for 10 seconds). Also on ⌘K.</p>
        </>}
        actions={<>
          <AskScoutButton className="xl:hidden" />
          <Button asChild><Link href="/new-run"><UploadIcon /> New run</Link></Button>
        </>}
      />
      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start xl:gap-6">
        <div className="min-w-0 space-y-6">
          {error && !view ? <ErrorState title="Couldn't load today's steps" message={error} onRetry={load} />
            : !view ? (
              <div className="space-y-3" aria-busy="true">
                {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-36 rounded-[14px]" />)}
              </div>
            ) : (
              <>
                <NextSteps steps={view.steps} next={view.next} onChange={load} />
                <KeyNumbers n={view.numbers} />
              </>
            )}
        </div>
        {/* 1280 px and wider: Ask Scout beside the steps; narrower, the header's button opens it in a sheet. */}
        <aside className="hidden xl:sticky xl:top-20 xl:block">
          <AskScoutPanel />
        </aside>
      </div>
    </div>
  );
}
