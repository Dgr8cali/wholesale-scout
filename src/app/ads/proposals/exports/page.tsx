"use client";

import { DownloadIcon } from "lucide-react";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { usePageCrumbs } from "@/components/Crumbs";
import { EmptyState, ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RULE_LABEL, type RuleId } from "@/lib/ads/rules";
import { api } from "@/lib/ui/client";

interface Item { rule: RuleId; asin: string | null; campaign_name: string | null; entity: { type: string; label: string }; current_value: string | null; proposed_value: string | null; confidence: string }
interface Batch { id: string; label: string; created_at: string; uploaded_at: string | null; proposals: number; rows: number; items: Item[] }

const when = (d: string) => new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Ads → Proposals → Exports: each bulk sheet exported, to download, check and mark uploaded. */
export default function AdsExportsPage() {
  usePageCrumbs([{ label: "Ads", href: "/ads/dashboard" }, { label: "Proposals", href: "/ads/proposals" }, { label: "Bulk exports" }]);
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(() => api<{ batches: Batch[] }>("/api/ads/exports").then((r) => { setBatches(r.batches); setOpen((o) => o ?? r.batches[0]?.id ?? null); }).catch((e: Error) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  if (error) return <ErrorState title="Couldn't load the exports" message={error} />;
  if (!batches) return <Skeleton className="h-48 rounded-lg" />;
  const mark = async (b: Batch, uploaded: boolean) => {
    try {
      await api(`/api/ads/exports/${b.id}`, { method: "PATCH", json: { uploaded } });
      toast.success(uploaded ? `${b.label} marked uploaded: its changes won't be proposed again for 30 days` : `${b.label} no longer marked uploaded`);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-3xl">
          <h1 className="page-title">Bulk exports</h1>
          <p className="text-sm text-muted-foreground">Each sheet of approved proposals. Upload it in Amazon Ads: Campaign manager → Bulk operations → Upload, then mark it uploaded here so the same changes aren&apos;t proposed again for 30 days.</p>
        </div>
        <Button variant="outline" asChild><Link href="/ads/proposals">Proposals</Link></Button>
      </div>
      {!batches.length ? <EmptyState title="No exports yet">Approve proposals, then Export bulk sheet on Proposals.</EmptyState> : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-[11px] tracking-wide text-muted-foreground uppercase">
              <th className="px-2 py-1.5">Batch</th><th className="px-2 py-1.5">Exported</th><th className="px-2 py-1.5 text-right">Proposals</th><th className="px-2 py-1.5 text-right">Rows</th><th className="px-2 py-1.5">Uploaded</th><th />
            </tr></thead>
            <tbody>{batches.map((b) => (
              <Fragment key={b.id}>
                <tr className="border-b">
                  <td className="px-2 py-1.5"><button type="button" className="font-medium hover:underline" onClick={() => setOpen(open === b.id ? null : b.id)} aria-expanded={open === b.id}>{b.label}</button></td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{when(b.created_at)}</td>
                  <td className="num px-2 py-1.5 text-right">{b.proposals}</td>
                  <td className="num px-2 py-1.5 text-right">{b.rows}</td>
                  <td className="px-2 py-1.5">{b.uploaded_at ? <span className="text-pass">{when(b.uploaded_at)}</span> : <span className="text-warn">not yet</span>}</td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    <Button size="xs" variant="outline" asChild><a href={`/api/ads/exports/${b.id}`}><DownloadIcon /> Download</a></Button>{" "}
                    {b.uploaded_at ? <Button size="xs" variant="ghost" onClick={() => mark(b, false)}>Undo</Button> : <Button size="xs" onClick={() => mark(b, true)}>Mark batch as uploaded</Button>}
                  </td>
                </tr>
                {open === b.id && (
                  <tr className="border-b bg-muted/40"><td colSpan={6} className="px-3 py-2">
                    <table className="w-full text-xs"><tbody>{b.items.map((i, k) => (
                      <tr key={k}><td className="py-0.5 pr-3 font-medium">{RULE_LABEL[i.rule]}</td><td className="pr-3">{i.entity.label} <span className="text-muted-foreground">({i.entity.type}, {i.campaign_name})</span></td><td className="pr-3 whitespace-nowrap">{i.current_value} → <b>{i.proposed_value}</b></td><td className="text-muted-foreground">{i.asin}</td></tr>
                    ))}</tbody></table>
                  </td></tr>
                )}
              </Fragment>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
