"use client";

import { SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { asinFromUrl } from "@/lib/check/parse";
import { api } from "@/lib/ui/client";

type Hit = { asin: string; ean: string; title: string | null; brand: string | null };

/**
 * The top bar's product search: an ASIN (or Amazon link) opens its page; an EAN or words of a
 * title list the matches. Phones: an icon that opens the box.
 */
export function ProductSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [open, setOpen] = useState(false);
  const [wide, setWide] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const s = q.trim();
    if (s.length < 3) return;
    const t = setTimeout(() => {
      api<{ products: Hit[] }>(`/api/products/find?q=${encodeURIComponent(s)}`).then((r) => { setHits(r.products); setOpen(true); }).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const go = (asin: string) => { setOpen(false); setQ(""); setHits(null); setWide(false); router.push(`/products/${asin}`); };
  function submit() {
    const s = q.trim();
    const asin = /^https?:\/\//i.test(s) ? asinFromUrl(s) : /^[A-Z0-9]{10}$/i.test(s) && /[A-Z]/i.test(s) ? s.toUpperCase() : null;
    if (asin) return go(asin);
    if (hits?.length === 1) return go(hits[0].asin);
  }

  return (
    <Popover open={open && !!hits} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="flex items-center">
          <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Find a product" onClick={() => { setWide((w) => !w); setTimeout(() => input.current?.focus(), 0); }}>
            <SearchIcon />
          </Button>
          <div className={wide ? "absolute inset-x-2 top-2 z-40 md:static" : "hidden md:block"}>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input ref={input} value={q} onChange={(e) => { setQ(e.target.value); if (e.target.value.trim().length < 3) setHits(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") { setOpen(false); setWide(false); } }}
                onBlur={() => setTimeout(() => setWide(false), 150)}
                placeholder="ASIN, EAN or product" aria-label="Find a product by ASIN, EAN or name" className="h-8 w-full pl-8 text-sm md:w-56" />
            </div>
          </div>
        </div>
      </PopoverAnchor>
      <PopoverContent align="start" className="w-80 p-1" onOpenAutoFocus={(e) => e.preventDefault()}>
        {hits && hits.length ? (
          <ul>
            {hits.map((h) => (
              <li key={h.asin}>
                <button type="button" className="w-full rounded-md px-2 py-1.5 text-left hover:bg-muted" onClick={() => go(h.asin)}>
                  <span className="line-clamp-1 text-sm">{h.title ?? h.asin}</span>
                  <span className="num text-2xs text-muted-foreground">{h.asin}{h.ean !== h.asin ? ` · ${h.ean}` : ""}{h.brand ? ` · ${h.brand}` : ""}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="px-2 py-1.5 text-sm text-muted-foreground">No product matches. A new ASIN can be checked on Check ASINs.</p>}
      </PopoverContent>
    </Popover>
  );
}
