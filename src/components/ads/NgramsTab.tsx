"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ErrorState } from "@/components/States";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { InfoTip } from "@/components/ui/info-tip";
import { StatusChip } from "@/components/ui/status-chip";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/ui/client";
import { cn } from "@/lib/utils";

export interface GramRow {
  asin: string; gram: string; size: 1 | 2; impressions: number | null; clicks: number; cost: number; orders: number; sales: number;
  acos: number | null; waste: number; terms: number; convertingTerms: number; examples: string[]; campaigns: number; trigger: "negative" | "winner" | null;
}
export interface NgramData { range: { from: string; to: string } | null; products: { asin: string; price: number | null; targetAcos: number }[]; thresholds: { negative: Record<string, number>; winner: Record<string, number> }; rows: GramRow[] }

const gbp = (v: number) => `£${v.toFixed(2)}`;
const acosTxt = (g: GramRow) => (g.acos != null ? `${(g.acos * 100).toFixed(1)}%` : g.cost > 0 ? "no sales" : "—");
const day = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/**
 * Ads → Search terms → N-grams: every search term's words and word pairs, summed for the product the
 * page's picker chose (?asin=).
 */
export function NgramsTab({ asin }: { asin: string }) {
  const [d, setD] = useState<NgramData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState<"" | "1" | "2">("");
  useEffect(() => { api<NgramData>("/api/ads/ngrams").then(setD).catch((e: Error) => setError(e.message)); }, []);
  const rows = useMemo(() => (d?.rows ?? []).filter((r) => r.asin === asin && (!size || String(r.size) === size)), [d, asin, size]);
  if (error) return <ErrorState title="Couldn't load the n-grams" message={error} />;
  if (!d) return <Skeleton className="h-96 rounded-xl" />;
  const p = d.products.find((x) => x.asin === asin);
  const t = d.thresholds;
  const columns: DataColumn<GramRow>[] = [
    { id: "gram", header: "Gram", mobile: "title", sortValue: (g) => g.gram, cell: (g) => <><span className="font-medium">{g.gram}</span> <span className="text-meta text-muted-foreground" title={g.examples.join("\n")}>e.g. {g.examples.slice(0, 2).join(", ")}</span></> },
    { id: "terms", header: "Terms", numeric: true, sortValue: (g) => g.terms, cell: (g) => <span title={`${g.convertingTerms} with an order`}>{g.terms}<span className="text-muted-foreground"> ({g.convertingTerms})</span></span> },
    { id: "impressions", header: "Impr.", numeric: true, sortValue: (g) => g.impressions, cell: (g) => g.impressions?.toLocaleString("en-GB") ?? "—" },
    { id: "clicks", header: "Clicks", numeric: true, sortValue: (g) => g.clicks, cell: (g) => g.clicks },
    { id: "cost", header: "Spend", numeric: true, mobile: 1, sortValue: (g) => g.cost, cell: (g) => gbp(g.cost) },
    { id: "orders", header: "Orders", numeric: true, mobile: 2, sortValue: (g) => g.orders, cell: (g) => g.orders },
    { id: "sales", header: "Sales", numeric: true, sortValue: (g) => g.sales, cell: (g) => gbp(g.sales) },
    { id: "acos", header: "ACoS", numeric: true, sortValue: (g) => (g.acos != null ? g.acos : g.cost > 0 ? 1e9 : null), cell: (g) => <span className={cn(p && g.acos != null && g.acos <= p.targetAcos && "text-success", g.acos == null && g.cost > 0 && "text-danger")}>{acosTxt(g)}</span> },
    { id: "waste", header: "Waste", numeric: true, mobile: 3, sortValue: (g) => g.waste, cell: (g) => <span className={cn(g.waste > 0 && "text-danger")}>{gbp(g.waste)}</span> },
    { id: "trigger", header: "Rules", sortValue: (g) => g.trigger, cell: (g) => g.trigger && <Link href="/ads/proposals"><StatusChip tone={g.trigger === "negative" ? "bad" : "good"}>{g.trigger === "negative" ? "Rule 9: negative" : "Rule 10: winner"}</StatusChip></Link> },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1"><span className="field-label">Grams</span>
          <NativeSelect value={size} onChange={(e) => setSize(e.target.value as "" | "1" | "2")}>
            <NativeSelectOption value="">Words and pairs</NativeSelectOption><NativeSelectOption value="1">Words</NativeSelectOption><NativeSelectOption value="2">Word pairs</NativeSelectOption>
          </NativeSelect></label>
        {p && <span className="pb-2.5 text-sm text-muted-foreground">Price {p.price != null ? gbp(p.price) : "unknown"} · target ACoS {Math.round(p.targetAcos * 100)}%{d.range ? ` · ${day(d.range.from)} – ${day(d.range.to)}` : ""}</span>}
        <InfoTip label="About n-grams" className="mb-2">
          <p>Every search term split into words and adjacent word pairs (common words like &quot;for&quot; and &quot;with&quot; left out, numbers kept), with the terms&apos; figures summed per product. A word can waste money across many terms that each look too small to judge. <b>Waste</b> is spend in terms with no order.</p>
          <p>Rule 9 (<b>N-gram negative</b>): {t.negative.minClicks}+ clicks or {t.negative.spendOfPrice}% of the price, no order, in {t.negative.minTerms}+ terms and none with an order. Rule 10 (<b>N-gram winner</b>): {t.winner.minOrders}+ orders at or under the target across {t.winner.minTerms}+ terms. Thresholds on <Link className="text-primary underline" href="/ads/rules">Rules</Link>.</p>
        </InfoTip>
      </div>
      <DataTable rows={rows} columns={columns} getRowId={(g) => `${g.asin}|${g.gram}`} storageKey="ads.ngrams" caption="N-grams" initialSort={{ id: "cost", desc: true }}
        empty={{ title: "No search terms for this product yet", description: "Import a bulk export with search term data." }} />
    </div>
  );
}
