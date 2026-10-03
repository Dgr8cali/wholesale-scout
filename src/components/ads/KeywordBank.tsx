"use client";

import { ChevronRightIcon, LoaderIcon, PlusIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { SortTh, useSortable } from "@/components/SortableTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BANK_SOURCE_LABEL, type BankRow, type BankSource } from "@/lib/ads/bank";
import { api } from "@/lib/ui/client";
import { cn } from "@/lib/utils";

interface Bank { asin: string; rows: BankRow[]; counts: Record<BankSource, number>; candidate: string | null; headTerms: string[] }

const STATUS_CLS: Record<BankRow["status"], string> = { "targeted exact": "bg-pass-soft text-pass", "targeted broad": "bg-brand-soft text-brand", negatived: "bg-fail-soft text-fail", "not targeted": "bg-empty-soft text-ink-2" };
const acosTxt = (a: number | null) => (a == null ? "—" : Number.isFinite(a) ? `${(a * 100).toFixed(1)}%` : "no sales");

/** A product's keyword bank, folded until opened (on the dashboard). */
export function KeywordBankPanel({ asin }: { asin: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" className="flex items-center gap-1 text-xs font-medium text-brand hover:underline" onClick={() => setOpen((v) => !v)}>
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
  const load = useCallback(() => {
    api<Bank>(`/api/ads/keywords?asin=${asin}`).then((b) => { setBank(b); setError(null); setSel((s) => new Set([...s].filter((n) => b.rows.some((r) => r.norm === n)))); }).catch((e: Error) => setError(e.message));
  }, [asin]);
  useEffect(() => { load(); }, [load]);
  const s = useSortable(`ads.bank.${asin}`, bank?.rows ?? [], {
    term: { value: (r) => r.norm }, source: { value: (r) => r.sources.join(",") }, searches: { value: (r) => r.searches, kind: "number" },
    clicks: { value: (r) => r.clicks, kind: "number" }, orders: { value: (r) => r.orders, kind: "number" }, acos: { value: (r) => (r.acos != null && Number.isFinite(r.acos) ? r.acos : r.acos == null ? null : 99), kind: "number" },
    rank: { value: (r) => r.rank?.position ?? (r.rank ? 49 : null), kind: "number" }, status: { value: (r) => r.status },
  });
  if (error) return <p className="text-sm text-fail">{error}</p>;
  if (!bank) return <p className="text-sm text-muted-foreground">Loading the keyword bank…</p>;
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
  const chosen = [...sel];
  const shown = s.rows.map((r) => r.norm);
  const all = shown.length > 0 && shown.every((n) => sel.has(n));
  const toggle = (n: string) => setSel((x) => { const y = new Set(x); if (y.has(n)) y.delete(n); else y.add(n); return y; });
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {(Object.keys(bank.counts) as BankSource[]).map((k) => `${BANK_SOURCE_LABEL[k]} ${bank.counts[k]}`).join(" · ")}
        {!bank.candidate && " · Opportunity Explorer's terms come from a linked private-label candidate (Gate 5)"}. Terms are merged by their normalised text.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input className="h-8 w-72" placeholder="Add terms (comma or one a line)" value={adding} onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && adding.trim()) act("add", adding.split(/[,\n]/)); }} />
        <Button size="sm" variant="outline" disabled={!adding.trim() || !!busy} onClick={() => act("add", adding.split(/[,\n]/))}><PlusIcon /> Add</Button>
        {chosen.length > 0 && (
          <>
            <span className="text-sm">{chosen.length} selected</span>
            <Button size="sm" disabled={!!busy} onClick={() => act("exact", chosen)}>{busy === "exact" && <LoaderIcon className="animate-spin" />} Add as exact</Button>
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => act("negative", chosen)}>{busy === "negative" && <LoaderIcon className="animate-spin" />} Add as negative</Button>
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => act("track", chosen)}>Track rank</Button>
          </>
        )}
        <Link className="ml-auto text-xs text-brand hover:underline" href={`/ads/launch?asin=${asin}`}>Launcher (head terms from here) →</Link>
      </div>
      {!bank.rows.length ? <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Nothing in the bank yet: harvests, n-gram winners, rank-tracked terms, a linked candidate&apos;s Opportunity Explorer terms, and what you add here all land in it.</p> : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-[11px] tracking-wide text-muted-foreground uppercase">
              <th className="w-8 px-2 py-1.5"><input type="checkbox" aria-label="Select all shown" checked={all} onChange={() => setSel(all ? new Set() : new Set(shown))} /></th>
              <SortTh {...s.th("term")} className="px-2 py-1.5">Term</SortTh>
              <SortTh {...s.th("source")} className="px-2 py-1.5">Source</SortTh>
              <SortTh {...s.th("searches")} numeric className="px-2 py-1.5 text-right">Searches/mo</SortTh>
              <SortTh {...s.th("clicks")} numeric className="px-2 py-1.5 text-right">Our clicks</SortTh>
              <SortTh {...s.th("orders")} numeric className="px-2 py-1.5 text-right">Orders</SortTh>
              <SortTh {...s.th("acos")} numeric className="px-2 py-1.5 text-right">ACoS</SortTh>
              <SortTh {...s.th("rank")} numeric className="px-2 py-1.5 text-right" title="The latest organic rank check">Organic rank</SortTh>
              <SortTh {...s.th("status")} className="px-2 py-1.5">Status</SortTh>
              <th className="px-2 py-1.5" />
            </tr></thead>
            <tbody>{s.rows.map((r) => (
              <tr key={r.norm} className={cn("border-b last:border-b-0", sel.has(r.norm) && "bg-brand-soft/30")}>
                <td className="px-2 py-1.5"><input type="checkbox" aria-label="Select" checked={sel.has(r.norm)} onChange={() => toggle(r.norm)} /></td>
                <td className="px-2 py-1.5">{r.text}{r.tracked && <span className="ml-1 text-[10px] text-muted-foreground uppercase" title="In the rank checks">tracked</span>}</td>
                <td className="px-2 py-1.5 text-xs text-muted-foreground">{r.sources.map((x) => BANK_SOURCE_LABEL[x]).join(", ")}</td>
                <td className="num px-2 py-1.5 text-right">{r.searches?.toLocaleString("en-GB") ?? "—"}</td>
                <td className="num px-2 py-1.5 text-right">{r.clicks || "—"}</td>
                <td className="num px-2 py-1.5 text-right">{r.orders || "—"}</td>
                <td className="num px-2 py-1.5 text-right">{acosTxt(r.acos)}</td>
                <td className="num px-2 py-1.5 text-right">{r.rank ? (r.rank.position != null ? `#${r.rank.position}` : ">48") : "—"}</td>
                <td className="px-2 py-1.5"><span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap", STATUS_CLS[r.status])}>{r.status}</span></td>
                <td className="px-2 py-1.5 text-right">{r.sources.includes("manual") && <button type="button" aria-label="Remove your term" title="Remove (yours only)" onClick={() => act("remove", [r.norm])}><XIcon className="size-3.5 text-muted-foreground hover:text-fail" /></button>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
