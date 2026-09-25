"use client";

import { ArrowLeftIcon, ExternalLinkIcon, LoaderIcon } from "lucide-react";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { api } from "@/lib/ui/client";

interface Loaded { slug: string; title: string; summary: string; section: string; html: string }

/** Open an article in the side panel ("gates/priceBand", optionally at a heading). */
// Outside the app shell (tests) there's no panel to open.
const Ctx = createContext<{ open: (slug: string, hash?: string) => void }>({ open: () => {} });
export const useHelp = () => useContext(Ctx);

/** Clicks on /help links inside an article: open them here instead of leaving the page. */
export function helpLinkTarget(e: MouseEvent): { slug: string; hash?: string } | null {
  const a = (e.target as HTMLElement).closest("a");
  const href = a?.getAttribute("href");
  if (!href || e.metaKey || e.ctrlKey || e.shiftKey || a?.target === "_blank") return null;
  const m = href.match(/^\/help\/([^#?]+)(?:#(.+))?$/);
  return m ? { slug: m[1], hash: m[2] } : null;
}

export function HelpProvider({ children }: { children: ReactNode }) {
  // A stack, so links followed inside the panel can be gone back from.
  const [stack, setStack] = useState<{ slug: string; hash?: string }[]>([]);
  const [data, setData] = useState<Loaded | null>(null);
  // The failure is for one article: opening another clears it.
  const [failed, setFailed] = useState<{ slug: string; message: string } | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const top = stack[stack.length - 1] ?? null;

  const open = useCallback((slug: string, hash?: string) => setStack([{ slug, hash }]), []);
  useEffect(() => {
    if (!top) return;
    let live = true;
    api<Loaded>(`/api/help/${top.slug}`)
      .then((d) => { if (live) setData(d); })
      .catch((e: Error) => { if (live) setFailed({ slug: top.slug, message: e.message }); });
    return () => { live = false; };
  }, [top]);
  // After the article renders: its heading if one was asked for, else the top.
  useEffect(() => {
    if (!data || !body.current) return;
    const el = top?.hash ? body.current.querySelector(`#${CSS.escape(top.hash)}`) : null;
    if (el) el.scrollIntoView({ block: "start" });
    else body.current.scrollTop = 0;
  }, [data, top]);

  const error = top && failed?.slug === top.slug ? failed.message : null;
  const loading = !!top && data?.slug !== top.slug && !error;
  return (
    <Ctx.Provider value={{ open }}>
      {children}
      <Sheet open={!!top} onOpenChange={(o) => { if (!o) { setStack([]); setData(null); } }}>
        <SheetContent side="right" className="w-full gap-0 data-[side=right]:sm:max-w-xl">
          <SheetHeader className="border-b pr-12">
            <div className="flex items-center gap-2">
              {stack.length > 1 && (
                <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Back" onClick={() => setStack((s) => s.slice(0, -1))}>
                  <ArrowLeftIcon className="size-4" />
                </button>
              )}
              <p className="eyebrow">{data?.section ?? "Help"}</p>
            </div>
            <SheetTitle>{loading ? "Loading…" : data?.title ?? "Help"}</SheetTitle>
            <SheetDescription className={data?.summary ? undefined : "sr-only"}>{data?.summary || "Help article"}</SheetDescription>
            {top && (
              <Link href={`/help/${top.slug}${top.hash ? `#${top.hash}` : ""}`} className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline" onClick={() => setStack([])}>
                Open as a page <ExternalLinkIcon className="size-3" />
              </Link>
            )}
          </SheetHeader>
          <div ref={body} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {error ? <p className="text-sm text-fail">{error}</p>
              : loading || !data ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderIcon className="size-4 animate-spin" /> Loading…</p>
              : (
                <div
                  className="help-prose"
                  onClick={(e) => {
                    const t = helpLinkTarget(e);
                    if (!t) return;
                    e.preventDefault();
                    if (t.slug === top?.slug && t.hash) body.current?.querySelector(`#${CSS.escape(t.hash)}`)?.scrollIntoView({ block: "start" });
                    else setStack((s) => [...s, t]);
                  }}
                  dangerouslySetInnerHTML={{ __html: data.html }}
                />
              )}
          </div>
        </SheetContent>
      </Sheet>
    </Ctx.Provider>
  );
}
