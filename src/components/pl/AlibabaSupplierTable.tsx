"use client";

import { ExternalLinkIcon, FactoryIcon, MoreHorizontalIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useDialogs } from "@/components/Dialogs";
import { Button } from "@/components/ui/button";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { StatusChip, type Tone } from "@/components/ui/status-chip";
import { SUPPLIER_FLAG_LABEL, type SupplierFlag } from "@/lib/pl/supplierScore";
import type { SupplierLead } from "@/lib/server/plSuppliers";
import { api } from "@/lib/ui/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type Lead = SupplierLead & { candidate_name?: string };

const FLAG_TONE: Record<SupplierFlag, Tone> = {
  NOT_FACTORY: "warn", UNIT_UNCLEAR: "neutral", MOQ_TOO_HIGH: "warn", OFF_PRODUCT: "bad", HIGH_PRICE: "bad",
};
const STATUS_TONE: Record<string, Tone> = { new: "neutral", contacted: "info", quoted: "good", rejected: "bad" };
const STATUS_RANK = ["new", "contacted", "quoted", "rejected"];
const scoreTone = (s: number | null) => (s == null ? "" : s >= 60 ? "text-success" : s >= 40 ? "text-warn-ink" : "text-danger");
const gbp = (v: number | null | undefined) => (v == null ? "—" : `£${v < 1 ? v.toFixed(4).replace(/0+$/, "").replace(/\.$/, "") : v.toFixed(2)}`);
const sym = (c: string | null) => (c === "GBP" ? "£" : c === "USD" ? "$" : c === "EUR" ? "€" : c ? `${c} ` : "");

/**
 * The Alibaba supplier table (Supplier Scout leads): the one component behind Private label →
 * Suppliers & quotes and each candidate's Suppliers section.
 */
export function AlibabaSupplierTable({ rows, showCandidate, onChanged, onQuoted }: { rows: Lead[]; showCandidate?: boolean; onChanged: () => void; onQuoted: () => void }) {
  const { prompt } = useDialogs();
  const [busy, setBusy] = useState<string | null>(null);
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
  const columns: DataColumn<Lead>[] = [
    {
      id: "score", header: "Score", numeric: true, mobile: 1, sortValue: (l) => l.score,
      cell: (l) => {
        const b = l.score_breakdown;
        const parts = b ? Object.entries(b.parts).map(([k, p]) => `${k} ${p.points}/${p.max}: ${p.note}`).join("\n") : "";
        return <span className={cn("font-semibold", scoreTone(l.score))} title={parts}>{l.score ?? "—"}</span>;
      },
    },
    {
      id: "supplier", header: "Supplier", mobile: "title", sortValue: (l) => l.supplier_name, className: "max-w-72 align-top",
      cell: (l) => (
        <div className="min-w-48">
          <span className="block font-medium">{l.supplier_name ?? "—"}{l.country && <span className="ml-1 font-normal text-muted-foreground">{l.country}</span>}</span>
          <span className="line-clamp-2 text-meta text-muted-foreground" title={l.title ?? ""}>{l.title}</span>
          {l.notes && <span className="block text-meta text-muted-foreground italic">{l.notes.slice(0, 120)}</span>}
          {l.status === "rejected" && l.reject_reason && <span className="block text-meta text-danger">Rejected: {l.reject_reason}</span>}
        </div>
      ),
    },
    ...(showCandidate ? [{ id: "candidate", header: "Candidate", sortValue: (l: Lead) => l.candidate_name ?? "", cell: (l: Lead) => <Link className="link" href={`/pl/candidates/${l.candidate_id}?tab=suppliers`}>{l.candidate_name}</Link> }] : []),
    {
      id: "ours", header: <span title="The price per unit of our product, at the MOQ (the top of the range)">Per our unit</span>, numeric: true, mobile: 2, sortValue: (l) => l.score_breakdown?.perUnit ?? null,
      cell: (l) => { const b = l.score_breakdown; return <span title={b?.parts.price.note}>{b?.perUnit != null ? `${gbp(b.perUnit)}/${b.unit}` : <span className="text-muted-foreground">?</span>}</span>; },
    },
    { id: "listed", header: "Listed", numeric: true, sortValue: (l) => l.price_max ?? l.price_min, cell: (l) => <span className="whitespace-nowrap">{l.price_min != null ? `${sym(l.currency)}${l.price_min}${l.price_max != null && l.price_max !== l.price_min ? `–${l.price_max}` : ""}` : "—"}{l.price_unit && <span className="text-muted-foreground">/{l.price_unit}</span>}</span> },
    { id: "moq", header: "MOQ", numeric: true, sortValue: (l) => l.score_breakdown?.moqOurs ?? l.moq, cell: (l) => <span className="whitespace-nowrap" title={l.score_breakdown?.parts.moq.note}>{l.moq?.toLocaleString("en-GB") ?? "—"} <span className="text-muted-foreground">{l.moq_unit ?? ""}</span></span> },
    { id: "years", header: "Yrs", numeric: true, sortValue: (l) => l.supplier_years, cell: (l) => l.supplier_years ?? "—" },
    { id: "rating", header: "Rating", numeric: true, sortValue: (l) => l.rating, cell: (l) => l.rating ?? "—" },
    { id: "reviews", header: "Reviews", numeric: true, sortValue: (l) => l.review_count, cell: (l) => l.review_count ?? "—" },
    { id: "badges", header: "Badges", sortValue: (l) => l.badges.length, cell: (l) => <span className="flex flex-wrap gap-1">{l.badges.map((x) => <span key={x} className="rounded-md bg-subtle px-1.5 py-px text-xs whitespace-nowrap">{x}</span>)}</span> },
    { id: "sold", header: "Sold", numeric: true, sortValue: (l) => l.sold_count, cell: (l) => l.sold_count ?? "—" },
    { id: "flags", header: "Flags", sortValue: (l) => l.flags.length, cell: (l) => <span className="flex flex-wrap gap-1">{l.flags.map((f) => <StatusChip key={f} tone={FLAG_TONE[f]} icon={false}>{SUPPLIER_FLAG_LABEL[f]}</StatusChip>)}</span> },
    { id: "status", header: "Status", mobile: 3, sortValue: (l) => STATUS_RANK.indexOf(l.status), cell: (l) => <StatusChip tone={STATUS_TONE[l.status] ?? "neutral"} icon={false}>{l.status[0].toUpperCase() + l.status.slice(1)}</StatusChip> },
    {
      id: "actions", header: <span className="sr-only">Actions</span>, headerClassName: "w-px", pinEnd: true,
      cell: (l) => (
        <div className="flex items-center justify-end gap-1 whitespace-nowrap">
          <Button size="sm" variant="ghost" asChild><a href={l.listing_url} target="_blank" rel="noreferrer">Listing <ExternalLinkIcon /></a></Button>
          {l.status !== "quoted" && <Button size="sm" variant="secondary" disabled={!!busy} loading={busy === l.id} onClick={() => quote(l)}>Add quote</Button>}
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button size="icon-sm" variant="ghost" aria-label={`More for ${l.supplier_name ?? "this supplier"}`} disabled={!!busy}><MoreHorizontalIcon /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {l.store_url && <DropdownMenuItem asChild><a href={l.store_url} target="_blank" rel="noreferrer"><ExternalLinkIcon /> Store</a></DropdownMenuItem>}
              {l.status === "new" && <DropdownMenuItem onSelect={() => patch(l, { status: "contacted" }, "Marked contacted")}>Mark contacted</DropdownMenuItem>}
              <DropdownMenuItem onSelect={() => notes(l)}>Notes</DropdownMenuItem>
              {l.status === "rejected" ? <DropdownMenuItem onSelect={() => patch(l, { status: "new" }, "Back to new")}>Un-reject</DropdownMenuItem>
                : <DropdownMenuItem variant="destructive" onSelect={() => reject(l)}>Reject</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];
  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowId={(l) => l.id}
      storageKey="pl.suppliers"
      caption="Alibaba suppliers"
      initialSort={{ id: "score", desc: true }}
      rowClassName={(l) => (l.status === "rejected" ? "opacity-60" : undefined)}
      empty={{ icon: <FactoryIcon />, title: "Every supplier is hidden by the filters", description: "Turn off a flag under Hide, or show the rejected ones." }}
    />
  );
}
