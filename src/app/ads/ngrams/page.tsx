"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePageCrumbs } from "@/components/Crumbs";
import { EmptyState, ErrorState } from "@/components/States";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ProductPicker, useAdsProduct } from "@/components/ads/ProductPicker";
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
type Sort = "cost" | "waste" | "clicks" | "orders" | "terms";

/** Ads → N-grams: every search term's words and word pairs, summed per product. */
export default function AdsNgramsPage() {
  usePageCrumbs([{ label: "Ads", href: "/ads/dashboard" }, { label: "N-grams" }]);
  const [d, setD] = useState<NgramData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stored, setAsin] = useAdsProduct(d?.products.map((p) => p.asin) ?? []);
  const asin = stored || d?.products[0]?.asin || "";
  const [size, setSize] = useState<"" | "1" | "2">("");
  const [sort, setSort] = useState<Sort>("cost");
  useEffect(() => { api<NgramData>("/api/ads/ngrams").then(setD).catch((e: Error) => setError(e.message)); }, []);
  const rows = useMemo(() => (d?.rows ?? []).filter((r) => (!asin || r.asin === asin) && (!size || String(r.size) === size)).sort((a, b) => (b[sort] as number) - (a[sort] as number)), [d, asin, size, sort]);
  if (error) return <ErrorState title="Couldn't load the n-grams" message={error} />;
  if (!d) return <Skeleton className="h-96 rounded-lg" />;
  const p = d.products.find((x) => x.asin === asin);
  const t = d.thresholds;
  return (
    <div className="space-y-5">
      <div className="max-w-3xl">
        <h1 className="page-title">N-grams</h1>
        <p className="text-sm text-muted-foreground">
          Every search term split into words and adjacent word pairs (common words like &quot;for&quot; and &quot;with&quot; left out, numbers kept), with the terms&apos; figures summed per product{d.range ? ` over ${day(d.range.from)} – ${day(d.range.to)}` : ""}.
          A word can waste money across many terms that each look too small to judge. <b>Waste</b> is spend in terms with no order.
          Rule 9 (<b>N-gram negative</b>): {t.negative.minClicks}+ clicks or {t.negative.spendOfPrice}% of the price, no order, in {t.negative.minTerms}+ terms and none with an order.
          Rule 10 (<b>N-gram winner</b>): {t.winner.minOrders}+ orders at or under the target across {t.winner.minTerms}+ terms. Thresholds on <Link className="underline" href="/ads/rules">Rules</Link>.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <ProductPicker products={d.products} value={asin} onChange={setAsin} all={false} />
        <label className="space-y-1"><span className="field-label">Grams</span>
          <NativeSelect value={size} onChange={(e) => setSize(e.target.value as "" | "1" | "2")}>
            <NativeSelectOption value="">Words and pairs</NativeSelectOption><NativeSelectOption value="1">Words</NativeSelectOption><NativeSelectOption value="2">Word pairs</NativeSelectOption>
          </NativeSelect></label>
        <label className="space-y-1"><span className="field-label">Sort</span>
          <NativeSelect value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <NativeSelectOption value="cost">Spend</NativeSelectOption><NativeSelectOption value="waste">Waste (spend, no order)</NativeSelectOption>
            <NativeSelectOption value="clicks">Clicks</NativeSelectOption><NativeSelectOption value="orders">Orders</NativeSelectOption><NativeSelectOption value="terms">Terms</NativeSelectOption>
          </NativeSelect></label>
        {p && <span className="pb-2 text-sm text-muted-foreground">Price {p.price != null ? gbp(p.price) : "unknown"} · target ACoS {Math.round(p.targetAcos * 100)}%</span>}
      </div>
      {!rows.length ? <EmptyState title="No search terms yet">Import a bulk export with search term data.</EmptyState> : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-[11px] tracking-wide text-muted-foreground uppercase">
              <th className="px-2 py-1.5">Gram</th><th className="px-2 py-1.5 text-right">Terms</th><th className="px-2 py-1.5 text-right">Impr.</th><th className="px-2 py-1.5 text-right">Clicks</th>
              <th className="px-2 py-1.5 text-right">Spend</th><th className="px-2 py-1.5 text-right">Orders</th><th className="px-2 py-1.5 text-right">Sales</th><th className="px-2 py-1.5 text-right">ACoS</th><th className="px-2 py-1.5 text-right">Waste</th><th className="px-2 py-1.5">Rules</th>
            </tr></thead>
            <tbody>{rows.slice(0, 300).map((g) => (
              <tr key={g.gram} className="border-b last:border-b-0">
                <td className="px-2 py-1.5"><span className="font-medium">{g.gram}</span> <span className="text-xs text-muted-foreground" title={g.examples.join("\n")}>e.g. {g.examples.slice(0, 2).join(", ")}</span></td>
                <td className="num px-2 py-1.5 text-right" title={`${g.convertingTerms} with an order`}>{g.terms}<span className="text-muted-foreground"> ({g.convertingTerms})</span></td>
                <td className="num px-2 py-1.5 text-right">{g.impressions?.toLocaleString("en-GB") ?? "—"}</td>
                <td className="num px-2 py-1.5 text-right">{g.clicks}</td>
                <td className="num px-2 py-1.5 text-right">{gbp(g.cost)}</td>
                <td className="num px-2 py-1.5 text-right">{g.orders}</td>
                <td className="num px-2 py-1.5 text-right">{gbp(g.sales)}</td>
                <td className={cn("num px-2 py-1.5 text-right", p && g.acos != null && g.acos <= p.targetAcos && "text-pass", g.acos == null && g.cost > 0 && "text-fail")}>{acosTxt(g)}</td>
                <td className={cn("num px-2 py-1.5 text-right", g.waste > 0 && "text-fail")}>{gbp(g.waste)}</td>
                <td className="px-2 py-1.5">{g.trigger && <Link href="/ads/proposals" className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", g.trigger === "negative" ? "bg-fail-soft text-fail" : "bg-pass-soft text-pass")}>{g.trigger === "negative" ? "Rule 9: negative" : "Rule 10: winner"}</Link>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
