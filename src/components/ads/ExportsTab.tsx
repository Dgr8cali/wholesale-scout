"use client";

import { CameraIcon, DownloadIcon, History, Trash2Icon, Undo2Icon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useDialogs } from "@/components/Dialogs";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SectionTitle } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip, type Tone } from "@/components/ui/status-chip";
import { RULE_LABEL, type RuleId } from "@/lib/ads/rules";
import { api } from "@/lib/ui/client";

interface Item { rule: RuleId; asin: string | null; campaign_name: string | null; entity: { type: string; label: string }; current_value: string | null; proposed_value: string | null; confidence: string }
interface Batch {
  id: string; kind: "proposals" | "revert" | "restore" | "launch"; label: string; created_at: string; uploaded_at: string | null; proposals: number; rows: number;
  notes: string[]; items: Item[]; changes: string[]; saved: number; revertedBy: string | null; revertsLabel: string | null;
}
interface Snap { id: string; label: string; created_at: string; counts: Record<string, number> }

const when = (d: string) => new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const KIND: Record<Batch["kind"], { label: string; tone: Tone }> = {
  proposals: { label: "Proposals", tone: "info" },
  revert: { label: "Revert", tone: "warn" },
  restore: { label: "Restore", tone: "warn" },
  launch: { label: "Launch", tone: "good" },
};

/**
 * Ads → Proposals → Exports: every bulk sheet, to download, check, mark uploaded, revert or discard;
 * and snapshots to restore. Only the layout changed: the sheets and every call are as before.
 */
export function ExportsTab() {
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [snaps, setSnaps] = useState<Snap[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const { confirm } = useDialogs();
  const load = useCallback(() => Promise.all([
    api<{ batches: Batch[] }>("/api/ads/exports").then((r) => setBatches(r.batches)),
    api<{ snapshots: Snap[] }>("/api/ads/snapshots").then((r) => setSnaps(r.snapshots)),
  ]).catch((e: Error) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
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
  const discard = async (b: Batch) => {
    const what = b.kind === "proposals" ? "Its proposals go back to open, refreshed with the latest numbers." : b.kind === "launch" ? "The launch plan and the product's phase go back to what they were before it." : "";
    if (!(await confirm({
      title: `Discard ${b.label}?`,
      description: `Only use this if you didn't upload the file to Amazon. The batch is deleted here and nothing is written for Amazon. ${what}`.trim(),
      confirmLabel: "Discard batch", destructive: true,
    }))) return;
    try {
      const r = await api<{ label: string; notes: string[] }>(`/api/ads/exports/${b.id}/discard`, { method: "POST" });
      toast.success(`${r.label} discarded`, r.notes.length ? { description: r.notes.join(". ") } : undefined);
      setOpen(null);
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

  const openBatch = batches.find((b) => b.id === open) ?? null;
  const batchColumns: DataColumn<Batch>[] = [
    {
      id: "label", header: "Batch", mobile: "title", sortValue: (b) => b.label,
      cell: (b) => (
        <div className="min-w-0">
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <button type="button" className="cursor-pointer font-medium hover:underline" onClick={() => setOpen(b.id)}>{b.label}</button>
            <StatusChip tone={KIND[b.kind].tone} icon={false}>{KIND[b.kind].label}</StatusChip>
          </span>
          <div className="text-meta text-muted-foreground">
            {b.kind === "proposals" ? `${b.proposals} proposals` : b.notes[0] ?? ""}
            {b.revertsLabel ? ` · reverts ${b.revertsLabel}` : ""}{b.revertedBy ? ` · reverted by ${b.revertedBy}` : ""}
          </div>
        </div>
      ),
    },
    { id: "created", header: "Exported", mobile: 1, sortValue: (b) => b.created_at, cell: (b) => <span className="whitespace-nowrap">{when(b.created_at)}</span> },
    { id: "rows", header: "Rows", numeric: true, sortValue: (b) => b.rows, cell: (b) => b.rows },
    { id: "uploaded", header: "Uploaded", mobile: 2, sortValue: (b) => b.uploaded_at, cell: (b) => (b.uploaded_at ? <StatusChip tone="good">{when(b.uploaded_at)}</StatusChip> : <StatusChip tone="warn">not yet</StatusChip>) },
    {
      id: "act", header: <span className="sr-only">Actions</span>, mobile: 3, className: "text-right",
      cell: (b) => (
        <span className="inline-flex flex-wrap gap-1.5 sm:justify-end">
          <Button size="sm" variant="secondary" asChild><a href={`/api/ads/exports/${b.id}`}><DownloadIcon /> Download</a></Button>
          {b.uploaded_at ? <Button size="sm" variant="ghost" onClick={() => mark(b, false)}>Undo uploaded</Button> : <Button size="sm" onClick={() => mark(b, true)}>Mark uploaded</Button>}
          <Button size="sm" variant="ghost" onClick={() => revert(b)} title="Write the inverse sheet"><Undo2Icon /> Revert</Button>
          {!b.uploaded_at && <Button size="sm" variant="danger" onClick={() => discard(b)} title="Only if the file wasn't uploaded to Amazon"><Trash2Icon /> Discard</Button>}
        </span>
      ),
    },
  ];
  const snapColumns: DataColumn<Snap>[] = [
    { id: "label", header: "Snapshot", mobile: "title", sortValue: (x) => x.label, cell: (x) => <span className="font-medium">{x.label}</span> },
    { id: "created", header: "Taken", mobile: 1, sortValue: (x) => x.created_at, cell: (x) => <span className="whitespace-nowrap text-muted-foreground">{when(x.created_at)}</span> },
    { id: "contents", header: "Contents", mobile: 2, sortValue: (x) => x.counts.keywords, cell: (x) => <span className="text-meta text-muted-foreground">{x.counts.campaigns} campaigns, {x.counts.keywords} keywords, {x.counts.targets} targets, {x.counts.placements} placements</span> },
    { id: "act", header: <span className="sr-only">Restore</span>, mobile: 3, className: "text-right", cell: (x) => <Button size="sm" variant="secondary" onClick={() => restore(x)}>Restore snapshot</Button> },
  ];

  return (
    <div className="space-y-6">
      <DataTable rows={batches} columns={batchColumns} getRowId={(b) => b.id} storageKey="ads.exports" caption="Bulk exports" initialSort={{ id: "created", desc: true }}
        empty={{ icon: <DownloadIcon />, title: "No exports yet", description: "Approve proposals, then Export bulk sheet on the To review tab." }} />

      <section className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <SectionTitle title={<span className="inline-flex items-center gap-1.5"><History className="size-4" /> Snapshots</span>} className="mr-auto">
            Every keyword&apos;s bid and state, every budget, ad-group bid, target and placement percentage as last imported. Restore writes the sheet that takes the account back to it. The last 20 are kept.
          </SectionTitle>
          <Input className="h-8 w-full sm:w-56" placeholder="Label (e.g. before Black Friday)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <Button size="sm" variant="secondary" onClick={() => call(() => api("/api/ads/snapshots", { method: "POST", json: { label } }).then(() => setLabel("")), "Snapshot taken")}><CameraIcon /> Snapshot now</Button>
        </div>
        <DataTable rows={snaps} columns={snapColumns} getRowId={(x) => x.id} storageKey="ads.snapshots" caption="Snapshots" initialSort={{ id: "created", desc: true }}
          empty={{ icon: <CameraIcon />, title: "No snapshots yet", description: "Take one before a big change, to restore the account to it later." }} />
      </section>

      <Dialog open={!!openBatch} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="sm:max-w-2xl">
          {openBatch && <>
            <DialogHeader>
              <DialogTitle>{openBatch.label}</DialogTitle>
              <DialogDescription>{KIND[openBatch.kind].label} · {openBatch.rows} rows · exported {when(openBatch.created_at)}</DialogDescription>
            </DialogHeader>
            <div className="max-h-[60vh] space-y-2 overflow-auto">
              {openBatch.notes.slice(openBatch.kind === "proposals" ? 0 : 1).map((n) => <p key={n} className="text-meta text-warn-ink">{n}</p>)}
              {openBatch.items.length > 0 ? (
                <ul className="divide-y divide-divider text-meta">{openBatch.items.map((i, k) => (
                  <li key={k} className="py-1.5"><b>{RULE_LABEL[i.rule] ?? i.rule}</b>: {i.entity.label} <span className="text-muted-foreground">({i.entity.type}, {i.campaign_name}{i.asin ? `, ${i.asin}` : ""})</span> · {i.current_value} → <b>{i.proposed_value}</b></li>
                ))}</ul>
              ) : (
                <ul className="list-inside list-disc text-meta">{openBatch.changes.map((c, k) => <li key={k}>{c}</li>)}</ul>
              )}
              <p className="text-meta text-muted-foreground">{openBatch.saved ? `${openBatch.saved} value${openBatch.saved === 1 ? "" : "s"} saved from before, for reverting.` : "Nothing it changes had a value before (it only creates)."}</p>
            </div>
          </>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
