"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

const KEY = "ads.product";

const remember = (asin: string) => {
  try { if (asin) localStorage.setItem(KEY, asin); else localStorage.removeItem(KEY); } catch { /* not remembered */ }
};

/** The product an `?asin=` value names: upper case, or "" when it isn't an ASIN. */
export const asinOf = (v: string | null | undefined) => {
  const a = (v ?? "").trim().toUpperCase();
  return /^[A-Z0-9]{10}$/.test(a) ? a : "";
};

/**
 * The product the Ads pages show ("" = all). The URL's `?asin=` is the source of truth: the picker,
 * the data and the address always agree, and picking a product rewrites `?asin=`. With no `?asin=`,
 * the product picked last in this browser (if it's still listed), else all (or the first, when
 * `all` is false), written into the URL once the list is known.
 * Pages using it render inside a <Suspense> (useSearchParams).
 */
export function useAdsProduct(asins: string[], { all = true, ready = true }: { all?: boolean; ready?: boolean } = {}): [string, (asin: string) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const inUrl = asinOf(params.get("asin"));
  const [saved, setSaved] = useState(() => {
    try { return typeof window === "undefined" ? "" : localStorage.getItem(KEY) ?? ""; } catch { return ""; }
  });
  const fallback = saved && asins.includes(saved) ? saved : all ? "" : asins[0] ?? "";
  const write = useCallback((asin: string) => {
    const q = new URLSearchParams(params.toString());
    if (asin) q.set("asin", asin); else q.delete("asin");
    const s = q.toString();
    router.replace(s ? `${path}?${s}` : path, { scroll: false });
  }, [params, path, router]);
  const set = (asin: string) => { remember(asin); setSaved(asin); write(asin); };
  // A product picked from memory goes into the address too, so a copied link shows the same.
  useEffect(() => {
    if (ready && !inUrl && fallback) write(fallback);
  }, [ready, inUrl, fallback, write]);
  useEffect(() => { if (inUrl) remember(inUrl); }, [inUrl]);
  return [inUrl || fallback, set];
}

/**
 * The Ads product dropdown. A `value` that isn't one of `products` (an `?asin=` with no ads data
 * yet) is still listed, so the dropdown never shows a different product from the data under it.
 */
export function ProductPicker({ products, value, onChange, all = true }: { products: { asin: string; title?: string | null }[]; value: string; onChange: (asin: string) => void; all?: boolean }) {
  const unlisted = !!value && !products.some((p) => p.asin === value);
  return (
    <label className="space-y-1"><span className="field-label">Product</span>
      <NativeSelect value={value} onChange={(e) => onChange(e.target.value)} className="max-w-sm" aria-label="Product">
        {all && <NativeSelectOption value="">All products ({products.length})</NativeSelectOption>}
        {unlisted && <NativeSelectOption value={value}>{value} · no ads data yet</NativeSelectOption>}
        {products.map((p) => <NativeSelectOption key={p.asin} value={p.asin}>{p.title ? `${p.title.slice(0, 50)} · ${p.asin}` : p.asin}</NativeSelectOption>)}
      </NativeSelect>
    </label>
  );
}
