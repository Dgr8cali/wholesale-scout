"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { filtersFromQuery, filtersToQuery, type FilterSet } from "@/lib/filters";

/**
 * The results filters, read from and written to the address (`?verdict=buy&profit=5…`), so a
 * filtered view can be bookmarked or linked to. Other parameters (tab) are kept; `page` is dropped
 * when the filters change.
 */
export function useUrlFilters(): [FilterSet, (f: FilterSet) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const key = params.toString();
  const filters = useMemo(() => filtersFromQuery(new URLSearchParams(key)), [key]);
  const set = useCallback((f: FilterSet) => {
    const q = filtersToQuery(f, new URLSearchParams(window.location.search));
    q.delete("page");
    const s = q.toString();
    router.replace(s ? `${path}?${s}` : path, { scroll: false });
  }, [router, path]);
  return [filters, set];
}
