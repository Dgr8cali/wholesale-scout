"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

/** One breadcrumb; the last one is the current page and has no link. */
export interface Crumb { label: string; href?: string }

const Ctx = createContext<{ crumbs: Crumb[]; setCrumbs: (c: Crumb[]) => void; headers: number; addHeader: (d: 1 | -1) => void }>({ crumbs: [], setCrumbs: () => {}, headers: 0, addHeader: () => {} });

export function CrumbsProvider({ children }: { children: ReactNode }) {
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [headers, setHeaders] = useState(0);
  const addHeader = useCallback((d: 1 | -1) => setHeaders((n) => n + d), []);
  return <Ctx.Provider value={{ crumbs, setCrumbs, headers, addHeader }}>{children}</Ctx.Provider>;
}

export const useCrumbs = () => useContext(Ctx).crumbs;

/** True while the page shows its own PageHeader (the top bar then leaves the title out). */
export const useHasPageHeader = () => useContext(Ctx).headers > 0;

/** Called by PageHeader: the page has its title, so the top bar doesn't repeat it. */
export function usePageHeaderMounted() {
  const { addHeader } = useContext(Ctx);
  useEffect(() => { addHeader(1); return () => addHeader(-1); }, [addHeader]);
}

/** Show these breadcrumbs above the page while the calling page is mounted (null: leave them alone). */
export function usePageCrumbs(crumbs: Crumb[] | null) {
  const { setCrumbs } = useContext(Ctx);
  const key = crumbs ? JSON.stringify(crumbs) : null;
  useEffect(() => {
    if (key === null) return;
    setCrumbs(JSON.parse(key));
    return () => setCrumbs([]);
  }, [key, setCrumbs]);
}
