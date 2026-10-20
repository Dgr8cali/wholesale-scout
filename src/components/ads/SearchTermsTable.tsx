"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { InfoTip } from "@/components/ui/info-tip";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { StatusChip, type Tone } from "@/components/ui/status-chip";
import { TERM_STATUS_LABEL, type Ratios, type TermStatus, type Totals } from "@/lib/ads/metrics";
import { cn } from "@/lib/utils";

interface Matched { text: string; matchType: string | null; clicks: number; cost: number; orders: number }
export interface TermRow { campaign: string; campaignName: string; term: string; asin: string | null; totals: Totals; ratios: Ratios; status: TermStatus; why: string; from: string; to: string; breakEvenAcos: number | null; targetAcos: number; matched: Matched[] }

const gbp = (v: number | null | undefined) => (v == null ? "—" : `${v < 0 ? "−" : ""}£${Math.abs(v).toFixed(2)}`);
const pct = (v: number | null | undefined, dp = 1) => (v == null ? "—" : `${(v * 100).toFixed(dp)}%`);
const n0 = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString("en-GB"));
const TONE: Record<TermStatus, Tone> = { converting: "good", over_target: "warn", watch: "neutral", waste: "bad" };

/** ACoS against the target and break-even: green at or under the target, amber up to break-even, red over it. */
function acosTone(acos: number | null, target: number, breakEven: number | null) {
  if (acos == null) return "";
  if (acos <= target) return "text-success";
  if (breakEven != null && acos > breakEven) return "text-danger";
  return "text-warn-ink";
}

/** Ads → Search terms → All search terms: one product's terms (the Dashboard's old table), by campaign and status. */
export function SearchTermsTable({ rows, campaigns }: { rows: TermRow[]; campaigns: { id: string; name: string }[] }) {
  const [campaign, setCampaign] = useState("");
  const [status, setStatus] = useState<"" | TermStatus>("");
  const filtered = useMemo(() => rows.filter((t) => (!campaign || t.campaign === campaign) && (!status || t.status === status)), [rows, campaign, status]);
  const counts = useMemo(() => rows.filter((t) => !campaign || t.campaign === campaign).reduce<Record<string, number>>((a, t) => ({ ...a, [t.status]: (a[t.status] ?? 0) + 1 }), {}), [rows, campaign]);
  const columns: DataColumn<TermRow>[] = [
    {
      id: "term", header: "Search term", mobile: "title", sortValue: (t) => t.term,
      cell: (t) => (
        <div className="min-w-0">
          <div>{t.term}</div>
          {t.matched.length > 0 && <div className="text-meta text-muted-foreground" title={t.matched.map((m) => `${m.text} (${m.matchType ?? "targeting"}): ${m.clicks} clicks, £${m.cost.toFixed(2)}, ${m.orders} orders`).join("\n")}>matched by {t.matched.slice(0, 2).map((m) => `"${m.text}"${m.matchType ? ` ${m.matchType.toLowerCase()}` : ""}`).join(", ")}{t.matched.length > 2 ? ` +${t.matched.length - 2} more` : ""}</div>}
        </div>
      ),
    },
    { id: "campaign", header: "Campaign", sortValue: (t) => t.campaignName, cell: (t) => <span className="text-meta text-muted-foreground">{t.campaignName}</span> },
    { id: "clicks", header: "Clicks", numeric: true, sortValue: (t) => t.totals.clicks, cell: (t) => n0(t.totals.clicks) },
    { id: "orders", header: "Orders", numeric: true, mobile: 2, sortValue: (t) => t.totals.orders, cell: (t) => n0(t.totals.orders) },
    { id: "cost", header: "Spend", numeric: true, mobile: 1, sortValue: (t) => t.totals.cost, cell: (t) => gbp(t.totals.cost) },
    { id: "acos", header: "ACoS", numeric: true, sortValue: (t) => t.ratios.acos, cell: (t) => <span className={cn(acosTone(t.ratios.acos, t.targetAcos, t.breakEvenAcos))}>{pct(t.ratios.acos)}</span> },
    { id: "breakEven", header: "Break-even", numeric: true, sortValue: (t) => t.breakEvenAcos, cell: (t) => <span className="text-muted-foreground">{pct(t.breakEvenAcos)}</span> },
    { id: "status", header: "Status", mobile: 3, sortValue: (t) => TERM_STATUS_LABEL[t.status], cell: (t) => <StatusChip tone={TONE[t.status]} title={t.why}>{TERM_STATUS_LABEL[t.status]}</StatusChip> },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 space-y-1"><span className="field-label">Campaign</span>
          <NativeSelect value={campaign} onChange={(e) => setCampaign(e.target.value)} className="max-w-[min(20rem,calc(100vw-2rem))]">
            <NativeSelectOption value="">All campaigns</NativeSelectOption>
            {campaigns.filter((c) => rows.some((t) => t.campaign === c.id)).map((c) => <NativeSelectOption key={c.id} value={c.id}>{c.name}</NativeSelectOption>)}
          </NativeSelect></label>
        <label className="space-y-1"><span className="field-label">Status</span>
          <NativeSelect value={status} onChange={(e) => setStatus(e.target.value as "" | TermStatus)}>
            <NativeSelectOption value="">Any ({Object.values(counts).reduce((a, b) => a + b, 0)})</NativeSelectOption>
            {(Object.keys(TERM_STATUS_LABEL) as TermStatus[]).map((s) => <NativeSelectOption key={s} value={s}>{TERM_STATUS_LABEL[s]} ({counts[s] ?? 0})</NativeSelectOption>)}
          </NativeSelect></label>
        <InfoTip label="About the statuses" className="mb-2">
          <p>Converting: orders at or under the target ACoS. Over target: orders above it. Watch: no order yet, under 15 clicks. Waste: no order after 15 clicks, or after spending half the product&apos;s price.</p>
          <p>The Negative rule on <Link className="link" href="/ads/rules">Rules</Link> uses the same thresholds by default. ACoS is green at or under the target, amber up to break-even, red past it.</p>
        </InfoTip>
      </div>
      <DataTable rows={filtered} columns={columns} getRowId={(t) => `${t.campaign}|${t.term}`} storageKey="ads.terms" caption="Search terms" initialSort={{ id: "cost", desc: true }}
        empty={{ title: rows.length ? "No search terms match" : "No search terms for this product yet", description: rows.length ? "Clear a filter to see the rest." : "Import a bulk export with search term data." }} />
    </div>
  );
}
