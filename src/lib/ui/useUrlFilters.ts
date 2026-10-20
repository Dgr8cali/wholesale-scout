"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { filtersFromQuery, filtersToQuery, isEmpty, normalizeFilters, type FilterSet } from "@/lib/filters";

/**
 * The results filters, read from and written to the address (`?verdict=buy&profit=5…`), so a
 * filtered view can be bookmarked or linked to. Other parameters (tab) are kept; `page` is dropped
 * when the filters change. With `remember` (a localStorage key, e.g. per run) the last filters are
 * saved and restored when the page opens with none in the address; filters in the address win.
 */
export function useUrlFilters(opts: { remember?: string } = {}): [FilterSet, (f: FilterSet) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const key = params.toString();
  const filters = useMemo(() => filtersFromQuery(new URLSearchParams(key)), [key]);
  const remember = opts.remember;
  const set = useCallback((f: FilterSet) => {
    const q = filtersToQuery(f, new URLSearchParams(window.location.search));
    q.delete("page");
    const s = q.toString();
    if (remember) {
      try {
        if (isEmpty(f)) window.localStorage.removeItem(remember);
        else window.localStorage.setItem(remember, JSON.stringify(f));
      } catch { /* storage blocked: the address still holds them */ }
    }
    router.replace(s ? `${path}?${s}` : path, { scroll: false });
  }, [router, path, remember]);

  // Once per key: no filters in the address → put back the remembered ones.
  const restored = useRef<string | null>(null);
  useEffect(() => {
    if (!remember || restored.current === remember) return;
    restored.current = remember;
    if (!isEmpty(filtersFromQuery(new URLSearchParams(window.location.search)))) return;
    let saved: FilterSet | null = null;
    try {
      const raw = window.localStorage.getItem(remember);
      saved = raw ? normalizeFilters(JSON.parse(raw) as Partial<FilterSet>) : null;
    } catch { /* unreadable: start clean */ }
    if (saved && !isEmpty(saved)) {
      const q = filtersToQuery(saved, new URLSearchParams(window.location.search));
      router.replace(`${path}?${q.toString()}`, { scroll: false });
    }
  }, [remember, router, path]);
  return [filters, set];
}
