"use client";

import { UploadIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ErrorState } from "@/components/States";
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
    return () => window.removeEventListener("focus", load);
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Today"
        subtitle={today()}
        info={<>
          <p>The most useful jobs to do now, from your own data: imports due, proposals to review, launch milestones, costs to add, stock to reorder, candidates&apos; next actions, suppliers and brands to chase. Problems with the nightly cron, Keepa or SP-API come first.</p>
          <p>Later hides a step for 24 hours. Done hides it until something behind it changes.</p>
        </>}
        actions={<Button asChild><Link href="/new-run"><UploadIcon /> New run</Link></Button>}
      />
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
    </div>
  );
}
