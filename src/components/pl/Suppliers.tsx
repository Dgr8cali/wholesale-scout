"use client";

import { ClipboardCopyIcon, ExternalLinkIcon, LoaderIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useDialogs } from "@/components/Dialogs";
import { SortTh, useSortable } from "@/components/SortableTable";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { DEFAULT_HIDDEN_SUPPLIER_FLAGS, SUPPLIER_FLAG_LABEL, SUPPLIER_FLAGS, type SupplierFlag } from "@/lib/pl/supplierScore";
import type { SupplierLead } from "@/lib/server/plSuppliers";
import { api } from "@/lib/ui/client";
import { cn } from "@/lib/utils";

type Lead = SupplierLead & { candidate_name?: string };
interface Summary { captured: number; scoring60: number; contacted: number; quoted: number; toContact: number }
interface Data { leads: Lead[]; summary: Summary; candidates: { id: string; name: string }[]; targets: { exworks: number | null; exworksDerived: boolean; maxMoq: number; unit: string } | null }

const FLAG_CLS: Record<SupplierFlag, string> = {
  NOT_FACTORY: "bg-warn-soft text-warn", UNIT_UNCLEAR: "bg-empty-soft text-ink-2", MOQ_TOO_HIGH: "bg-warn-soft text-warn", OFF_PRODUCT: "bg-fail-soft text-fail", HIGH_PRICE: "bg-fail-soft text-fail",
};
const STATUS_CLS: Record<string, string> = { new: "text-muted-foreground", contacted: "text-brand", quoted: "text-pass", rejected: "text-fail" };
const scoreTone = (s: number | null) => (s == null ? "" : s >= 60 ? "text-pass" : s >= 40 ? "text-warn" : "text-fail");
const gbp = (v: number | null | undefined) => (v == null ? "—" : `£${v < 1 ? v.toFixed(4).replace(/0+$/, "").replace(/\.$/, "") : v.toFixed(2)}`);
const sym = (c: string | null) => (c === "GBP" ? "£" : c === "USD" ? "$" : c === "EUR" ? "€" : c ? `${c} ` : "");

/** The leads, a summary strip, flag filters and the table. One candidate's, or all (with a candidate filter). */
export function SuppliersPanel({ candidateId, onQuoted, showCandidate }: { candidateId?: string | null; onQuoted?: () => void; showCandidate?: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [filter, setFilter] = useState<string>("");
  const [hide, setHide] = useState<Set<SupplierFlag>>(new Set(DEFAULT_HIDDEN_SUPPLIER_FLAGS));
  const [showRejected, setShowRejected] = useState(false);
  const cand = candidateId ?? (filter || null);
  const load = useCallback(() => api<Data>(`/api/pl/suppliers${cand ? `?candidate=${cand}` : ""}`).then(setData).catch((e: Error) => toast.error(e.message)), [cand]);
  useEffect(() => { load(); }, [load]);
  const rows = useMemo(() => (data?.leads ?? []).filter((l) => !l.flags.some((f) => hide.has(f)) && (showRejected || l.status !== "rejected")), [data, hide, showRejected]);
  if (!data) return <p className="text-sm text-muted-foreground">Loading suppliers…</p>;
  const s = data.summary;
  const hiddenCount = data.leads.length - rows.length;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        {([["Captured", s.captured], ["Scoring 60+", s.scoring60], ["To contact", s.toContact], ["Contacted", s.contacted], ["Quoted", s.quoted]] as const).map(([k, v]) => (
          <span key={k}><span className="text-muted-foreground">{k}</span> <b className="num">{v}</b></span>
        ))}
        {data.targets && <span className="text-xs text-muted-foreground">Scored against £{data.targets.exworks?.toFixed(2) ?? "—"} a {data.targets.unit}{data.targets.exworksDerived && data.targets.exworks != null ? " (landed ÷ 1.4)" : ""}, MOQ up to {data.targets.maxMoq.toLocaleString("en-GB")} (Gate 6)</span>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {!candidateId && (
          <NativeSelect className="h-8 w-56" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Candidate">
            <NativeSelectOption value="">All candidates</NativeSelectOption>
            {data.candidates.map((c) => <NativeSelectOption key={c.id} value={c.id}>{c.name}</NativeSelectOption>)}
          </NativeSelect>
        )}
        <span className="text-muted-foreground">Hide:</span>
        {SUPPLIER_FLAGS.map((f) => (
          <button key={f} type="button" aria-pressed={hide.has(f)} onClick={() => { const y = new Set(hide); if (y.has(f)) y.delete(f); else y.add(f); setHide(y); }}
            className={cn("rounded-full border px-2 py-0.5", hide.has(f) ? "border-ink-2 bg-ink-2 text-white" : "text-muted-foreground hover:text-foreground")}>{SUPPLIER_FLAG_LABEL[f]}</button>
        ))}
        <label className="ml-2 flex items-center gap-1 text-muted-foreground"><input type="checkbox" checked={showRejected} onChange={(e) => setShowRejected(e.target.checked)} /> rejected</label>
        {hiddenCount > 0 && <span className="text-muted-foreground">· {hiddenCount} hidden</span>}
      </div>
      {data.leads.length ? <LeadsTable rows={rows} showCandidate={showCandidate && !cand} onChanged={load} onQuoted={() => { load(); onQuoted?.(); }} />
        : <p className="text-sm text-muted-foreground">No suppliers yet. Search Alibaba with the extension (0.5.0+) loaded and click <b>Send suppliers to Private label</b> on each results page. See <Link className="text-brand underline" href="/help/howto/pl-finding-suppliers">finding suppliers</Link>.</p>}
    </div>
  );
}

function LeadsTable({ rows, showCandidate, onChanged, onQuoted }: { rows: Lead[]; showCandidate?: boolean; onChanged: () => void; onQuoted: () => void }) {
  const { prompt } = useDialogs();
  const [busy, setBusy] = useState<string | null>(null);
  const t = useSortable("pl.suppliers", rows, {
    score: { value: (l) => l.score, kind: "number" },
    supplier: { value: (l) => l.supplier_name, kind: "text" },
    candidate: { value: (l) => l.candidate_name ?? "", kind: "text" },
    ours: { value: (l) => l.score_breakdown?.perUnit ?? null, kind: "number" },
    listed: { value: (l) => l.price_max ?? l.price_min, kind: "number" },
    moq: { value: (l) => l.score_breakdown?.moqOurs ?? l.moq, kind: "number" },
    years: { value: (l) => l.supplier_years, kind: "number" },
    rating: { value: (l) => l.rating, kind: "number" },
    reviews: { value: (l) => l.review_count, kind: "number" },
    badges: { value: (l) => l.badges.length, kind: "number" },
    sold: { value: (l) => l.sold_count, kind: "number" },
    flags: { value: (l) => l.flags.length, kind: "number" },
    status: { value: (l) => ["new", "contacted", "quoted", "rejected"].indexOf(l.status), kind: "number" },
  }, { key: "score", dir: "desc" });
  const act = async (id: string, f: () => Promise<unknown>, ok?: string) => {
    setBusy(id);
    try { await f(); if (ok) toast.success(ok); onChanged(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const patch = (l: Lead, json: Record<string, unknown>, ok?: string) => act(l.id, () => api(`/api/pl/suppliers/${l.id}`, { method: "PATCH", json }), ok);
  const reject = async (l: Lead) => {
    const why = await prompt({ title: `Reject ${l.supplier_name ?? "this supplier"}?`, label: "Why (kept with the lead)", confirmLabel: "Reject" });
    if (why) await patch(l, { status: "rejected", reject_reason: why }, "Rejected");
  };
  const notes = async (l: Lead) => {
    const text = await prompt({ title: `Notes: ${l.supplier_name ?? "supplier"}`, label: "Notes", defaultValue: l.notes ?? "", confirmLabel: "Save" });
    if (text != null) await patch(l, { notes: text }, "Notes saved");
  };
  const quote = (l: Lead) => act(l.id, async () => { await api(`/api/pl/suppliers/${l.id}`, { method: "POST", json: { action: "quote" } }); onQuoted(); }, `Quote started for ${l.supplier_name}: fill it in under Quotes`);
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-xs">
        <thead><tr className="border-b text-left text-[11px] tracking-wide text-muted-foreground uppercase">
          <SortTh {...t.th("score")} numeric className="px-2 py-1.5 text-right">Score</SortTh>
          <SortTh {...t.th("supplier")} className="px-2 py-1.5">Supplier</SortTh>
          {showCandidate && <SortTh {...t.th("candidate")} className="px-2 py-1.5">Candidate</SortTh>}
          <SortTh {...t.th("ours")} numeric className="px-2 py-1.5 text-right" title="The price per unit of our product, at the MOQ (the top of the range)">Per our unit</SortTh>
          <SortTh {...t.th("listed")} numeric className="px-2 py-1.5 text-right">Listed</SortTh>
          <SortTh {...t.th("moq")} numeric className="px-2 py-1.5 text-right">MOQ</SortTh>
          <SortTh {...t.th("years")} numeric className="px-2 py-1.5 text-right">Yrs</SortTh>
          <SortTh {...t.th("rating")} numeric className="px-2 py-1.5 text-right">Rating</SortTh>
          <SortTh {...t.th("reviews")} numeric className="px-2 py-1.5 text-right">Reviews</SortTh>
          <SortTh {...t.th("badges")} numeric className="px-2 py-1.5">Badges</SortTh>
          <SortTh {...t.th("sold")} numeric className="px-2 py-1.5 text-right">Sold</SortTh>
          <SortTh {...t.th("flags")} numeric className="px-2 py-1.5">Flags</SortTh>
          <SortTh {...t.th("status")} numeric className="px-2 py-1.5">Status</SortTh>
          <th className="px-2 py-1.5" />
        </tr></thead>
        <tbody>{t.rows.map((l) => {
          const b = l.score_breakdown;
          const parts = b ? Object.entries(b.parts).map(([k, p]) => `${k} ${p.points}/${p.max}: ${p.note}`).join("\n") : "";
          return (
            <tr key={l.id} className={cn("border-b align-top last:border-0", l.status === "rejected" && "opacity-60")}>
              <td className={cn("num px-2 py-1.5 text-right font-semibold", scoreTone(l.score))} title={parts}>{l.score ?? "—"}</td>
              <td className="max-w-64 px-2 py-1.5">
                <span className="block font-medium">{l.supplier_name ?? "—"}{l.country && <span className="ml-1 font-normal text-muted-foreground">{l.country}</span>}</span>
                <span className="line-clamp-2 text-muted-foreground" title={l.title ?? ""}>{l.title}</span>
                {l.notes && <span className="block text-muted-foreground italic">{l.notes.slice(0, 120)}</span>}
                {l.status === "rejected" && l.reject_reason && <span className="block text-fail">Rejected: {l.reject_reason}</span>}
              </td>
              {showCandidate && <td className="px-2 py-1.5"><Link className="text-brand hover:underline" href={`/pl/candidates?c=${l.candidate_id}#suppliers`}>{l.candidate_name}</Link></td>}
              <td className="num px-2 py-1.5 text-right" title={b?.parts.price.note}>{b?.perUnit != null ? `${gbp(b.perUnit)}/${b.unit}` : <span className="text-muted-foreground">?</span>}</td>
              <td className="num px-2 py-1.5 text-right whitespace-nowrap">{l.price_min != null ? `${sym(l.currency)}${l.price_min}${l.price_max != null && l.price_max !== l.price_min ? `–${l.price_max}` : ""}` : "—"}{l.price_unit && <span className="text-muted-foreground">/{l.price_unit}</span>}</td>
              <td className="num px-2 py-1.5 text-right whitespace-nowrap" title={b?.parts.moq.note}>{l.moq?.toLocaleString("en-GB") ?? "—"} <span className="text-muted-foreground">{l.moq_unit ?? ""}</span></td>
              <td className="num px-2 py-1.5 text-right">{l.supplier_years ?? "—"}</td>
              <td className="num px-2 py-1.5 text-right">{l.rating ?? "—"}</td>
              <td className="num px-2 py-1.5 text-right">{l.review_count ?? "—"}</td>
              <td className="px-2 py-1.5"><span className="flex flex-wrap gap-1">{l.badges.map((x) => <span key={x} className="rounded bg-surface-2 px-1 py-px text-[10px] whitespace-nowrap">{x}</span>)}</span></td>
              <td className="num px-2 py-1.5 text-right">{l.sold_count ?? "—"}</td>
              <td className="px-2 py-1.5"><span className="flex flex-wrap gap-1">{l.flags.map((f) => <span key={f} className={cn("rounded-full px-1.5 py-px text-[10px] font-semibold whitespace-nowrap uppercase", FLAG_CLS[f])}>{SUPPLIER_FLAG_LABEL[f]}</span>)}</span></td>
              <td className={cn("px-2 py-1.5 capitalize", STATUS_CLS[l.status])}>{l.status}</td>
              <td className="px-2 py-1.5">
                <span className="flex flex-wrap gap-x-2 gap-y-0.5 whitespace-nowrap">
                  {busy === l.id && <LoaderIcon className="size-3.5 animate-spin" />}
                  <a className="inline-flex items-center gap-0.5 text-brand hover:underline" href={l.listing_url} target="_blank" rel="noreferrer">Listing <ExternalLinkIcon className="size-3" /></a>
                  {l.store_url && <a className="inline-flex items-center gap-0.5 text-brand hover:underline" href={l.store_url} target="_blank" rel="noreferrer">Store <ExternalLinkIcon className="size-3" /></a>}
                  {l.status === "new" && <button type="button" disabled={!!busy} className="text-brand hover:underline" onClick={() => patch(l, { status: "contacted" }, "Marked contacted")}>Contacted</button>}
                  {l.status !== "quoted" && <button type="button" disabled={!!busy} className="text-brand hover:underline" onClick={() => quote(l)}>Add quote</button>}
                  {l.status === "rejected" ? <button type="button" disabled={!!busy} className="text-brand hover:underline" onClick={() => patch(l, { status: "new" }, "Back to new")}>Un-reject</button>
                    : <button type="button" disabled={!!busy} className="text-fail hover:underline" onClick={() => reject(l)}>Reject</button>}
                  <button type="button" disabled={!!busy} className="text-brand hover:underline" onClick={() => notes(l)}>Notes</button>
                </span>
              </td>
            </tr>
          );
        })}</tbody>
      </table>
      {!rows.length && <p className="p-3 text-sm text-muted-foreground">Every supplier is hidden by the filters.</p>}
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
        <div className="mr-auto max-w-3xl">
          <h2 className="font-heading text-base font-bold">Suppliers</h2>
          <p className="text-sm text-muted-foreground">Alibaba listings sent from the extension, scored 0–100 against Gate 6&apos;s target price, MOQ and unit: price 35, MOQ 20, trust 25, relevance 20. Message the top three with the RFQ, then <b>Add quote</b> when they answer. Hover a score for its parts.</p>
        </div>
        <Button variant="outline" size="sm" onClick={copy} disabled={copying}>{copying ? <LoaderIcon className="animate-spin" /> : <ClipboardCopyIcon />} Copy RFQ</Button>
      </div>
      <SuppliersPanel candidateId={candidateId} onQuoted={onQuoted} />
    </section>
  );
}
