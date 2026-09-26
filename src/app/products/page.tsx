"use client";

import { SearchIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePageCrumbs } from "@/components/Crumbs";
import { RecordPurchaseDialog } from "@/components/product/RecordPurchaseDialog";
import { ProductThumb } from "@/components/ProductThumb";
import { EmptyState, ErrorState } from "@/components/States";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ProductListItem } from "@/lib/server/productPage";
import { api, gbp } from "@/lib/ui/client";
import { ago } from "@/lib/ui/when";

/** Every product the app has screened: find one and open its page. */
export default function ProductsPage() {
  usePageCrumbs([{ label: "Products" }]);
  const [q, setQ] = useState("");
  const [text, setText] = useState("");
  const [verdict, setVerdict] = useState("all");
  const [bought, setBought] = useState(false);
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ items: ProductListItem[]; more: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Search as you type, a moment after the last key.
  useEffect(() => { const t = setTimeout(() => { setText(q); setPage(0); }, 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => {
    const s = new URLSearchParams({ page: String(page) });
    if (text.trim()) s.set("q", text.trim());
    if (verdict !== "all") s.set("verdict", verdict);
    if (bought) s.set("bought", "1");
    api<{ items: ProductListItem[]; more: boolean }>(`/api/products?${s}`).then(setData).catch((e: Error) => setError(e.message));
  }, [text, verdict, bought, page]);

  if (error) return <ErrorState title="Couldn't load products" message={error} />;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Products</h1>
          <p className="text-sm text-muted-foreground">Every product the app has screened, newest first, with its latest verdict on your default profile. Open one for its page: the decision, history, suppliers and your purchases.</p>
        </div>
        <RecordPurchaseDialog />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-80 max-w-full">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Name, brand, ASIN or EAN" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search products" />
        </div>
        <ToggleGroup type="single" variant="outline" size="sm" value={verdict} onValueChange={(v) => { if (v) { setVerdict(v); setPage(0); } }}>
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          <ToggleGroupItem value="pass">Pass</ToggleGroupItem>
          <ToggleGroupItem value="warn">Warn</ToggleGroupItem>
          <ToggleGroupItem value="fail">Fail</ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup type="single" variant="outline" size="sm" value={bought ? "bought" : ""} onValueChange={(v) => { setBought(v === "bought"); setPage(0); }}>
          <ToggleGroupItem value="bought">Bought</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {!data ? <Skeleton className="h-96" /> : data.items.length === 0 ? (
        <EmptyState icon={<SearchIcon />} title="No products match">
          Try fewer words, or the ASIN. A product the app hasn&apos;t seen can be checked on Check ASINs.
        </EmptyState>
      ) : (
        <>
          <div className="panel overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Product</TableHead>
                  <TableHead>Verdict</TableHead>
                  <TableHead className="text-right">Sells at</TableHead>
                  <TableHead className="text-right">Max landed</TableHead>
                  <TableHead className="text-right">FBA sellers</TableHead>
                  <TableHead className="text-right">Your share / mo</TableHead>
                  <TableHead className="pr-4">Screened</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((p) => (
                  <TableRow key={p.asin} data-verdict={p.verdict ?? "empty"}>
                    <TableCell className="max-w-md pl-4 whitespace-normal">
                      <div className="flex gap-2.5">
                        <ProductThumb url={p.image_url} asin={p.asin} title={p.title ?? p.asin} brand={p.brand} size={36} />
                        <div className="min-w-0">
                          <Link className="line-clamp-2 text-sm font-medium hover:text-brand hover:underline" href={`/products/${p.asin}`}>{p.title ?? p.asin}</Link>
                          <p className="num text-2xs text-muted-foreground">{p.asin}{p.brand ? ` · ${p.brand}` : ""}{p.bought && <Badge variant="brand" className="ml-1.5 h-4 px-1.5 font-sans">bought</Badge>}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{p.verdict ? <Badge variant={p.verdict as "pass"}>{p.verdict}</Badge> : "—"}</TableCell>
                    <TableCell className="num text-right">{gbp(p.sell_price)}</TableCell>
                    <TableCell className="num text-right">{gbp(p.max_landed)}</TableCell>
                    <TableCell className="num text-right">{p.fba_sellers ?? "—"}</TableCell>
                    <TableCell className="num text-right">{p.share_month ?? "—"}</TableCell>
                    <TableCell className="pr-4 text-xs text-muted-foreground">{p.screened_at ? ago(p.screened_at) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((n) => n - 1)}>Previous</Button>
            <span className="text-xs text-muted-foreground">Page {page + 1}</span>
            <Button variant="outline" size="sm" disabled={!data.more} onClick={() => setPage((n) => n + 1)}>Next</Button>
          </div>
        </>
      )}
    </div>
  );
}
