"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Sparks } from "@/lib/sparkline";
import { api } from "@/lib/ui/client";

/**
 * Sparklines fetched lazily for the ASINs that scroll into view, batched. `observe` is a
 * ref callback for the element showing an ASIN's sparklines.
 */
export function useSparks() {
  const [sparks, setSparks] = useState<Record<string, Sparks | null>>({});
  const requested = useRef(new Set<string>());
  const queue = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const observer = useRef<IntersectionObserver | null>(null);
  const asinOf = useRef(new WeakMap<Element, string>());

  // Send everything queued, 200 ASINs per request.
  const flush = useCallback(() => {
    timer.current = null;
    while (queue.current.size) {
      const batch = [...queue.current].slice(0, 200);
      for (const a of batch) queue.current.delete(a);
      api<{ sparks: Record<string, Sparks> }>("/api/sparks", { method: "POST", json: { asins: batch } })
        .then((r) => setSparks((s) => {
          const n = { ...s };
          for (const a of batch) n[a] = r.sparks[a] ?? null;
          return n;
        }))
        .catch(() => { for (const a of batch) requested.current.delete(a); });
    }
  }, []);

  const want = useCallback((asin: string) => {
    if (requested.current.has(asin)) return;
    requested.current.add(asin);
    queue.current.add(asin);
    timer.current ??= setTimeout(flush, 120);
  }, [flush]);

  useEffect(() => {
    observer.current = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const a = asinOf.current.get(e.target);
        if (a) want(a);
        observer.current?.unobserve(e.target);
      }
    }, { rootMargin: "400px 0px" });
    return () => observer.current?.disconnect();
  }, [want]);

  const observe = useCallback((asin: string | null | undefined) => (el: Element | null) => {
    if (!el || !asin || requested.current.has(asin)) return;
    asinOf.current.set(el, asin);
    if (observer.current) observer.current.observe(el);
    else want(asin);
  }, [want]);

  return { sparks, observe, want };
}
