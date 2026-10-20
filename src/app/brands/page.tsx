"use client";

import { BuildingIcon, ExternalLinkIcon, LoaderIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EmptyState, ErrorState } from "@/components/States";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip, type Tone } from "@/components/ui/status-chip";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { GATING_LABELS, GATING_VARIANT, type BrandSummary } from "@/lib/brandMap";
import { api, gbp } from "@/lib/ui/client";
import { cn } from "@/lib/utils";

const IP_TONE = { high: "bad", medium: "warn", low: "neutral" } as const;
const IP_RANK = { high: 3, medium: 2, low: 1 } as const;
/** The brand map's gating colours (lib/brandMap's badge variants) as chip tones. */
const GATING_TONE: Record<(typeof GATING_VARIANT)[keyof typeof GATING_VARIANT], Tone> = { pass: "good", warn: "warn", fail: "bad", muted: "neutral", brand: "info" };

/** The brand-level map: every brand seen in any run, on your default profile. */
export default function BrandsPage() {
  const [data, setData] = useState<{ brands: BrandSummary[]; updating: boolean; profile: { name: string } } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [gating, setGating] = useState<"all" | "listable" | "approval" | "approved" | "blocked">("all");
  const [passingOnly, setPassingOnly] = useState(false);

  // While the map is being rebuilt in the background, check back every few seconds.
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = () => api<{ brands: BrandSummary[]; updating: boolean; profile: { name: string } }>("/api/brands")
      .then((r) => { if (stop) return; setData(r); setError(null); if (r.updating) timer = setTimeout(load, 5_000); })
      .catch((e) => !stop && setError(e.message));
    load();
    return () => { stop = true; clearTimeout(timer); };
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (data?.brands ?? []).filter((b) => {
      if (needle && !b.brand.toLowerCase().includes(needle) && !b.suppliers.some((s) => s.name.toLowerCase().includes(needle))) return false;
      if (passingOnly && !(b.pass + b.warn)) return false;
      if (gating === "listable") return b.gating === "open" || b.gating === "approved";
      if (gating === "approval") return b.gating === "approval_needed" || b.gating === "applied";
      if (gating === "approved") return b.gating === "approved";
      if (gating === "blocked") return b.gating === "blocked";
      return true;
    });
    // Ties keep the score order.
    return list.sort((a, b) => b.score - a.score);
  }, [data, q, gating, passingOnly]);
  const columns: DataColumn<BrandSummary>[] = [
    { id: "brand", header: "Brand", mobile: "title", className: "max-w-56", sortValue: (b) => b.brand, cell: (b) => <Link className="font-medium hover:underline" href={`/brands/${encodeURIComponent(b.key)}`}>{b.brand}</Link> },
    {
      id: "score", header: <span title="Wholesale-friendly, 0–100">Score</span>, numeric: true, mobile: 1, sortValue: (b) => b.score,
      cell: (b) => <span className={cn("num inline-block min-w-8 rounded-md px-1.5 py-0.5 text-center text-xs font-semibold",
        b.score >= 70 ? "bg-success-soft text-success" : b.score >= 50 ? "bg-warn-soft text-warn-ink" : "bg-subtle text-muted-foreground")}>{b.score}</span>,
    },
    { id: "asins", header: "ASINs", numeric: true, sortValue: (b) => b.asins, cell: (b) => b.asins },
    {
      id: "passing", header: <span title="On your default profile, among priced products">Buy / Check</span>, numeric: true, mobile: 2, sortValue: (b) => b.pass * 1000 + b.warn,
      cell: (b) => <>
        <span className={b.pass ? "font-semibold text-success" : "text-muted-foreground"}>{b.pass}</span>
        <span className="text-muted-foreground"> / </span>
        <span className={b.warn ? "text-warn-ink" : "text-muted-foreground"}>{b.warn}</span>
      </>,
    },
    { id: "sellers", header: <span title="Average FBA sellers">Sellers</span>, numeric: true, sortValue: (b) => b.avgSellers, cell: (b) => b.avgSellers ?? "—" },
    { id: "amazon", header: <span title="Share of its listings Amazon sells or sold">Amazon</span>, numeric: true, sortValue: (b) => b.amazonSharePct, cell: (b) => <span className={cn((b.amazonSharePct ?? 0) >= 50 && "text-danger")}>{b.amazonSharePct == null ? "—" : `${b.amazonSharePct}%`}</span> },
    { id: "buyBox", header: <span title="Average Buy Box">Buy Box</span>, numeric: true, sortValue: (b) => b.avgBuyBox, cell: (b) => gbp(b.avgBuyBox) },
    { id: "maxLanded", header: <span title="Median of the most each product can cost landed and clear the floors">Max landed</span>, numeric: true, sortValue: (b) => b.medianMaxLanded, cell: (b) => gbp(b.medianMaxLanded) },
    {
      id: "gating", header: "Gating", mobile: 3, sortValue: (b) => GATING_LABELS[b.gating],
      cell: (b) => (
        <div className="flex items-center gap-1.5">
          <StatusChip tone={GATING_TONE[GATING_VARIANT[b.gating]]}>{GATING_LABELS[b.gating]}</StatusChip>
          {b.applyUrl && (
            <a href={b.applyUrl} target="_blank" rel="noreferrer noopener" title="Request approval in Seller Central" className="text-primary"><ExternalLinkIcon className="size-3.5" /></a>
          )}
        </div>
      ),
    },
    {
      id: "ipRisk", header: <span title="On your IP-risk list (Settings → IP risk); high halves the score">IP risk</span>, sortValue: (b) => (b.ipRisk ? IP_RANK[b.ipRisk.level] : null),
      cell: (b) => (b.ipRisk ? (
        <StatusChip tone={IP_TONE[b.ipRisk.level]} title={[b.ipRisk.note, b.ipRisk.source && `Source: ${b.ipRisk.source}`].filter(Boolean).join(" · ")}>
          {b.ipRisk.level[0].toUpperCase() + b.ipRisk.level.slice(1)}{b.ipRisk.source?.includes("unverified") ? " ?" : ""}
        </StatusChip>
      ) : <span className="text-muted-foreground">—</span>),
    },
    {
      id: "carried", header: <span title="Sorts by the first supplier">Carried by</span>, className: "max-w-64", sortValue: (b) => b.suppliers[0]?.name ?? null,
      cell: (b) => <span className="text-xs text-muted-foreground">{[
        [...b.suppliers.slice(0, 2).map((s) => s.name), ...(b.suppliers.length > 2 ? [`+${b.suppliers.length - 2}`] : [])].join(", "),
        b.sellers.length ? `${b.sellers.length} seller${b.sellers.length === 1 ? "" : "s"}` : "",
      ].filter(Boolean).join(" · ") || "—"}</span>,
    },
  ];

  const header = (
    <PageHeader
      title="Brands"
      crumbs={[{ label: "Wholesale", href: "/runs" }, { label: "Brands" }]}
      subtitle={`Every brand seen in any run, on your default profile${data ? ` (${data.profile.name})` : ""}.`}
      info={<>
        <p>Each product&apos;s latest result is re-checked on your default profile.</p>
        <p>The score is high where you can list it, Amazon rarely sells it, 2–8 sellers share it and several ASINs are a Buy.</p>
      </>}
      actions={data?.updating ? <StatusChip tone="info" icon={false}><LoaderIcon className="size-3.5 animate-spin" /> Updating from the latest results…</StatusChip> : undefined}
    />
  );
  if (error) return <div className="space-y-5">{header}<ErrorState title="Couldn't load brands" message={error} onRetry={() => window.location.reload()} /></div>;
  if (!data) return <div className="space-y-5">{header}<div className="panel space-y-3 p-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div></div>;
  if (!data.brands.length) {
    return (
      <div className="space-y-5">
        {header}
        <EmptyState icon={<BuildingIcon />} title={data.updating ? "Building the brand map…" : "No brands yet"}>
          {data.updating ? "Every product's latest result is being re-checked on your default profile; this page fills in by itself." : "Brands appear once a run has screened some products."}
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {header}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-64 max-w-full">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Find a brand or supplier" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a brand or supplier" />
        </div>
        <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={gating} onValueChange={(v) => v && setGating(v as typeof gating)} aria-label="Gating">
          <ToggleGroupItem value="all" className="px-3 text-xs">All</ToggleGroupItem>
          <ToggleGroupItem value="listable" className="px-3 text-xs">Can list</ToggleGroupItem>
          <ToggleGroupItem value="approval" className="px-3 text-xs">Approval needed</ToggleGroupItem>
          <ToggleGroupItem value="approved" className="px-3 text-xs">Approved</ToggleGroupItem>
          <ToggleGroupItem value="blocked" className="px-3 text-xs">Blocked</ToggleGroupItem>
        </ToggleGroup>
        <div className="flex items-center gap-2">
          <Switch id="passing-only" checked={passingOnly} onCheckedChange={setPassingOnly} />
          <Label htmlFor="passing-only" className="text-sm font-normal">Has Buy or Check ASINs</Label>
        </div>
        <span className="text-sm text-muted-foreground"><span className="num font-medium text-foreground">{filtered.length.toLocaleString("en-GB")}</span> of {data.brands.length.toLocaleString("en-GB")} brands</span>
      </div>

      <DataTable
        rows={filtered}
        columns={columns}
        getRowId={(b) => b.key}
        storageKey="wholesale.brands"
        caption="Brands"
        initialSort={{ id: "score", desc: true }}
        empty={{ icon: <SearchIcon />, title: "No brands match", description: "Try another name, or clear the filters." }}
      />
    </div>
  );
}
