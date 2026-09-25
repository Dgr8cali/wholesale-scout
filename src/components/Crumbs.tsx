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

/** Show these breadcrumbs in the top bar while the calling page is mounted. */
export function usePageCrumbs(crumbs: Crumb[]) {
  const { setCrumbs } = useContext(Ctx);
  const key = JSON.stringify(crumbs);
  useEffect(() => {
    setCrumbs(JSON.parse(key));
    return () => setCrumbs([]);
  }, [key, setCrumbs]);
}
