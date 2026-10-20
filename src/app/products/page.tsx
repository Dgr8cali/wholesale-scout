"use client";

import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { RecordPurchaseDialog } from "@/components/product/RecordPurchaseDialog";
import { ProductThumb } from "@/components/ProductThumb";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductDecision, StatusChip } from "@/components/ui/status-chip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ProductListItem } from "@/lib/server/productPage";
import { api, gbp } from "@/lib/ui/client";
import { ago } from "@/lib/ui/when";
import { cn } from "@/lib/utils";

/** Every product the app has screened: find one and open its page. */
export default function ProductsPage() {
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

  const columns: DataColumn<ProductListItem>[] = [
    {
      id: "product", header: "Product", mobile: "title", className: "max-w-md min-w-[16rem]", sortValue: (p) => p.title ?? p.asin,
      cell: (p) => (
        <div className="flex gap-2.5">
          <ProductThumb url={p.image_url} asin={p.asin} title={p.title ?? p.asin} brand={p.brand} size={36} />
          <div className="min-w-0">
            <Link className="line-clamp-2 text-sm font-medium hover:text-primary hover:underline" href={`/products/${p.asin}`}>{p.title ?? p.asin}</Link>
            <p className="flex flex-wrap items-center gap-1.5 text-xs font-normal text-muted-foreground"><span className="num">{p.asin}{p.brand ? ` · ${p.brand}` : ""}</span>{p.bought && <StatusChip tone="info" icon={false} className="h-5 px-2">Bought</StatusChip>}</p>
          </div>
        </div>
      ),
    },
    { id: "verdict", header: "Verdict", mobile: 1, sortValue: (p) => (p.verdict ? { pass: 1, warn: 2, fail: 3 }[p.verdict] ?? 4 : null), cell: (p) => <ProductDecision verdict={p.verdict} /> },
    { id: "sell", header: "Sells at", numeric: true, mobile: 2, sortValue: (p) => p.sell_price, cell: (p) => gbp(p.sell_price) },
    { id: "maxLanded", header: "Max landed", numeric: true, mobile: 3, sortValue: (p) => p.max_landed, cell: (p) => gbp(p.max_landed) },
    { id: "sellers", header: "FBA sellers", numeric: true, sortValue: (p) => p.fba_sellers, cell: (p) => p.fba_sellers ?? "—" },
    { id: "share", header: "Your share / mo", numeric: true, sortValue: (p) => p.share_month, cell: (p) => p.share_month ?? "—" },
    { id: "screened", header: "Screened", sortValue: (p) => p.screened_at, cell: (p) => <span className="text-meta whitespace-nowrap text-muted-foreground">{p.screened_at ? ago(p.screened_at) : "—"}</span> },
  ];

  if (error) return <ErrorState title="Couldn't load products" message={error} />;
  return (
    <div className="space-y-5">
      <PageHeader
        title="Products"
        crumbs={[{ label: "Wholesale", href: "/runs" }, { label: "Products" }]}
        subtitle="Every product the app has screened, newest first, with its latest verdict on your default profile."
        info={<p>Open one for its page: the decision, history, suppliers and your purchases. The list comes 50 a page, newest screening first; a column sort orders the page shown.</p>}
        actions={<RecordPurchaseDialog />}
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-80 max-w-full">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Name, brand, ASIN or EAN" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search products" />
        </div>
        <ToggleGroup type="single" variant="outline" size="sm" value={verdict} onValueChange={(v) => { if (v) { setVerdict(v); setPage(0); } }} aria-label="Verdict">
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          <ToggleGroupItem value="pass">Buy</ToggleGroupItem>
          <ToggleGroupItem value="warn">Check</ToggleGroupItem>
          <ToggleGroupItem value="fail">Skip</ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup type="single" variant="outline" size="sm" value={bought ? "bought" : ""} onValueChange={(v) => { setBought(v === "bought"); setPage(0); }}>
          <ToggleGroupItem value="bought">Bought</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {!data ? <Skeleton className="h-96 rounded-xl" /> : (
        <div className="space-y-0">
          {/* The server pages the list (50 a page): the table shows the whole page and sorts it, with no
              pager of its own; the server pager sits below. */}
          <DataTable
            rows={data.items}
            columns={columns}
            getRowId={(p) => p.asin}
            pageSize={200}
            caption="Products"
            rowAttrs={(p) => ({ "data-verdict": p.verdict ?? "empty" })}
            paged={false} className={cn((page > 0 || data.more) && "rounded-b-none")}
            empty={{
              icon: <SearchIcon />, title: "No products match",
              description: "Try fewer words, or the ASIN. A product the app hasn't seen can be checked on Check ASINs.",
              action: <Button variant="secondary" asChild><Link href="/new-run?tab=check">Check ASINs</Link></Button>,
            }}
          />
          {(page > 0 || data.more) && (
            <div className="flex items-center justify-end gap-2 rounded-b-xl border border-t-0 border-border bg-card px-3 py-2 text-meta text-muted-foreground">
              <Button variant="ghost" size="icon-sm" aria-label="Previous page" disabled={page === 0} onClick={() => setPage((n) => n - 1)}><ChevronLeftIcon /></Button>
              <span className="num">Page {page + 1}</span>
              <Button variant="ghost" size="icon-sm" aria-label="Next page" disabled={!data.more} onClick={() => setPage((n) => n + 1)}><ChevronRightIcon /></Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
