"use client";

import { FactoryIcon, FileUpIcon, FlaskConicalIcon, MessageCircleQuestionIcon, PackageIcon, PlusIcon, ScanSearchIcon, SearchIcon, TruckIcon, UploadIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { NAV_ICON } from "@/components/navIcons";
import { useAskScout } from "@/components/today/AskScout";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { asinFromUrl } from "@/lib/check/parse";
import { api } from "@/lib/ui/client";
import { SHARED_NAV, WORKSPACES } from "@/lib/workspaces";

interface Found {
  products: { asin: string; title: string | null; brand: string | null }[];
  candidates: { id: string; name: string; niche_keyword: string | null; status: string }[];
  suppliers: { id: string; name: string; kind: string | null }[];
}

const Ctx = createContext<{ open: () => void }>({ open: () => {} });
export const useCommandPalette = () => useContext(Ctx);

/** Every page, the More ones too: [href, label, where]. */
const PAGES = [
  ...SHARED_NAV.map((n) => ({ ...n, where: "" })),
  ...WORKSPACES.flatMap((w) => w.nav.map((n) => ({ ...n, where: w.label }))),
];

/** Every typed word somewhere in the item's text (cmdk's fuzzy match finds "Products" in "electro"). */
const matchWords = (value: string, search: string, keywords?: string[]) => {
  const hay = `${value} ${(keywords ?? []).join(" ")}`.toLowerCase();
  return search.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w)) ? 1 : 0;
};

/** An ASIN (or an Amazon link to one) in what was typed. */
const asinIn = (q: string) => {
  const s = q.trim();
  if (/^https?:\/\//i.test(s)) return asinFromUrl(s);
  return /^[A-Z0-9]{10}$/i.test(s) && /[A-Z]/i.test(s) ? s.toUpperCase() : null;
};

/**
 * ⌘K / Ctrl+K: search or jump to anything. Every page (More included), quick actions, and
 * products (ASIN, EAN or title), candidates and suppliers from the database (8 of each at most).
 */
export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const askScout = useAskScout();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ q: string; data: Found } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The database search, debounced; an answer for an older query is dropped.
  useEffect(() => {
    const s = q.trim();
    if (!open || s.length < 2) return;
    let live = true;
    const t = setTimeout(() => {
      api<Found>(`/api/search?q=${encodeURIComponent(s)}`).then((data) => { if (live) setFound({ q: s, data }); }).catch(() => {});
    }, 200);
    return () => { live = false; clearTimeout(t); };
  }, [q, open]);

  const go = useCallback((href: string) => {
    setOpen(false);
    setQ("");
    setFound(null);
    router.push(href);
  }, [router]);

  const s = q.trim();
  const asin = asinIn(s);
  const data = found && found.q === s && s.length >= 2 ? found.data : null;
  // Database results carry the query in their value: they already match it, so the filter keeps them.

  return (
    <Ctx.Provider value={{ open: () => setOpen(true) }}>
      {children}
      <CommandDialog filter={matchWords} open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setQ(""); setFound(null); } }} title="Search or jump to…" description="Pages, products, candidates, suppliers and quick actions">
        <CommandInput value={q} onValueChange={setQ} placeholder="Search or jump to… (a page, an ASIN, a candidate, a supplier)" />
        <CommandList>
          <CommandEmpty>{s.length >= 2 && !data ? "Searching…" : "Nothing found."}</CommandEmpty>
          <CommandGroup heading="Quick actions">
            {/* Always listed (its value carries the query): a question typed here is asked straight away. */}
            <CommandItem value={`ask scout ${s}`} keywords={["ask", "scout", "question", "ai"]} onSelect={() => { setOpen(false); setQ(""); setFound(null); askScout.open(s.length > 3 && !asin ? s : undefined); }}>
              <MessageCircleQuestionIcon /> {s.length > 3 && !asin ? <>Ask Scout: <span className="truncate">{s}</span></> : "Ask Scout…"}
            </CommandItem>
            {asin && <CommandItem value={`open product ${asin}`} onSelect={() => go(`/products/${asin}`)}><PackageIcon /> Open product <span className="num">{asin}</span></CommandItem>}
            <CommandItem value={`check an asin ${asin ?? ""}`} keywords={["check", "asin", "screen"]} onSelect={() => go(asin ? `/new-run?tab=check&asins=${asin}` : "/new-run?tab=check")}>
              <ScanSearchIcon /> Check an ASIN{asin && <span className="num text-muted-foreground">{asin}</span>}
            </CommandItem>
            <CommandItem value="import ads bulk file" keywords={["import", "ads", "bulk", "report", "upload"]} onSelect={() => go("/ads/dashboard?import=1")}><FileUpIcon /> Import ads bulk file</CommandItem>
            <CommandItem value="new candidate" keywords={["new", "candidate", "private label", "add"]} onSelect={() => go("/pl/candidates?new=1")}><PlusIcon /> New candidate</CommandItem>
            <CommandItem value="new run" keywords={["new", "run", "upload", "price list", "screen"]} onSelect={() => go("/new-run")}><UploadIcon /> New run</CommandItem>
          </CommandGroup>
          <CommandGroup heading="Pages">
            {PAGES.map((p) => {
              const Icon = NAV_ICON[p.href];
              return (
                <CommandItem key={p.href} value={`${p.where} ${p.label} ${p.href}`} keywords={[p.where, p.label]} onSelect={() => go(p.href)}>
                  {Icon && <Icon />} {p.label}
                  {p.where && <CommandShortcut className="tracking-normal">{p.where}</CommandShortcut>}
                </CommandItem>
              );
            })}
          </CommandGroup>
          {!!data?.products.length && (
            <CommandGroup heading="Products">
              {data.products.map((p) => (
                <CommandItem key={p.asin} value={`product ${p.asin} ${p.title ?? ""} ${s}`} onSelect={() => go(`/products/${p.asin}`)}>
                  <PackageIcon /> <span className="min-w-0 flex-1 truncate">{p.title ?? p.asin}</span>
                  <CommandShortcut className="num tracking-normal">{p.asin}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {!!data?.candidates.length && (
            <CommandGroup heading="Candidates">
              {data.candidates.map((c) => (
                <CommandItem key={c.id} value={`candidate ${c.id} ${c.name} ${s}`} onSelect={() => go(`/pl/candidates/${c.id}`)}>
                  <FlaskConicalIcon /> <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <CommandShortcut className="tracking-normal">{c.niche_keyword ?? c.status}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {!!data?.suppliers.length && (
            <CommandGroup heading="Suppliers">
              {data.suppliers.map((x) => (
                <CommandItem key={x.id} value={`supplier ${x.id} ${x.name} ${s}`} onSelect={() => go(`/suppliers/${x.id}`)}>
                  {x.kind === "manufacturer" ? <FactoryIcon /> : <TruckIcon />} <span className="min-w-0 flex-1 truncate">{x.name}</span>
                  {x.kind && <CommandShortcut className="tracking-normal">{x.kind}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </Ctx.Provider>
  );
}

/** The sidebar's "Search or jump to…" button (⌘K). */
export function CommandPaletteButton() {
  const { open } = useCommandPalette();
  const mac = useSyncExternalStore(() => () => {}, () => /Mac|iPhone|iPad/.test(navigator.platform), () => true);
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton onClick={open} tooltip="Search or jump to… (⌘K)" className="border border-sidebar-border bg-background text-muted-foreground hover:text-foreground">
          <SearchIcon />
          <span>Search or jump to…</span>
          <kbd className="ml-auto rounded border border-border bg-card px-1.5 font-sans text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">{mac ? "⌘K" : "Ctrl K"}</kbd>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
