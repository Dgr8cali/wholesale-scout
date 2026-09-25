"use client";

import { BellIcon, EyeIcon, MailWarningIcon, RefreshCwIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { usePageCrumbs } from "@/components/Crumbs";
import { EmptyState, ErrorState } from "@/components/States";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LastCheck, WatchAlert } from "@/lib/server/watchlist";
import { api, gbp, when } from "@/lib/ui/client";
import { cn } from "@/lib/utils";
import { conditionLabel, type WatchCondition } from "@/lib/watch";

interface Item {
  favourite: { id: string; ean: string; asin: string | null; note: string | null; condition?: WatchCondition | null; no_supplier?: boolean };
  latest: { run_id: string; verdict: string | null; updated_at: string; product: { title: string | null; brand: string | null } | null; run?: { id: string; name: string | null } | null } | null;
  lastCheck: LastCheck | null;
  checkedAt: string | null;
}

const KIND: Record<WatchAlert["kind"], { label: string; variant: "pass" | "brand" | "warn" }> = {
  passes: { label: "Now passes", variant: "pass" },
  condition: { label: "Condition met", variant: "brand" },
  supplier: { label: "Supplier found", variant: "warn" },
};

export default function WatchlistPage() {
  usePageCrumbs([{ label: "Watchlist" }]);
  const router = useRouter();
  const [data, setData] = useState<{ items: Item[]; alerts: WatchAlert[]; email: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<{ items: Item[]; alerts: WatchAlert[]; email: boolean }>("/api/watchlist").then(setData).catch((e) => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function recheck() {
    setBusy(true);
    try {
      const r = await api<{ runId: string | null; reason?: string }>("/api/watchlist/check", { method: "POST" });
      if (r.runId) router.push(`/runs/${r.runId}`);
      else toast.message(`Nothing to re-check: ${r.reason}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function dismiss(id?: string) {
    try {
      await api("/api/watchlist/alerts", { method: "POST", json: id ? { id } : { all: true } });
      setData((d) => d && { ...d, alerts: id ? d.alerts.filter((a) => a.id !== id) : [] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="page-title">Watchlist</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Products you&apos;re waiting on, each with what would make it a buy. Every Sunday they&apos;re re-checked (Keepa only where the
          history is over 7 days old; gating refreshed) and anything that now passes or meets its condition is listed here and emailed.
          Add one from a result&apos;s details; a starred product without a condition is simply re-checked weekly.
        </p>
      </div>
      <Button variant="outline" onClick={recheck} disabled={busy}><RefreshCwIcon className={cn(busy && "animate-spin")} /> Re-check now</Button>
    </div>
  );
  if (error) return <div className="space-y-5">{header}<ErrorState title="Couldn't load the watchlist" message={error} onRetry={load} /></div>;
  if (!data) return <div className="space-y-5">{header}<Skeleton className="h-40 rounded-lg" /><Skeleton className="h-64 rounded-lg" /></div>;

  return (
    <div className="space-y-6">
      {header}
      {!data.email && (
        <p className="flex items-center gap-2 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
          <MailWarningIcon className="size-4 flex-none" /> Email alerts are off: set RESEND_API_KEY and ALERT_EMAIL_TO in Vercel. Alerts still show here.
        </p>
      )}

      <section className="space-y-2" aria-label="Now passes">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><BellIcon className="size-4" /> Now passes <span className="num font-normal text-muted-foreground">{data.alerts.length}</span></h2>
          {data.alerts.length > 1 && <Button size="sm" variant="ghost" onClick={() => dismiss()}>Dismiss all</Button>}
        </div>
        {!data.alerts.length ? (
          <p className="panel px-4 py-6 text-center text-sm text-muted-foreground">Nothing new. Items that pass, meet their condition or find a supplier appear here.</p>
        ) : (
          <ul className="panel divide-y">
            {data.alerts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <Badge variant={KIND[a.kind].variant}>{KIND[a.kind].label}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.title ?? a.asin ?? a.ean}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.detail}
                    {a.asin && <> · <a className="text-brand hover:underline" href={`https://www.amazon.co.uk/dp/${a.asin}`} target="_blank" rel="noreferrer">{a.asin}</a></>}
                    {a.run_id && <> · <Link className="text-brand hover:underline" href={`/runs/${a.run_id}`}>open run</Link></>}
                    {" · "}{when(a.created_at)}{a.emailed_at ? " · emailed" : ""}
                  </p>
                </div>
                <Button size="icon" variant="ghost" aria-label="Dismiss" onClick={() => dismiss(a.id)}><XIcon /></Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2" aria-label="Watching">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><EyeIcon className="size-4" /> Watching <span className="num font-normal text-muted-foreground">{data.items.length}</span></h2>
        {!data.items.length ? (
          <EmptyState icon={<EyeIcon />} title="Nothing on the watchlist">
            Open a warn or near-miss row in a run and choose Watch: the condition is suggested from what blocked it.
          </EmptyState>
        ) : (
          <div className="panel overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Product</TableHead>
                  <TableHead>Waiting for</TableHead>
                  <TableHead>Last check</TableHead>
                  <TableHead className="text-right">Buy Box</TableHead>
                  <TableHead className="text-right">Max landed</TableHead>
                  <TableHead className="pr-4">Latest result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((i) => {
                  const c = i.lastCheck;
                  const f = i.favourite;
                  return (
                    <TableRow key={f.id} data-verdict={i.latest?.verdict ?? "empty"}>
                      <TableCell className="max-w-96 pl-4 whitespace-normal">
                        <p className="line-clamp-2 text-sm">{f.asin ? <Link className="hover:text-brand hover:underline" href={`/products/${f.asin}`}>{i.latest?.product?.title ?? f.asin}</Link> : i.latest?.product?.title ?? f.ean}</p>
                        <p className="num text-2xs text-muted-foreground">
                          {f.ean}{f.asin && <> · <a className="text-brand hover:underline" href={`https://www.amazon.co.uk/dp/${f.asin}`} target="_blank" rel="noreferrer">{f.asin}</a></>}
                          {f.note && <span className="font-sans"> · {f.note}</span>}
                        </p>
                      </TableCell>
                      <TableCell className="text-sm">
                        {conditionLabel(f.condition)}
                        {f.no_supplier && <Badge variant="muted" className="ml-1.5">no supplier</Badge>}
                      </TableCell>
                      <TableCell className="text-xs">
                        {c ? (
                          <span className="space-x-1.5">
                            {c.verdict && <Badge variant={c.verdict}>{c.verdict}</Badge>}
                            <span className={c.met ? "font-medium text-pass" : "text-muted-foreground"}>{c.met ? "met · " : ""}{c.detail}</span>
                            <span className="text-muted-foreground">· {when(c.at)}</span>
                          </span>
                        ) : <span className="text-muted-foreground">Not re-checked yet</span>}
                      </TableCell>
                      <TableCell className="num text-right">{gbp(c?.buyBox)}</TableCell>
                      <TableCell className="num text-right">{gbp(c?.maxLanded)}</TableCell>
                      <TableCell className="pr-4 text-xs">
                        {i.latest ? (
                          <Link className="text-brand hover:underline" href={`/runs/${i.latest.run_id}`}>
                            {i.latest.verdict ?? "—"} · {i.latest.run?.name ?? "run"}
                          </Link>
                        ) : <span className="text-muted-foreground">never screened</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
