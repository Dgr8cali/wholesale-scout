"use client";

import { CameraIcon, DownloadIcon, History, Undo2Icon } from "lucide-react";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { usePageCrumbs } from "@/components/Crumbs";
import { useDialogs } from "@/components/Dialogs";
import { EmptyState, ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SortTh, useSortable } from "@/components/SortableTable";
import { RULE_LABEL, type RuleId } from "@/lib/ads/rules";
import { api } from "@/lib/ui/client";
import { cn } from "@/lib/utils";

interface Item { rule: RuleId; asin: string | null; campaign_name: string | null; entity: { type: string; label: string }; current_value: string | null; proposed_value: string | null; confidence: string }
interface Batch {
  id: string; kind: "proposals" | "revert" | "restore" | "launch"; label: string; created_at: string; uploaded_at: string | null; proposals: number; rows: number;
  notes: string[]; items: Item[]; changes: string[]; saved: number; revertedBy: string | null; revertsLabel: string | null;
}
interface Snap { id: string; label: string; created_at: string; counts: Record<string, number> }

const when = (d: string) => new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const KIND: Record<Batch["kind"], { label: string; cls: string }> = {
  proposals: { label: "Proposals", cls: "bg-brand-soft text-brand" },
  revert: { label: "Revert", cls: "bg-warn-soft text-warn" },
  restore: { label: "Restore", cls: "bg-warn-soft text-warn" },
  launch: { label: "Launch", cls: "bg-pass-soft text-pass" },
};

/** Ads → Proposals → Exports: every bulk sheet, to download, check, mark uploaded or revert; and snapshots to restore. */
export default function AdsExportsPage() {
  usePageCrumbs([{ label: "Ads", href: "/ads/dashboard" }, { label: "Proposals", href: "/ads/proposals" }, { label: "Bulk exports" }]);
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [snaps, setSnaps] = useState<Snap[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const { confirm } = useDialogs();
  const load = useCallback(() => Promise.all([
    api<{ batches: Batch[] }>("/api/ads/exports").then((r) => { setBatches(r.batches); setOpen((o) => o ?? r.batches[0]?.id ?? null); }),
    api<{ snapshots: Snap[] }>("/api/ads/snapshots").then((r) => setSnaps(r.snapshots)),
  ]).catch((e: Error) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const bs = useSortable("ads.exports", batches ?? [], {
    label: { value: (b) => b.label, kind: "text" }, created: { value: (b) => b.created_at, kind: "date" },
    rows: { value: (b) => b.rows, kind: "number" }, uploaded: { value: (b) => b.uploaded_at, kind: "date" },
  });
  const ss = useSortable("ads.snapshots", snaps, {
    label: { value: (x) => x.label, kind: "text" }, created: { value: (x) => x.created_at, kind: "date" },
    keywords: { value: (x) => x.counts.keywords, kind: "number" },
  });
  if (error) return <ErrorState title="Couldn't load the exports" message={error} />;
  if (!batches) return <Skeleton className="h-48 rounded-lg" />;

  const call = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const mark = (b: Batch, uploaded: boolean) => call(() => api(`/api/ads/exports/${b.id}`, { method: "PATCH", json: { uploaded } }),
    uploaded ? `${b.label} marked uploaded: its changes won't be proposed again for 30 days` : `${b.label} no longer marked uploaded`);
  const revert = async (b: Batch) => {
    if (!(await confirm({ title: `Write the sheet that reverts ${b.label}?`, description: "Its updates go back to the values saved before it was exported; keywords and campaigns it created are paused, negatives archived. Nothing changes until you upload the new sheet.", confirmLabel: "Write revert sheet" }))) return;
    try {
      const r = await api<{ id: string; label: string; unresolved: string[] }>(`/api/ads/exports/${b.id}/revert`, { method: "POST" });
      toast.success(`Revert sheet ${r.label} written${r.unresolved.length ? `; ${r.unresolved.length} created item${r.unresolved.length === 1 ? "" : "s"} can't be found yet (see its notes)` : ""}`);
      setOpen(r.id);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const restore = async (s: Snap) => {
    if (!(await confirm({ title: `Write the sheet back to "${s.label}"?`, description: "Bids, states, budgets and placement percentages that differ from the snapshot go back to it; keywords and campaigns added since are paused. Compared with the data last imported.", confirmLabel: "Write restore sheet" }))) return;
    try {
      const r = await api<{ id: string; label: string; rows: number }>(`/api/ads/snapshots/${s.id}/restore`, { method: "POST" });
      toast.success(`Restore sheet ${r.label}: ${r.rows} rows`);
      setOpen(r.id);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-3xl">
          <h1 className="page-title">Bulk exports</h1>
          <p className="text-sm text-muted-foreground">Each bulk sheet: approved proposals, launches, reverts and restores. Upload it in Amazon Ads (Campaign manager → Bulk operations → Upload), then mark it uploaded here. Before a sheet is written, the current value of everything it changes is saved, so any batch can be reverted.</p>
        </div>
        <Button variant="outline" asChild><Link href="/ads/proposals">Proposals</Link></Button>
      </div>
      {!batches.length ? <EmptyState title="No exports yet">Approve proposals, then Export bulk sheet on Proposals.</EmptyState> : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-[11px] tracking-wide text-muted-foreground uppercase">
              <SortTh {...bs.th("label")} className="px-2 py-1.5">Batch</SortTh><SortTh {...bs.th("created")} className="px-2 py-1.5">Exported</SortTh>
              <SortTh {...bs.th("rows")} numeric className="px-2 py-1.5 text-right">Rows</SortTh><SortTh {...bs.th("uploaded")} className="px-2 py-1.5">Uploaded</SortTh><th />
            </tr></thead>
            <tbody>{bs.rows.map((b) => (
              <Fragment key={b.id}>
                <tr className="border-b">
                  <td className="px-2 py-1.5">
                    <button type="button" className="font-medium hover:underline" onClick={() => setOpen(open === b.id ? null : b.id)} aria-expanded={open === b.id}>{b.label}</button>{" "}
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", KIND[b.kind].cls)}>{KIND[b.kind].label}</span>
                    <div className="text-xs text-muted-foreground">
                      {b.kind === "proposals" ? `${b.proposals} proposals` : b.notes[0] ?? ""}
                      {b.revertsLabel ? ` · reverts ${b.revertsLabel}` : ""}{b.revertedBy ? ` · reverted by ${b.revertedBy}` : ""}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{when(b.created_at)}</td>
                  <td className="num px-2 py-1.5 text-right">{b.rows}</td>
                  <td className="px-2 py-1.5">{b.uploaded_at ? <span className="text-pass">{when(b.uploaded_at)}</span> : <span className="text-warn">not yet</span>}</td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    <Button size="xs" variant="outline" asChild><a href={`/api/ads/exports/${b.id}`}><DownloadIcon /> Download</a></Button>{" "}
                    {b.uploaded_at ? <Button size="xs" variant="ghost" onClick={() => mark(b, false)}>Undo</Button> : <Button size="xs" onClick={() => mark(b, true)}>Mark batch as uploaded</Button>}{" "}
                    <Button size="xs" variant="ghost" onClick={() => revert(b)} title="Write the inverse sheet"><Undo2Icon /> Revert this batch</Button>
                  </td>
                </tr>
                {open === b.id && (
                  <tr className="border-b bg-muted/40"><td colSpan={5} className="space-y-2 px-3 py-2">
                    {b.notes.slice(b.kind === "proposals" ? 0 : 1).map((n) => <p key={n} className="text-xs text-warn">{n}</p>)}
                    {b.items.length > 0 ? (
                      <table className="w-full text-xs"><tbody>{b.items.map((i, k) => (
                        <tr key={k}><td className="py-0.5 pr-3 font-medium">{RULE_LABEL[i.rule] ?? i.rule}</td><td className="pr-3">{i.entity.label} <span className="text-muted-foreground">({i.entity.type}, {i.campaign_name})</span></td><td className="pr-3 whitespace-nowrap">{i.current_value} → <b>{i.proposed_value}</b></td><td className="text-muted-foreground">{i.asin}</td></tr>
                      ))}</tbody></table>
                    ) : (
                      <ul className="list-inside list-disc text-xs">{b.changes.map((c, k) => <li key={k}>{c}</li>)}</ul>
                    )}
                    <p className="text-xs text-muted-foreground">{b.saved ? `${b.saved} value${b.saved === 1 ? "" : "s"} saved from before, for reverting.` : "Nothing it changes had a value before (it only creates)."}</p>
                  </td></tr>
                )}
              </Fragment>
            ))}</tbody>
          </table>
        </div>
      )}

      <section className="panel space-y-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="mr-auto max-w-2xl">
            <h2 className="section-label flex items-center gap-1.5"><History className="size-4" /> Snapshots</h2>
            <p className="text-sm text-muted-foreground">Every keyword&apos;s bid and state, every budget, ad-group bid, target and placement percentage as last imported. Restore writes the sheet that takes the account back to it. The last 20 are kept.</p>
          </div>
          <Input className="h-8 w-56" placeholder="Label (e.g. before Black Friday)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <Button onClick={() => call(() => api("/api/ads/snapshots", { method: "POST", json: { label } }).then(() => setLabel("")), "Snapshot taken")}><CameraIcon /> Snapshot now</Button>
        </div>
        {!snaps.length ? <p className="text-sm text-muted-foreground">None yet.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] tracking-wide text-muted-foreground uppercase">
              <SortTh {...ss.th("label")} className="py-1 pr-3">Snapshot</SortTh><SortTh {...ss.th("created")} className="pr-3">Taken</SortTh>
              <SortTh {...ss.th("keywords")} className="pr-3">Contents</SortTh><th />
            </tr></thead>
            <tbody>{ss.rows.map((s) => (
            <tr key={s.id} className="border-t">
              <td className="py-1.5 pr-3 font-medium">{s.label}</td>
              <td className="pr-3 text-muted-foreground whitespace-nowrap">{when(s.created_at)}</td>
              <td className="pr-3 text-xs text-muted-foreground">{s.counts.campaigns} campaigns, {s.counts.keywords} keywords, {s.counts.targets} targets, {s.counts.placements} placements</td>
              <td className="text-right"><Button size="xs" variant="outline" onClick={() => restore(s)}>Restore snapshot</Button></td>
            </tr>
          ))}</tbody></table>
        )}
      </section>
    </div>
  );
}
