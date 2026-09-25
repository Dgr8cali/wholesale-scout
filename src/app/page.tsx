"use client";

import { AlertTriangleIcon, ArrowRightIcon, BuildingIcon, CoinsIcon, RefreshCwIcon, StarIcon, UploadIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { VerdictBar } from "@/components/VerdictBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { STATUS_LABELS, type BrandRow } from "@/lib/brands";
import { etaLabel } from "@/lib/eta";
import type { Dashboard } from "@/lib/server/dashboard";
import { api, when } from "@/lib/ui/client";

interface FavItem {
  favourite: { id: string; ean: string; asin: string | null };
  latest: { updated_at: string; product: { title: string | null; brand: string | null } | null; run?: { id: string; name: string | null; source: string } | null } | null;
  outdated: boolean;
}
interface KeepaBalance { available: boolean; tokens: { tokensLeft: number; refillRate: number } | null }

/** Loaded data, or the error that stopped it. */
type Load<T> = { data: T } | { error: string } | null;
function useLoad<T>(url: string, pollMs?: (d: T) => number | null): Load<T> {
  const [state, setState] = useState<Load<T>>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let live = true;
    const load = () => api<T>(url).then(
      (data) => {
        if (!live) return;
        setState({ data });
        const next = pollMs?.(data);
        if (next) timer = setTimeout(load, next);
      },
      (e) => live && setState({ error: (e as Error).message }),
    );
    load();
    return () => { live = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- poll interval is fixed per call site
  }, [url]);
  return state;
}

function Section<T>({ load, skeleton, children }: { load: Load<T>; skeleton: ReactNode; children: (d: T) => ReactNode }) {
  if (!load) return <>{skeleton}</>;
  if ("error" in load) return <p role="alert" className="flex items-center gap-2 rounded-lg bg-fail-soft px-3 py-2 text-sm text-fail"><AlertTriangleIcon className="size-4 flex-none" /> Couldn&apos;t load: {load.error}</p>;
  return <>{children(load.data)}</>;
}

function Stat({ icon, label, value, hint, href }: { icon: ReactNode; label: string; value: ReactNode; hint?: ReactNode; href?: string }) {
  const body = (
    <Card size="sm" className="h-full transition-colors hover:bg-muted/40">
      <CardContent className="flex items-start gap-3">
        <span className="flex size-8 flex-none items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">{icon}</span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="num text-xl font-semibold tracking-tight">{value}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href} className="block rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">{body}</Link> : body;
}

const StatSkeleton = () => <Skeleton className="h-[88px] rounded-xl" />;
const ListSkeleton = ({ rows = 4 }: { rows?: number }) => (
  <div className="space-y-4">{Array.from({ length: rows }, (_, i) => <div key={i} className="space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-2 w-full" /></div>)}</div>
);
const Empty = ({ children }: { children: ReactNode }) => <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;

const AWAITING = new Set(["not_applied", "applied"]);

export default function HomePage() {
  const dash = useLoad<Dashboard>("/api/dashboard", (d) => (d.runs.some((r) => r.counts.pending > 0) ? 15_000 : null));
  const keepa = useLoad<KeepaBalance>("/api/keepa", () => 60_000);
  const favs = useLoad<{ items: FavItem[]; unavailable?: string }>("/api/favourites");
  const brands = useLoad<{ brands: BrandRow[] }>("/api/brands");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Home</h1>
          <p className="text-sm text-muted-foreground">Recent runs, what needs attention, and today&apos;s Keepa spend.</p>
        </div>
        <Button asChild size="lg"><Link href="/upload"><UploadIcon /> Upload price list</Link></Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Section load={keepa} skeleton={<StatSkeleton />}>
          {(k) => (
            <Stat icon={<CoinsIcon />} label="Keepa tokens available"
              value={!k.available ? "—" : k.tokens ? k.tokens.tokensLeft.toLocaleString("en-GB") : "—"}
              hint={!k.available ? "Keepa not configured" : k.tokens ? `refills ${k.tokens.refillRate}/min` : "Keepa didn't answer"} />
          )}
        </Section>
        <Section load={dash} skeleton={<StatSkeleton />}>
          {(d) => <Stat icon={<CoinsIcon />} label="Keepa tokens spent today" value={d.keepa.spentToday.toLocaleString("en-GB")} hint={`≈ ${Math.round(d.keepa.spentToday / 3).toLocaleString("en-GB")} products`} />}
        </Section>
        <Section load={favs} skeleton={<StatSkeleton />}>
          {(f) => <Stat icon={<StarIcon />} label="Favourites needing refresh" href="/favourites"
            value={f.items.filter((x) => x.outdated).length} hint={`of ${f.items.length} favourites`} />}
        </Section>
        <Section load={brands} skeleton={<StatSkeleton />}>
          {(b) => {
            const awaiting = b.brands.filter((x) => AWAITING.has(x.approval?.status ?? "not_applied"));
            return <Stat icon={<BuildingIcon />} label="Brands awaiting approval" href="/brands" value={awaiting.length}
              hint={`${awaiting.reduce((s, x) => s + x.products.length, 0).toLocaleString("en-GB")} products held back`} />;
          }}
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Recent runs</CardTitle>
            <CardDescription>Pass, warn and fail across each run&apos;s rows.</CardDescription>
            <CardAction><Button variant="ghost" size="sm" asChild><Link href="/runs">All runs <ArrowRightIcon /></Link></Button></CardAction>
          </CardHeader>
          <CardContent>
            <Section load={dash} skeleton={<ListSkeleton rows={5} />}>
              {(d) => !d.runs.length ? <Empty>No runs yet. Upload a price list to screen it against Amazon UK.</Empty> : (
                <ul className="divide-y">
                  {d.runs.map((r) => (
                    <li key={r.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <Link href={`/runs/${r.id}`} className="min-w-0 truncate text-sm font-medium hover:underline" title={r.name || r.source}>{r.name || r.source}</Link>
                        <span className="flex-none text-xs text-muted-foreground">{when(r.started_at)}</span>
                      </div>
                      <VerdictBar counts={r.counts} />
                      {r.counts.pending > 0 && r.eta && (
                        <p className="flex items-center gap-1.5 text-xs text-brand">
                          <RefreshCwIcon className="size-3 animate-spin [animation-duration:3s]" />
                          Screening · {etaLabel(r.eta)}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Favourites needing refresh</CardTitle>
              <CardDescription>Last screened over a week ago.</CardDescription>
              <CardAction><Button variant="ghost" size="sm" asChild><Link href="/favourites">Favourites <ArrowRightIcon /></Link></Button></CardAction>
            </CardHeader>
            <CardContent>
              <Section load={favs} skeleton={<ListSkeleton rows={3} />}>
                {(f) => {
                  if (f.unavailable) return <Empty>{f.unavailable}</Empty>;
                  const old = f.items.filter((x) => x.outdated);
                  if (!old.length) return <Empty>{f.items.length ? "All favourites are up to date." : "No favourites yet. Star a result to keep an eye on it."}</Empty>;
                  return (
                    <ul className="space-y-2">
                      {old.slice(0, 5).map((x) => (
                        <li key={x.favourite.id} className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="min-w-0 truncate">{x.latest?.product?.title ?? x.favourite.asin ?? x.favourite.ean}</span>
                          <span className="flex-none text-xs text-muted-foreground">{x.latest ? when(x.latest.updated_at) : "never screened"}</span>
                        </li>
                      ))}
                      {old.length > 5 && <li className="text-xs text-muted-foreground">and {old.length - 5} more</li>}
                    </ul>
                  );
                }}
              </Section>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Brands awaiting approval</CardTitle>
              <CardDescription>Products that need a brand approval, by brand.</CardDescription>
              <CardAction><Button variant="ghost" size="sm" asChild><Link href="/brands">Brands <ArrowRightIcon /></Link></Button></CardAction>
            </CardHeader>
            <CardContent>
              <Section load={brands} skeleton={<ListSkeleton rows={3} />}>
                {(b) => {
                  const awaiting = b.brands.filter((x) => AWAITING.has(x.approval?.status ?? "not_applied"))
                    .sort((x, y) => y.passFees - x.passFees || y.products.length - x.products.length);
                  if (!awaiting.length) return <Empty>No brands waiting on an approval.</Empty>;
                  return (
                    <ul className="space-y-3">
                      {awaiting.slice(0, 6).map((x) => (
                        <li key={x.key} className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium" title={x.brand}>{x.brand}</p>
                            <p className="text-xs text-muted-foreground">
                              <span className="num">{x.products.length}</span> product{x.products.length === 1 ? "" : "s"}
                              {x.passFees > 0 && <> · <span className="num text-pass">{x.passFees}</span> pass fees</>}
                            </p>
                          </div>
                          <Badge variant={x.approval?.status === "applied" ? "brand" : "muted"} className="flex-none">{STATUS_LABELS[x.approval?.status ?? "not_applied"]}</Badge>
                        </li>
                      ))}
                      {awaiting.length > 6 && <li className="text-xs text-muted-foreground">and {awaiting.length - 6} more</li>}
                    </ul>
                  );
                }}
              </Section>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
