"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/**
 * A page's tab from ?tab= (an unknown or missing one is the first), and a setter that rewrites
 * it, so every tab is a link. Switching drops the other tab's own query (e.g. ?asins=) unless
 * `keep` names it (e.g. ?asin=, shared by every tab). Needs a <Suspense> (useSearchParams).
 */
export function useTab<T extends string>(tabs: readonly T[], keep: string[] = []): [T, (t: T) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const asked = params.get("tab") as T | null;
  const tab = asked && tabs.includes(asked) ? asked : tabs[0];
  const set = useCallback((t: T) => {
    const q = new URLSearchParams();
    if (t !== tabs[0]) q.set("tab", t);
    for (const k of keep) { const v = params.get(k); if (v) q.set(k, v); }
    const s = q.toString();
    router.replace(s ? `${path}?${s}` : path, { scroll: false });
  }, [tabs, keep, params, path, router]);
  return [tab, set];
}
