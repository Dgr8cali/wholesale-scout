"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/** One breadcrumb; the last one is the current page and has no link. */
export interface Crumb { label: string; href?: string }

const Ctx = createContext<{ crumbs: Crumb[]; setCrumbs: (c: Crumb[]) => void }>({ crumbs: [], setCrumbs: () => {} });

export function CrumbsProvider({ children }: { children: ReactNode }) {
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  return <Ctx.Provider value={{ crumbs, setCrumbs }}>{children}</Ctx.Provider>;
}

export const useCrumbs = () => useContext(Ctx).crumbs;

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
