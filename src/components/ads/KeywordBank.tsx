"use client";

import { ChevronRightIcon, PlusIcon, TextSearchIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useDialogs } from "@/components/Dialogs";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip, type Tone } from "@/components/ui/status-chip";
import { BANK_SOURCE_LABEL, type BankRow, type BankSource } from "@/lib/ads/bank";
import { api } from "@/lib/ui/client";
import { cn } from "@/lib/utils";

interface Bank { asin: string; rows: BankRow[]; counts: Record<BankSource, number>; candidate: string | null; headTerms: string[] }

const STATUS_TONE: Record<BankRow["status"], Tone> = { "targeted exact": "good", "targeted broad": "info", negatived: "bad", "not targeted": "neutral" };
const acosTxt = (a: number | null) => (a == null ? "—" : Number.isFinite(a) ? `${(a * 100).toFixed(1)}%` : "no sales");
const sentence = (s: string) => s[0].toUpperCase() + s.slice(1);

/** A product's keyword bank, folded until opened (on the dashboard). */
export function KeywordBankPanel({ asin }: { asin: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" aria-expanded={open} className="flex cursor-pointer items-center gap-1 text-meta font-medium text-primary hover:underline" onClick={() => setOpen((v) => !v)}>
        <ChevronRightIcon className={cn("size-3.5 transition-transform", open && "rotate-90")} /> Keyword bank
      </button>
      {open && <div className="mt-2"><KeywordBank asin={asin} /></div>}
    </div>
  );
}

/**
 * Every term worth knowing for a product: Opportunity Explorer's, harvested, n-gram winners, rank
 * tracked and yours; with what the ads did with each and where it stands. Add as exact or negative
 * (queued as approved proposals for the next bulk sheet), or track its organic rank.
 */
export function KeywordBank({ asin }: { asin: string }) {
  const [bank, setBank] = useState<Bank | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const { confirm } = useDialogs();
  const load = useCallback(() => {
    api<Bank>(`/api/ads/keywords?asin=${asin}`).then((b) => { setBank(b); setError(null); setSel((s) => new Set([...s].filter((n) => b.rows.some((r) => r.norm === n)))); }).catch((e: Error) => setError(e.message));
  }, [asin]);
  useEffect(() => { load(); }, [load]);
  if (error) return <ErrorState title="Couldn't load the keyword bank" message={error} onRetry={load} />;
  if (!bank) return <Skeleton className="h-40 rounded-xl" />;
  const act = async (action: "exact" | "negative" | "track" | "add" | "remove", terms: string[]) => {
    setBusy(action);
    try {
      const r = await api<{ done?: number; added?: number; skipped?: string[] }>("/api/ads/keywords", { method: "POST", json: { asin, action, terms } });
      const n = r.done ?? r.added ?? 0;
      const what = { exact: "queued as exact keywords (approved: export them on Proposals)", negative: "queued as negatives (approved: export them on Proposals)", track: "added to rank checks", add: "added", remove: "removed" }[action];
      toast.success(`${action === "remove" ? "Removed" : `${n} ${what}`}${r.skipped?.length ? `; skipped: ${r.skipped.join("; ")}` : ""}`);
      if (action === "add") setAdding("");
      setSel(new Set());
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const remove = async (r: BankRow) => {
    if (!(await confirm({ title: `Remove "${r.text}"?`, description: "The term you added leaves this product's keyword bank.", confirmLabel: "Remove", destructive: true }))) return;
    act("remove", [r.norm]);
  };
  const chosen = [...sel];
  const shown = bank.rows.map((r) => r.norm);
  const all = shown.length > 0 && shown.every((n) => sel.has(n));
  const toggle = (n: string) => setSel((x) => { const y = new Set(x); if (y.has(n)) y.delete(n); else y.add(n); return y; });
  const columns: DataColumn<BankRow>[] = [
    {
      id: "select", header: <input type="checkbox" aria-label="Select all" checked={all} onChange={() => setSel(all ? new Set() : new Set(shown))} />, className: "w-8", mobileHidden: true,
      cell: (r) => <input type="checkbox" aria-label={`Select ${r.text}`} checked={sel.has(r.norm)} onChange={() => toggle(r.norm)} />,
    },
    {
      id: "term", header: "Term", mobile: "title", sortValue: (r) => r.norm,
      cell: (r) => (
        <span className="inline-flex items-center gap-2">
          <input type="checkbox" className="sm:hidden" aria-label={`Select ${r.text}`} checked={sel.has(r.norm)} onChange={() => toggle(r.norm)} />
          <span>{r.text}{r.tracked && <span className="ml-1 text-xs text-muted-foreground" title="In the rank checks">tracked</span>}</span>
        </span>
      ),
    },
    { id: "source", header: "Source", sortValue: (r) => r.sources.join(","), cell: (r) => <span className="text-meta text-muted-foreground">{r.sources.map((x) => BANK_SOURCE_LABEL[x]).join(", ")}</span> },
    { id: "searches", header: "Searches/mo", numeric: true, mobile: 1, sortValue: (r) => r.searches, cell: (r) => r.searches?.toLocaleString("en-GB") ?? "—" },
    { id: "clicks", header: "Our clicks", numeric: true, sortValue: (r) => r.clicks, cell: (r) => r.clicks || "—" },
    { id: "orders", header: "Orders", numeric: true, sortValue: (r) => r.orders, cell: (r) => r.orders || "—" },
    { id: "acos", header: "ACoS", numeric: true, mobile: 2, sortValue: (r) => (r.acos != null && Number.isFinite(r.acos) ? r.acos : r.acos == null ? null : 99), cell: (r) => acosTxt(r.acos) },
    { id: "rank", header: "Organic rank", numeric: true, sortValue: (r) => r.rank?.position ?? (r.rank ? 49 : null), cell: (r) => (r.rank ? (r.rank.position != null ? `#${r.rank.position}` : ">48") : "—") },
    { id: "status", header: "Status", mobile: 3, sortValue: (r) => r.status, cell: (r) => <StatusChip tone={STATUS_TONE[r.status]}>{sentence(r.status)}</StatusChip> },
    {
      id: "remove", header: <span className="sr-only">Remove</span>, className: "text-right",
      cell: (r) => r.sources.includes("manual") ? <Button size="sm" variant="danger" disabled={!!busy} onClick={() => remove(r)} title="Remove (yours only)"><XIcon /> Remove</Button> : null,
    },
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input className="h-8 w-full sm:w-72" placeholder="Add terms (comma or one a line)" value={adding} onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && adding.trim()) act("add", adding.split(/[,\n]/)); }} aria-label="Add terms" />
        <Button size="sm" variant="secondary" disabled={!adding.trim() || !!busy} loading={busy === "add"} onClick={() => act("add", adding.split(/[,\n]/))}><PlusIcon /> Add</Button>
        <InfoTip label="About the keyword bank">
          <p>{(Object.keys(bank.counts) as BankSource[]).map((k) => `${BANK_SOURCE_LABEL[k]} ${bank.counts[k]}`).join(" · ")}.</p>
          <p>{!bank.candidate && "Opportunity Explorer's terms come from a linked private-label candidate (Gate 5). "}Terms are merged by their normalised text. Add as exact and Add as negative queue approved proposals for the next bulk sheet; Track rank adds the term to the rank checks.</p>
        </InfoTip>
        {chosen.length > 0 && (
          <>
            <span className="text-sm"><span className="num">{chosen.length}</span> selected</span>
            <Button size="sm" variant="secondary" disabled={!!busy} loading={busy === "exact"} onClick={() => act("exact", chosen)}>Add as exact</Button>
            <Button size="sm" variant="secondary" disabled={!!busy} loading={busy === "negative"} onClick={() => act("negative", chosen)}>Add as negative</Button>
            <Button size="sm" variant="ghost" disabled={!!busy} loading={busy === "track"} onClick={() => act("track", chosen)}>Track rank</Button>
          </>
        )}
        <Link className="ml-auto text-meta text-primary hover:underline" href={`/ads/launch?asin=${asin}`}>Launcher (head terms from here) →</Link>
      </div>
      <DataTable rows={bank.rows} columns={columns} getRowId={(r) => r.norm} storageKey="ads.bank" caption="Keyword bank"
        rowClassName={(r) => (sel.has(r.norm) ? "bg-primary-soft/40" : undefined)}
        empty={{ icon: <TextSearchIcon />, title: "Nothing in the bank yet", description: "Harvests, n-gram winners, rank-tracked terms and what you add here all land in it." }} />
    </div>
  );
}
