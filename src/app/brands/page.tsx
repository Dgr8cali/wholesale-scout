"use client";

import { ArrowDownIcon, ArrowUpIcon, BuildingIcon, ExternalLinkIcon, LoaderIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePageCrumbs } from "@/components/Crumbs";
import { EmptyState, ErrorState } from "@/components/States";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { GATING_LABELS, GATING_VARIANT, type BrandSummary } from "@/lib/brandMap";
import { api, gbp } from "@/lib/ui/client";
import { cn } from "@/lib/utils";

type SortKey = "score" | "brand" | "asins" | "passing" | "sellers" | "amazon" | "buyBox" | "maxLanded" | "ipRisk";
const IP_VARIANT = { high: "fail", medium: "warn", low: "muted" } as const;
const IP_RANK = { high: 3, medium: 2, low: 1 } as const;
const VALUE: Record<SortKey, (b: BrandSummary) => number | string | null> = {
  score: (b) => b.score,
  brand: (b) => b.brand.toLowerCase(),
  asins: (b) => b.asins,
  passing: (b) => b.pass * 1000 + b.warn,
  sellers: (b) => b.avgSellers,
  amazon: (b) => b.amazonSharePct,
  buyBox: (b) => b.avgBuyBox,
  maxLanded: (b) => b.medianMaxLanded,
  ipRisk: (b) => (b.ipRisk ? IP_RANK[b.ipRisk.level] : null),
};
const PAGE = 200;

/** The brand-level map: every brand seen in any run, on your default profile. */
export default function BrandsPage() {
  usePageCrumbs([{ label: "Brands" }]);
  const [data, setData] = useState<{ brands: BrandSummary[]; updating: boolean; profile: { name: string } } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [gating, setGating] = useState<"all" | "listable" | "approval" | "approved" | "blocked">("all");
  const [passingOnly, setPassingOnly] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "score", dir: -1 });
  const [limit, setLimit] = useState(PAGE);

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

  const shown = useMemo(() => {
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
    const v = VALUE[sort.key];
    return [...list].sort((a, b) => {
      const x = v(a), y = v(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir || b.score - a.score;
    });
  }, [data, q, gating, passingOnly, sort]);

  const th = (key: SortKey, label: string, className?: string, title?: string) => (
    <TableHead className={className} title={title} aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
      <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === "brand" ? 1 : -1 }))}>
        {label}
        {sort.key === key && (sort.dir === 1 ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" />)}
      </button>
    </TableHead>
  );

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="page-title">Brands</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Every brand seen in any run, each product&apos;s latest result re-checked on your default profile{data ? ` (${data.profile.name})` : ""}.
          The score is high where you can list it, Amazon rarely sells it, 2–8 sellers share it and several ASINs pass.
        </p>
      </div>
      {data?.updating && <Badge variant="muted"><LoaderIcon className="animate-spin" /> Updating from the latest results…</Badge>}
    </div>
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
        <div className="relative w-64">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Find a brand or supplier" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} aria-label="Find a brand or supplier" />
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
          <Label htmlFor="passing-only" className="text-sm font-normal">Has passing ASINs</Label>
        </div>
        <span className="text-sm text-muted-foreground"><span className="num font-medium text-foreground">{shown.length.toLocaleString("en-GB")}</span> of {data.brands.length.toLocaleString("en-GB")} brands</span>
      </div>

      <div className="panel overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {th("brand", "Brand", "pl-4")}
              {th("score", "Score", "text-right", "Wholesale-friendly, 0–100")}
              {th("asins", "ASINs", "text-right")}
              {th("passing", "Pass / warn", "text-right", "On your default profile, among priced products")}
              {th("sellers", "Sellers", "text-right", "Average FBA sellers")}
              {th("amazon", "Amazon", "text-right", "Share of its listings Amazon sells or sold")}
              {th("buyBox", "Buy Box", "text-right", "Average Buy Box")}
              {th("maxLanded", "Max landed", "text-right", "Median of the most each product can cost landed and clear the floors")}
              <TableHead>Gating</TableHead>
              {th("ipRisk", "IP risk", undefined, "On your IP-risk list (Settings → IP risk); high halves the score")}
              <TableHead className="pr-4">Carried by</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!shown.length && <TableRow><TableCell colSpan={11} className="py-10 text-center text-muted-foreground">No brands match.</TableCell></TableRow>}
            {shown.slice(0, limit).map((b) => (
              <TableRow key={b.key}>
                <TableCell className="max-w-56 pl-4 whitespace-normal">
                  <Link className="font-medium hover:underline" href={`/brands/${encodeURIComponent(b.key)}`}>{b.brand}</Link>
                </TableCell>
                <TableCell className="text-right">
                  <span className={cn("num inline-block min-w-8 rounded px-1.5 py-0.5 text-center text-xs font-semibold",
                    b.score >= 70 ? "bg-pass-soft text-pass" : b.score >= 50 ? "bg-warn-soft text-warn" : "bg-muted text-muted-foreground")}>{b.score}</span>
                </TableCell>
                <TableCell className="num text-right">{b.asins}</TableCell>
                <TableCell className="num text-right">
                  <span className={b.pass ? "font-semibold text-pass" : "text-muted-foreground"}>{b.pass}</span>
                  <span className="text-muted-foreground"> / </span>
                  <span className={b.warn ? "text-warn" : "text-muted-foreground"}>{b.warn}</span>
                </TableCell>
                <TableCell className="num text-right">{b.avgSellers ?? "—"}</TableCell>
                <TableCell className={cn("num text-right", (b.amazonSharePct ?? 0) >= 50 && "text-fail")}>{b.amazonSharePct == null ? "—" : `${b.amazonSharePct}%`}</TableCell>
                <TableCell className="num text-right">{gbp(b.avgBuyBox)}</TableCell>
                <TableCell className="num text-right">{gbp(b.medianMaxLanded)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Badge variant={GATING_VARIANT[b.gating]}>{GATING_LABELS[b.gating]}</Badge>
                    {b.applyUrl && (
                      <a href={b.applyUrl} target="_blank" rel="noreferrer noopener" title="Request approval in Seller Central" className="text-brand"><ExternalLinkIcon className="size-3.5" /></a>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {b.ipRisk ? (
                    <Badge variant={IP_VARIANT[b.ipRisk.level]} title={[b.ipRisk.note, b.ipRisk.source && `Source: ${b.ipRisk.source}`].filter(Boolean).join(" · ")}>
                      {b.ipRisk.level}{b.ipRisk.source?.includes("unverified") ? " ?" : ""}
                    </Badge>
                  ) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="max-w-64 pr-4 text-xs whitespace-normal text-muted-foreground">
                  {[
                    [...b.suppliers.slice(0, 2).map((s) => s.name), ...(b.suppliers.length > 2 ? [`+${b.suppliers.length - 2}`] : [])].join(", "),
                    b.sellers.length ? `${b.sellers.length} seller${b.sellers.length === 1 ? "" : "s"}` : "",
                  ].filter(Boolean).join(" · ") || "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {shown.length > limit && (
        <div className="flex justify-center"><Button variant="outline" onClick={() => setLimit((l) => l + PAGE)}>Show {Math.min(PAGE, shown.length - limit)} more</Button></div>
      )}
    </div>
  );
}
