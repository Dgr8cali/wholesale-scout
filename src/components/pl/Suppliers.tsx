"use client";

import { ClipboardCopyIcon, FactoryIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_HIDDEN_SUPPLIER_FLAGS, SUPPLIER_FLAG_LABEL, SUPPLIER_FLAGS, type SupplierFlag } from "@/lib/pl/supplierScore";
import { api } from "@/lib/ui/client";
import { cn } from "@/lib/utils";
import { AlibabaSupplierTable, type Lead } from "./AlibabaSupplierTable";

interface Summary { captured: number; scoring60: number; contacted: number; quoted: number; toContact: number }
interface Data { leads: Lead[]; summary: Summary; candidates: { id: string; name: string }[]; targets: { exworks: number | null; exworksDerived: boolean; maxMoq: number; unit: string } | null }

/** The leads, a summary strip, flag filters and the table. One candidate's, or all (with a candidate filter). */
export function SuppliersPanel({ candidateId, onQuoted, showCandidate, initialFilter = "" }: { candidateId?: string | null; onQuoted?: () => void; showCandidate?: boolean; initialFilter?: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [filter, setFilter] = useState<string>(initialFilter);
  const [hide, setHide] = useState<Set<SupplierFlag>>(new Set(DEFAULT_HIDDEN_SUPPLIER_FLAGS));
  const [showRejected, setShowRejected] = useState(false);
  const cand = candidateId ?? (filter || null);
  const load = useCallback(() => api<Data>(`/api/pl/suppliers${cand ? `?candidate=${cand}` : ""}`).then(setData).catch((e: Error) => toast.error(e.message)), [cand]);
  useEffect(() => { load(); }, [load]);
  const rows = useMemo(() => (data?.leads ?? []).filter((l) => !l.flags.some((f) => hide.has(f)) && (showRejected || l.status !== "rejected")), [data, hide, showRejected]);
  if (!data) return <Skeleton className="h-48 rounded-xl" />;
  const s = data.summary;
  const hiddenCount = data.leads.length - rows.length;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        {([["Captured", s.captured], ["Scoring 60+", s.scoring60], ["To contact", s.toContact], ["Contacted", s.contacted], ["Quoted", s.quoted]] as const).map(([k, v]) => (
          <span key={k}><span className="text-muted-foreground">{k}</span> <b className="num font-semibold">{v}</b></span>
        ))}
        {data.targets && <span className="text-meta text-muted-foreground">Scored against £{data.targets.exworks?.toFixed(2) ?? "—"} a {data.targets.unit}{data.targets.exworksDerived && data.targets.exworks != null ? " (landed ÷ 1.4)" : ""}, MOQ up to {data.targets.maxMoq.toLocaleString("en-GB")} (Gate 6)</span>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {!candidateId && (
          <NativeSelect className="mr-2 w-full sm:w-56" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Candidate">
            <NativeSelectOption value="">All candidates</NativeSelectOption>
            {data.candidates.map((c) => <NativeSelectOption key={c.id} value={c.id}>{c.name}</NativeSelectOption>)}
          </NativeSelect>
        )}
        <span className="text-meta text-muted-foreground">Hide:</span>
        {SUPPLIER_FLAGS.map((f) => (
          <button key={f} type="button" aria-pressed={hide.has(f)} onClick={() => { const y = new Set(hide); if (y.has(f)) y.delete(f); else y.add(f); setHide(y); }}
            className={cn("cursor-pointer rounded-full border px-2.5 py-1", hide.has(f) ? "border-primary bg-primary-soft font-medium text-primary-ink" : "border-border text-muted-foreground hover:bg-subtle hover:text-foreground")}>{SUPPLIER_FLAG_LABEL[f]}</button>
        ))}
        <label className="ml-2 flex cursor-pointer items-center gap-2 text-meta text-muted-foreground"><Switch checked={showRejected} onCheckedChange={setShowRejected} /> Show rejected</label>
        {hiddenCount > 0 && <span className="text-meta text-muted-foreground">· <span className="num">{hiddenCount}</span> hidden</span>}
      </div>
      {data.leads.length ? <AlibabaSupplierTable rows={rows} showCandidate={showCandidate && !cand} onChanged={load} onQuoted={() => { load(); onQuoted?.(); }} />
        : <EmptyState icon={<FactoryIcon />} title="No suppliers yet" action={<Button variant="secondary" asChild><Link href="/help/howto/pl-finding-suppliers">Finding suppliers</Link></Button>}>Search Alibaba with the extension (0.5.0+) and click <b>Send suppliers to Private label</b> on each results page.</EmptyState>}
    </div>
  );
}

/** The candidate's Suppliers section: Copy RFQ, the strip and the table. */
export function SuppliersSection({ candidateId, onQuoted }: { candidateId: string; onQuoted: () => void }) {
  const [copying, setCopying] = useState(false);
  const copy = async () => {
    setCopying(true);
    try {
      const r = await api<{ text: string; missing: string[] }>(`/api/pl/candidates/${candidateId}/rfq`);
      await navigator.clipboard.writeText(r.text);
      toast.success("RFQ copied", r.missing.length ? { description: `Left out, as it's empty: ${r.missing.join("; ")}` } : undefined);
    } catch (e) {
      toast.error(`Couldn't copy: ${(e as Error).message}`);
    } finally {
      setCopying(false);
    }
  };
  return (
    <section className="panel space-y-3 p-4" id="suppliers">
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto flex items-center gap-1">
          <h2 className="font-heading text-base font-bold">Suppliers</h2>
          <InfoTip label="About suppliers">
            <p>Alibaba listings sent from the extension, scored 0–100 against Gate 6&apos;s target price, MOQ and unit: price 35, MOQ 20, trust 25, relevance 20.</p>
            <p>Message the top three with the RFQ, then <b>Add quote</b> when they answer. Hover a score for its parts.</p>
          </InfoTip>
        </div>
        <Button variant="secondary" size="sm" onClick={copy} loading={copying}>{!copying && <ClipboardCopyIcon />} Copy RFQ</Button>
      </div>
      <SuppliersPanel candidateId={candidateId} onQuoted={onQuoted} />
    </section>
  );
}
