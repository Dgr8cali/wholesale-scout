"use client";

import { AlertTriangleIcon, ArrowRightIcon, BellIcon, BookOpenIcon, BoxesIcon, BuildingIcon, CoinsIcon, MegaphoneIcon, PackageXIcon, ShoppingCartIcon, RefreshCwIcon, SparklesIcon, StarIcon, TagIcon, TelescopeIcon, UploadIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { VerdictBar } from "@/components/VerdictBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { GATING_LABELS, GATING_VARIANT, type BrandSummary } from "@/lib/brandMap";
import { etaLabel } from "@/lib/eta";
import type { Dashboard } from "@/lib/server/dashboard";
import { sharedGet, when } from "@/lib/ui/client";
import { cn } from "@/lib/utils";

interface FavItem {
  favourite: { id: string; ean: string; asin: string | null };
  latest: { updated_at: string; product: { title: string | null; brand: string | null } | null; run?: { id: string; name: string | null; source: string } | null } | null;
  outdated: boolean;
}
interface KeepaBalance { available: boolean; tokens: { tokensLeft: number; refillRate: number } | null }
interface AdsDash {
  campaigns: { totals: { cost: number; sales: number } | null }[];
  terms: { status: string }[];
}
interface StockSummary { items: number; value: number; units: { home: number; fba: number; tiktok_fbt: number }; low: number; reorderDue: number }
interface PlDash {
  candidates: number; verdicts: Record<"pass" | "warn" | "fail" | "empty", number>;
  lastHunt: { id: string; name: string; status: string; created_at: string; token_cost: number } | null;
  tokensThisMonth: number; month: string;
  niches?: { total: number; shortlisted: number; checked: number };
  suppliers?: { captured: number; toContact: number; contacted: number; quoted: number } | null;
}

/** A workspace's heading on Home. */
const RowTitle = ({ children, href }: { children: ReactNode; href: string }) => (
  <h2 className="section-label flex items-center gap-2"><Link href={href} className="hover:underline">{children}</Link></h2>
);

/** Loaded data, or the error that stopped it. */
type Load<T> = { data: T } | { error: string } | null;
function useLoad<T>(url: string, pollMs?: (d: T) => number | null): Load<T> {
  const [state, setState] = useState<Load<T>>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let live = true;
    // Shared with the top bar (the Keepa balance) and anything else asking at the same moment.
    const load = () => sharedGet<T>(url, 2_000).then(
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
          <p className="stat-value">{value}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href} className="block rounded-lg focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">{body}</Link> : body;
}

const StatSkeleton = () => <Skeleton className="h-[88px] rounded-lg" />;
const ListSkeleton = ({ rows = 4 }: { rows?: number }) => (
  <div className="space-y-4">{Array.from({ length: rows }, (_, i) => <div key={i} className="space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-2 w-full" /></div>)}</div>
);
const Empty = ({ children }: { children: ReactNode }) => <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;


export default function HomePage() {
  const dash = useLoad<Dashboard>("/api/dashboard", (d) => (d.runs.some((r) => r.counts.pending > 0) ? 15_000 : null));
  const keepa = useLoad<KeepaBalance>("/api/keepa", () => 60_000);
  const favs = useLoad<{ items: FavItem[]; unavailable?: string }>("/api/favourites");
  const alerts = useLoad<{ count: number }>("/api/watchlist/alerts", () => 300_000);
  const brands = useLoad<{ brands: BrandSummary[]; updating: boolean; awaiting: { brands: number; passing: number } }>("/api/brands?chase=5");
  const pl = useLoad<PlDash>("/api/pl/dashboard");
  const ads = useLoad<AdsDash>("/api/ads/dashboard");
  const stock = useLoad<StockSummary>("/api/stock/summary");
  const aiReview = useLoad<{ spend: { last30Gbp: number; last30Calls: number }; lastMonth: string; review: { result: { recommendations: { title: string }[] }; costGbp: number; at: string } | null }>("/api/ads/ai/spend");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Home</h1>
          <p className="text-sm text-muted-foreground">Each workspace at a glance: Wholesale, Private label, Ads and Stock.</p>
        </div>
        <Button asChild size="lg"><Link href="/upload"><UploadIcon /> Upload price list</Link></Button>
      </div>

      <RowTitle href="/runs">Wholesale</RowTitle>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Section load={keepa} skeleton={<StatSkeleton />}>
          {(k) => (
            <Stat icon={<CoinsIcon />} label="Keepa tokens available"
              value={!k.available ? "—" : k.tokens ? k.tokens.tokensLeft.toLocaleString("en-GB") : "—"}
              hint={!k.available ? "Keepa not configured" : k.tokens ? `refills ${k.tokens.refillRate}/min` : "Keepa didn't answer"} />
          )}
        </Section>
        <Section load={dash} skeleton={<StatSkeleton />}>
          {(d) => (
            <Stat icon={<CoinsIcon />} label="Keepa tokens spent today" value={d.keepa.spentToday.toLocaleString("en-GB")}
              hint={<>
                ≈ {Math.round(d.keepa.spentToday / 3).toLocaleString("en-GB")} products at 3 tokens each
                <SpendBars days={d.keepa.last7} />
              </>} />
          )}
        </Section>
        <Section load={alerts} skeleton={<StatSkeleton />}>
          {(a) => <Stat icon={<BellIcon />} label="Watchlist: now passes" href="/watchlist" value={a.count}
            hint={a.count ? "passed, met a condition or found a supplier" : "nothing new in the last 14 days"} />}
        </Section>
        <Section load={favs} skeleton={<StatSkeleton />}>
          {(f) => <Stat icon={<StarIcon />} label="Favourites needing refresh" href="/favourites"
            value={f.items.filter((x) => x.outdated).length} hint={`of ${f.items.length} favourites`} />}
        </Section>
        <Section load={brands} skeleton={<StatSkeleton />}>
          {(b) => <Stat icon={<BuildingIcon />} label="Brands awaiting approval" href="/brands" value={b.awaiting.brands}
            hint={`${b.awaiting.passing.toLocaleString("en-GB")} passing products held back`} />}
        </Section>
      </div>

      <RowTitle href="/pl/candidates">Private label</RowTitle>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Section load={pl} skeleton={<StatSkeleton />}>
          {(p) => (
            <Stat icon={<TagIcon />} label="Candidates by verdict" href="/pl/candidates" value={p.candidates}
              hint={p.candidates ? (
                <span className="flex flex-wrap gap-x-2">
                  <span className="text-pass">{p.verdicts.pass} order samples</span>
                  <span className="text-warn">{p.verdicts.warn} check</span>
                  <span className="text-fail">{p.verdicts.fail} drop</span>
                  <span>{p.verdicts.empty} not scored yet</span>
                </span>
              ) : "none yet: hunt a niche or add one"} />
          )}
        </Section>
        <Section load={pl} skeleton={<StatSkeleton />}>
          {(p) => (
            <Stat icon={<TelescopeIcon />} label="Last Niche Hunt" href="/pl/niche-hunt"
              value={p.lastHunt ? when(p.lastHunt.created_at) : "—"}
              hint={p.lastHunt ? `${p.lastHunt.status === "done" ? "done" : p.lastHunt.status} · ${p.lastHunt.token_cost.toLocaleString("en-GB")} tokens` : "no hunt yet"} />
          )}
        </Section>
        <Section load={pl} skeleton={<StatSkeleton />}>
          {(p) => (
            <Stat icon={<TelescopeIcon />} label="Niches" href="/pl/niches" value={`${(p.niches?.shortlisted ?? 0).toLocaleString("en-GB")} shortlisted`}
              hint={p.niches?.total ? `of ${p.niches.total.toLocaleString("en-GB")} imported from Opportunity Explorer · ${p.niches.checked} incumbent-checked` : "import an Opportunity Explorer category download"} />
          )}
        </Section>
        <Section load={pl} skeleton={<StatSkeleton />}>
          {(p) => (
            <Stat icon={<TagIcon />} label="Suppliers" href="/pl/suppliers" value={`${(p.suppliers?.toContact ?? 0).toLocaleString("en-GB")} to contact`}
              hint={p.suppliers?.captured ? `scoring 60+ and not messaged yet, of ${p.suppliers.captured.toLocaleString("en-GB")} Alibaba listings · ${p.suppliers.contacted} contacted · ${p.suppliers.quoted} quoted` : "send Alibaba search results with the extension"} />
          )}
        </Section>
        <Section load={pl} skeleton={<StatSkeleton />}>
          {(p) => (
            <Stat icon={<CoinsIcon />} label="Private label Keepa tokens this month" value={p.tokensThisMonth.toLocaleString("en-GB")}
              hint={`candidates' refreshes, Niche Hunts and niche incumbent checks, ${new Date(`${p.month}-01`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}`} />
          )}
        </Section>
      </div>

      <RowTitle href="/ads/dashboard">Ads</RowTitle>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Section load={ads} skeleton={<StatSkeleton />}>
          {(a) => {
            const t = a.campaigns.reduce((s, c) => ({ cost: s.cost + (c.totals?.cost ?? 0), sales: s.sales + (c.totals?.sales ?? 0) }), { cost: 0, sales: 0 });
            if (!a.campaigns.length) return <Stat icon={<MegaphoneIcon />} label="Sponsored Products" href="/ads/imports" value="—" hint="No ad data yet — import a report" />;
            const waste = a.terms.filter((x) => x.status === "waste").length;
            return <Stat icon={<MegaphoneIcon />} label="Sponsored Products spend" href="/ads/dashboard" value={`£${t.cost.toFixed(2)}`}
              hint={`ACoS ${t.sales ? Math.round((t.cost / t.sales) * 100) : "—"}% on £${t.sales.toFixed(2)} sales · ${waste} search term${waste === 1 ? "" : "s"} wasting spend`} />;
          }}
        </Section>
        <Stat icon={<BookOpenIcon />} label="Ads: the playbook" href="/help/ads-playbook" value="Start to finish" hint="Set a product up, launch, the weekly loop, the 60-day arc, and what to do when something looks wrong" />
        <Section load={aiReview} skeleton={<StatSkeleton />}>
          {(r) => {
            const month = new Date(`${r.lastMonth}-01`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
            const ai = `AI: £${r.spend.last30Gbp.toFixed(2)} over ${r.spend.last30Calls} call${r.spend.last30Calls === 1 ? "" : "s"} in 30 days`;
            return r.review
              ? <Stat icon={<SparklesIcon />} label={`Review of ${month}`} href={`/ads/review?month=${r.lastMonth}`} value={r.review.result.recommendations[0]?.title ?? "Done"} hint={`Top recommendation · this review cost £${r.review.costGbp.toFixed(2)} · ${ai}`} />
              : <Stat icon={<SparklesIcon />} label={`Review of ${month}`} href={`/ads/review?month=${r.lastMonth}`} value="Not run" hint={`Run it on Ads → Review · ${ai}`} />;
          }}
        </Section>
      </div>

      <RowTitle href="/stock/levels">Stock</RowTitle>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Section load={stock} skeleton={<StatSkeleton />}>
          {(s) => !s.items
            ? <Stat icon={<BoxesIcon />} label="Stock" href="/stock/import" value="—" hint="No stock items yet — import from StockPilot or a CSV" />
            : <Stat icon={<BoxesIcon />} label="Stock value at cost" href="/stock/levels" value={`£${s.value.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} hint={`${s.items} item${s.items === 1 ? "" : "s"}`} />}
        </Section>
        <Section load={stock} skeleton={<StatSkeleton />}>
          {(s) => <Stat icon={<BoxesIcon />} label="Units by bucket" href="/stock/levels" value={(s.units.home + s.units.fba + s.units.tiktok_fbt).toLocaleString("en-GB")}
            hint={`Self-ship ${s.units.home} · FBA ${s.units.fba} · TikTok ${s.units.tiktok_fbt}`} />}
        </Section>
        <Section load={stock} skeleton={<StatSkeleton />}>
          {(s) => <Stat icon={<PackageXIcon />} label="Low or out of stock" href="/stock/levels" value={s.low} hint={s.low ? "at or under the low-stock level" : "every item above its low-stock level"} />}
        </Section>
        <Section load={stock} skeleton={<StatSkeleton />}>
          {(s) => <Stat icon={<ShoppingCartIcon />} label="Reorders due or soon" href="/stock/reorder" value={s.reorderDue} hint={s.reorderDue ? "at the reorder point, or within a week of it" : "nothing to reorder yet"} />}
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
          <Section load={dash} skeleton={null}>
            {(d) => d.qogita.length ? (
              <Card>
                <CardHeader>
                  <CardTitle>Qogita overnight</CardTitle>
                  <CardDescription>Saved pulls re-pulled last night; only new or re-priced products were screened.</CardDescription>
                  <CardAction><Button variant="ghost" size="sm" asChild><Link href="/qogita">Pulls <ArrowRightIcon /></Link></Button></CardAction>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {d.qogita.map((q) => (
                      <li key={q.preset} className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{q.preset}</p>
                          <p className="text-xs text-muted-foreground">
                            {q.error ? <span className="text-fail">{q.error}</span>
                              : q.screened ? `${q.new} new, ${q.moved} re-priced, ${q.unchanged.toLocaleString("en-GB")} unchanged`
                              : `Nothing new or re-priced (${q.unchanged.toLocaleString("en-GB")} unchanged)`}
                            {q.stillScreening && " · screening"}
                          </p>
                        </div>
                        {q.runId && (
                          <Link href={`/runs/${q.runId}`} className="flex-none">
                            <Badge variant={q.passes ? "pass" : "muted"}><span className="num">{q.passes}</span> new pass{q.passes === 1 ? "" : "es"}</Badge>
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ) : null}
          </Section>
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
              <CardTitle>Brands to chase</CardTitle>
              <CardDescription>Most wholesale-friendly brands you&apos;re not approved for yet, with products that pass.</CardDescription>
              <CardAction><Button variant="ghost" size="sm" asChild><Link href="/brands">Brands <ArrowRightIcon /></Link></Button></CardAction>
            </CardHeader>
            <CardContent>
              <Section load={brands} skeleton={<ListSkeleton rows={5} />}>
                {(b) => !b.brands.length ? (
                  <Empty>{b.updating ? "Building the brand map…" : "No brand has a product that passes on your default profile yet."}</Empty>
                ) : (
                  <ul className="space-y-3">
                    {b.brands.map((x) => (
                      <li key={x.key} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <Link href={`/brands/${encodeURIComponent(x.key)}`} className="block truncate text-sm font-medium hover:underline" title={x.brand}>{x.brand}</Link>
                          <p className="text-xs text-muted-foreground">
                            <span className="num text-pass">{x.pass}</span> pass · <span className="num text-warn">{x.warn}</span> warn of {x.asins}
                            {x.avgSellers != null && <> · {x.avgSellers} sellers</>}
                            {x.amazonSharePct != null && <> · Amazon {x.amazonSharePct}%</>}
                          </p>
                        </div>
                        <div className="flex flex-none items-center gap-1.5">
                          <Badge variant={GATING_VARIANT[x.gating]}>{GATING_LABELS[x.gating]}</Badge>
                          <span className="num w-7 text-right text-sm font-semibold" title="Wholesale-friendly score">{x.score}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** The last 7 days' Keepa spend as small bars, today last and highlighted. */
function SpendBars({ days }: { days: { day: string; tokens: number }[] }) {
  const max = Math.max(1, ...days.map((d) => d.tokens));
  const label = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  return (
    <span className="mt-2 flex h-8 items-end gap-1" role="img" aria-label={`Keepa spend, last 7 days: ${days.map((d) => `${label(d.day)} ${d.tokens.toLocaleString("en-GB")}`).join(", ")}`}>
      {days.map((d, i) => (
        <span key={d.day} title={`${label(d.day)}: ${d.tokens.toLocaleString("en-GB")} tokens`}
          className={cn("w-3 rounded-sm", i === days.length - 1 ? "bg-brand" : "bg-muted-foreground/30")}
          style={{ height: `${Math.max(d.tokens ? 8 : 3, (d.tokens / max) * 100)}%` }} />
      ))}
    </span>
  );
}
