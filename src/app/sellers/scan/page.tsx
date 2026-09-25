"use client";

import { ExternalLinkIcon, SearchIcon, StoreIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { usePageCrumbs } from "@/components/Crumbs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { SCAN_CAP, sellerIdFrom, storefrontUrl } from "@/lib/check/seller";
import type { ScanPreview } from "@/lib/server/sellerScan";
import { api, when } from "@/lib/ui/client";

interface Profile { id: string; name: string; is_default?: boolean }

const n = (x: number) => x.toLocaleString("en-GB");

function ScanSeller() {
  usePageCrumbs([{ label: "Sellers", href: "/sellers" }, { label: "Scan a seller" }]);
  const router = useRouter();
  const params = useSearchParams();
  const [input, setInput] = useState(params.get("seller") ?? "");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfileId] = useState("");
  const [preview, setPreview] = useState<ScanPreview | null>(null);
  // Looked for a cached storefront and there wasn't one: a lookup (10 tokens) is needed.
  const [needsLookup, setNeedsLookup] = useState(false);
  const [busy, setBusy] = useState<"lookup" | "start" | null>(null);
  const sellerId = sellerIdFrom(input);

  useEffect(() => {
    api<{ profiles: Profile[] }>("/api/profiles").then((r) => {
      setProfiles(r.profiles);
      setProfileId(r.profiles.find((p) => p.is_default)?.id ?? r.profiles[0]?.id ?? "");
    }).catch(() => {});
  }, []);

  const lookUp = useCallback(async () => {
    if (!sellerId) return;
    setBusy("lookup");
    try {
      const r = await api<{ preview: ScanPreview | null }>(`/api/sellers/scan?seller=${sellerId}&lookup=1${profileId ? `&profileId=${profileId}` : ""}`);
      setPreview(r.preview);
      setNeedsLookup(!r.preview);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, [sellerId, profileId]);

  // A cached storefront shows at once, for free; anything else waits for the Look up click.
  useEffect(() => {
    if (!sellerId) return;
    let stale = false;
    api<{ preview: ScanPreview | null }>(`/api/sellers/scan?seller=${sellerId}${profileId ? `&profileId=${profileId}` : ""}`)
      .then((r) => { if (!stale) { setPreview(r.preview); setNeedsLookup(!r.preview); } })
      .catch((e) => toast.error((e as Error).message));
    return () => { stale = true; };
  }, [sellerId, profileId]);

  async function start() {
    if (!sellerId) return;
    setBusy("start");
    try {
      const r = await api<{ runId: string }>("/api/sellers/scan", { method: "POST", json: { seller: sellerId, profileId: profileId || null } });
      router.push(`/runs/${r.runId}`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(null);
    }
  }

  const p = preview;
  const t = p?.tokens;
  const total = t ? t.storefront + t.history : 0;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="page-title">Scan a seller</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Screen a seller&apos;s storefront: its ASINs (up to {n(SCAN_CAP)}) become a run like Check ASINs with no cost, so you see the Buy Box,
          sales, sellers, Amazon, gating and the most each can cost landed, and whether this seller holds the Buy Box.
        </p>
      </div>

      <form className="panel grid gap-4 p-4 sm:grid-cols-[1fr_auto_auto]" onSubmit={(e) => { e.preventDefault(); if (needsLookup) void lookUp(); }}>
        <div className="space-y-1.5">
          <Label htmlFor="seller">Seller ID or storefront link</Label>
          <Input id="seller" placeholder="A30PLPOC3L6XYK or https://www.amazon.co.uk/s?me=…" value={input} onChange={(e) => { setInput(e.target.value); setPreview(null); setNeedsLookup(false); }} />
          {input && !sellerId && <p className="text-xs text-warn">That isn&apos;t a seller ID (A…) or a link with one (?seller=, ?me=).</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="scan-profile">Profile</Label>
          <NativeSelect id="scan-profile" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
            {profiles.map((x) => <NativeSelectOption key={x.id} value={x.id}>{x.name}{x.is_default ? " (default)" : ""}</NativeSelectOption>)}
          </NativeSelect>
        </div>
        <div className="flex items-end">
          <Button type="submit" variant="outline" disabled={!sellerId || !needsLookup || busy != null}
            title="Keepa charges 10 tokens for a storefront; a list looked up in the last 7 days is reused for free">
            <SearchIcon /> {busy === "lookup" ? "Looking up…" : "Look up · 10 tokens"}
          </Button>
        </div>
        {needsLookup && sellerId && (
          <p className="text-xs text-muted-foreground sm:col-span-3">
            No storefront for {sellerId} in the last 7 days. Looking it up costs 10 Keepa tokens; nothing is screened until you start the scan.
          </p>
        )}
      </form>

      {p && t && (
        <section className="panel space-y-4 p-4" aria-label="Seller">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <StoreIcon className="size-4 text-muted-foreground" />
                {p.seller.name ?? p.seller.sellerId}
                <a className="text-brand" href={storefrontUrl(p.seller.sellerId)} target="_blank" rel="noreferrer" aria-label="Storefront on Amazon"><ExternalLinkIcon className="size-3.5" /></a>
              </h2>
              <p className="text-xs text-muted-foreground">
                {p.seller.businessName && p.seller.businessName !== p.seller.name ? `${p.seller.businessName} · ` : ""}
                {p.seller.ratingPct != null ? `${p.seller.ratingPct}% positive of ${n(p.seller.ratingCount ?? 0)} ratings` : "No rating"}
                {p.seller.buyBoxOwnershipPct != null ? ` · holds the Buy Box on ${p.seller.buyBoxOwnershipPct}% of its listings` : ""}
                {p.seller.lastScan && <> · <Link className="text-brand hover:underline" href={`/runs/${p.seller.lastScan.runId}`}>last scanned {when(p.seller.lastScan.at)}</Link></>}
              </p>
            </div>
            <Badge variant="muted" title={p.seller.fetchedAt ? `Storefront list from Keepa, ${when(p.seller.fetchedAt)}` : undefined}>
              {t.storefront > 0 ? `looked up · ${t.storefront} tokens` : "cached list · free"}
            </Badge>
          </div>

          {p.seller.brands.length > 0 && (
            <div className="flex flex-wrap gap-1.5" aria-label="Brand mix">
              {p.seller.brands.slice(0, 8).map((b) => <Badge key={b.brand} variant="outline" className="font-normal">{b.brand} <span className="num text-muted-foreground">{n(b.count)}</span></Badge>)}
            </div>
          )}

          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">ASINs</p>
              <p><span className="num font-semibold">{n(p.asins.scanned)}</span> to screen
                {p.asins.more > 0 && <span className="text-warn"> · {n(p.asins.more)} more on the storefront, over the {n(SCAN_CAP)} cap, not scanned</span>}
              </p>
              <p className="text-xs text-muted-foreground">Storefront size per Keepa: {p.seller.storefrontSize != null ? n(p.seller.storefrontSize) : "—"}</p>
            </div>
            <div>
              <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Keepa tokens</p>
              <p><span className="num font-semibold">{n(total)}</span> to start
                {p.tokensLeft != null && <span className={total > p.tokensLeft ? "text-warn" : "text-muted-foreground"}> · {n(p.tokensLeft)} left now</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                {t.storefront > 0 ? `${n(t.storefront)} for the storefront lookup + ` : ""}
                {n(t.history)} for history ({n(t.fresh)} already have fresh history, free), then up to {t.buyBoxEach} more for each row that passes every other gate.
                {total > (p.tokensLeft ?? Infinity) ? " More than you have now: the scan waits for refills." : ""}
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={start} disabled={busy != null || !p.asins.scanned}>
              {busy === "start" ? "Starting…" : `Start scan of ${n(p.asins.scanned)} ASINs`}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

export default function ScanSellerPage() {
  return <Suspense><ScanSeller /></Suspense>;
}
