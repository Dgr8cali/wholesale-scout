"use client";

import { useState } from "react";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

const KEY = "ads.product";

/**
 * The product the Ads pages show ("" = all), remembered in this browser across pages and visits.
 * A remembered product that's no longer in the list falls back to all.
 */
export function useAdsProduct(asins: string[]): [string, (asin: string) => void] {
  const [saved, setSaved] = useState(() => {
    try { return typeof window === "undefined" ? "" : localStorage.getItem(KEY) ?? ""; } catch { return ""; }
  });
  const pick = saved && asins.includes(saved) ? saved : "";
  const set = (asin: string) => {
    setSaved(asin);
    try { if (asin) localStorage.setItem(KEY, asin); else localStorage.removeItem(KEY); } catch { /* not remembered */ }
  };
  return [pick, set];
}

export function ProductPicker({ products, value, onChange, all = true }: { products: { asin: string; title?: string | null }[]; value: string; onChange: (asin: string) => void; all?: boolean }) {
  return (
    <label className="space-y-1"><span className="field-label">Product</span>
      <NativeSelect value={value} onChange={(e) => onChange(e.target.value)} className="max-w-sm">
        {all && <NativeSelectOption value="">All products ({products.length})</NativeSelectOption>}
        {products.map((p) => <NativeSelectOption key={p.asin} value={p.asin}>{p.title ? `${p.title.slice(0, 50)} · ${p.asin}` : p.asin}</NativeSelectOption>)}
      </NativeSelect>
    </label>
  );
}
