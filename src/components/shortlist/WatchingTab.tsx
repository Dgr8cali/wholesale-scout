"use client";

import { BellIcon, EyeIcon, MailWarningIcon, RefreshCwIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { decisionLabel, PRODUCT_DECISION, ProductDecision, StatusChip, type Tone } from "@/components/ui/status-chip";
import type { LastCheck, WatchAlert } from "@/lib/server/watchlist";
import { api, gbp, when } from "@/lib/ui/client";
import { conditionLabel, type WatchCondition } from "@/lib/watch";

interface Item {
  favourite: { id: string; ean: string; asin: string | null; note: string | null; condition?: WatchCondition | null; no_supplier?: boolean };
  latest: { run_id: string; verdict: string | null; updated_at: string; product: { title: string | null; brand: string | null } | null; run?: { id: string; name: string | null } | null } | null;
  lastCheck: LastCheck | null;
  checkedAt: string | null;
}

const KIND: Record<WatchAlert["kind"], { label: string; tone: Tone }> = {
  passes: { label: "Now a buy", tone: "good" },
  condition: { label: "Condition met", tone: "info" },
  supplier: { label: "Supplier found", tone: "warn" },
};

/** Shortlist → Watching: the same starred products, with what would make each a buy, the weekly re-check and its alerts. */
export function WatchingTab() {
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
      <p className="text-sm text-muted-foreground">Re-checked every Sunday; anything that is now a buy or meets its condition is listed here and emailed.</p>
      <Button variant="secondary" onClick={recheck} loading={busy}>{busy ? "Re-checking" : <><RefreshCwIcon /> Re-check now</>}</Button>
    </div>
  );
  if (error) return <div className="space-y-5">{header}<ErrorState title="Couldn't load the watchlist" message={error} onRetry={load} /></div>;
  if (!data) return <div className="space-y-5">{header}<Skeleton className="h-40 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div>;

  return (
    <div className="space-y-6">
      {header}
      {!data.email && (
        <p className="flex items-center gap-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn-ink">
          <MailWarningIcon className="size-4 flex-none" /> Email alerts are off: set RESEND_API_KEY and ALERT_EMAIL_TO in the server&apos;s .env. Alerts still show here.
        </p>
      )}

      <section className="space-y-2" aria-label="Now a buy">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><BellIcon className="size-4" /> Now a buy <span className="num font-normal text-muted-foreground">{data.alerts.length}</span></h2>
          {data.alerts.length > 1 && <Button size="sm" variant="ghost" onClick={() => dismiss()}>Dismiss all</Button>}
        </div>
        {!data.alerts.length ? (
          <p className="panel px-4 py-6 text-center text-sm text-muted-foreground">Nothing new. Items that become a buy, meet their condition or find a supplier appear here.</p>
        ) : (
          <ul className="panel divide-y divide-divider">
            {data.alerts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <StatusChip tone={KIND[a.kind].tone}>{KIND[a.kind].label}</StatusChip>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.title ?? a.asin ?? a.ean}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.detail}
                    {a.asin && <> · <a className="text-primary hover:underline" href={`https://www.amazon.co.uk/dp/${a.asin}`} target="_blank" rel="noreferrer">{a.asin}</a></>}
                    {a.run_id && <> · <Link className="text-primary hover:underline" href={`/runs/${a.run_id}`}>open run</Link></>}
                    {" · "}{when(a.created_at)}{a.emailed_at ? " · emailed" : ""}
                  </p>
                </div>
                <Button size="icon-sm" variant="ghost" aria-label="Dismiss" onClick={() => dismiss(a.id)}><XIcon /></Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2" aria-label="Watching">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><EyeIcon className="size-4" /> Watching <span className="num font-normal text-muted-foreground">{data.items.length}</span></h2>
        <DataTable
          rows={data.items}
          getRowId={(i) => i.favourite.id}
          caption="Watching"
          storageKey="wholesale.watchlist"
          rowAttrs={(i) => ({ "data-verdict": i.latest?.verdict ?? "empty" })}
          empty={{ icon: <EyeIcon />, title: "Nothing on the watchlist", description: "Open a Check or near-miss row in a run and choose Watch: the condition is suggested from what blocked it." }}
          columns={[
            {
              id: "product", header: "Product", mobile: "title", className: "max-w-96 min-w-[14rem]", sortValue: (i) => i.latest?.product?.title ?? i.favourite.asin ?? i.favourite.ean,
              cell: ({ favourite: f, latest }) => <>
                <p className="line-clamp-2 text-sm">{f.asin ? <Link className="hover:text-primary hover:underline" href={`/products/${f.asin}`}>{latest?.product?.title ?? f.asin}</Link> : latest?.product?.title ?? f.ean}</p>
                <p className="num text-xs font-normal text-muted-foreground">
                  {f.ean}{f.asin && <> · <a className="text-primary hover:underline" href={`https://www.amazon.co.uk/dp/${f.asin}`} target="_blank" rel="noreferrer">{f.asin}</a></>}
                  {f.note && <span className="font-sans"> · {f.note}</span>}
                </p>
              </>,
            },
            {
              id: "condition", header: "Waiting for", mobile: 1, sortValue: (i) => conditionLabel(i.favourite.condition),
              cell: ({ favourite: f }) => <span className="inline-flex flex-wrap items-center gap-1.5">{conditionLabel(f.condition)}{f.no_supplier && <StatusChip tone="neutral" icon={false} className="h-5 px-2">No supplier</StatusChip>}</span>,
            },
            {
              id: "lastCheck", header: "Last check", mobile: 2, sortValue: (i) => i.lastCheck?.at ?? null,
              cell: ({ lastCheck: c }) => (c ? (
                <span className="inline-flex flex-wrap items-center gap-1.5 text-meta">
                  {c.verdict && <ProductDecision verdict={c.verdict} />}
                  <span className={c.met ? "font-medium text-success" : "text-muted-foreground"}>{c.met ? "met · " : ""}{c.detail}</span>
                  <span className="text-muted-foreground">· {when(c.at)}</span>
                </span>
              ) : <span className="text-meta text-muted-foreground">Not re-checked yet</span>),
            },
            { id: "buyBox", header: "Buy Box", numeric: true, sortValue: (i) => i.lastCheck?.buyBox ?? null, cell: (i) => gbp(i.lastCheck?.buyBox) },
            { id: "maxLanded", header: "Max landed", numeric: true, sortValue: (i) => i.lastCheck?.maxLanded ?? null, cell: (i) => gbp(i.lastCheck?.maxLanded) },
            {
              id: "latest", header: <span title="Sorts by verdict: Buy, Check, Skip">Latest result</span>, mobile: 3, sortValue: (i) => (i.latest?.verdict ? { pass: 1, warn: 2, fail: 3 }[i.latest.verdict] ?? 4 : null),
              cell: ({ latest }) => (latest ? (
                <Link className="text-meta text-primary hover:underline" href={`/runs/${latest.run_id}`}>
                  {latest.verdict ? decisionLabel(PRODUCT_DECISION, latest.verdict) : "—"} · {latest.run?.name ?? "run"}
                </Link>
              ) : <span className="text-meta text-muted-foreground">never screened</span>),
            },
          ]}
        />
      </section>
    </div>
  );
}
