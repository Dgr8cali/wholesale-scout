/**
 * How much of a seller's storefront is one brand: the count of that brand's listings over the
 * storefront's size. Keepa's storefront count can be years stale while its brand statistics are
 * current, so the size is never taken as smaller than the brand's own count (no share over 100%).
 * Pure: the screening pipeline and the competition gate's note share it.
 */
import { brandKey } from "../brands";

export interface BrandShare { count: number; size: number; pct: number }

export function brandShare(brands: { brand: string; count: number }[], brand: string | null | undefined, storefrontSize: number | null | undefined): BrandShare | null {
  const key = brandKey(brand);
  // No brand breakdown from Keepa means unknown, not 0%.
  if (!key || !brands.length) return null;
  const count = brands.filter((b) => brandKey(b.brand) === key).reduce((a, b) => a + b.count, 0);
  const size = Math.max(storefrontSize ?? 0, count);
  if (!size) return null;
  return { count, size, pct: Math.round((count / size) * 1000) / 10 };
}

/** The seller fields the note reads (a SellerView). */
export interface DistributorSeller {
  sellerId: string;
  name: string | null;
  sharePct: number;
  storefrontSize: number | null;
  /** Listings of this brand on the storefront; absent on results screened before it was kept. */
  brandCount?: number | null;
  brandSharePct: number | null;
}

const pct = (n: number) => `${Math.round(Math.min(100, n))}%`;

/** "likely brand distributor: X (7 of 9 storefront listings (78%) are Kitsure, 100% of the Buy Box)". */
export function distributorNote(s: DistributorSeller, brand: string | null | undefined): string {
  const who = s.name ?? s.sellerId;
  const what = brand ?? "this brand";
  const listings = s.brandCount != null && s.storefrontSize
    ? `${s.brandCount.toLocaleString("en-GB")} of ${Math.max(s.storefrontSize, s.brandCount).toLocaleString("en-GB")} storefront listings (${pct(s.brandSharePct ?? (s.brandCount / s.storefrontSize) * 100)})`
    // Screened before the count was kept: the size only when the share it gave is possible.
    : s.storefrontSize && (s.brandSharePct ?? 0) <= 100 ? `${pct(s.brandSharePct ?? 0)} of ${s.storefrontSize.toLocaleString("en-GB")} storefront listings`
    : `${pct(s.brandSharePct ?? 0)} of storefront listings`;
  return `likely brand distributor: ${who} (${listings} are ${what}, ${pct(s.sharePct)} of the Buy Box)`;
}
