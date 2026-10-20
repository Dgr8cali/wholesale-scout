"use client";

import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, Fragment, useContext, useEffect, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { CommandPaletteButton, CommandPaletteProvider } from "@/components/CommandPalette";
import { Logo } from "@/components/Logo";
import { NAV_ICON } from "@/components/navIcons";
import { SHARED_NAV, WORKSPACES, type NavItem, type Workspace } from "@/lib/workspaces";
import { CrumbsProvider, useCrumbs, useHasPageHeader } from "@/components/Crumbs";
import { QogitaCartButton, QogitaCartProvider } from "@/components/QogitaCart";
import { ThemeToggle } from "@/components/ThemeToggle";
import { HelpButton } from "@/components/help/HelpButton";
import { HelpProvider } from "@/components/help/HelpPanel";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInset,
  SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";
import { StatusChip } from "@/components/ui/status-chip";
import type { ShellCheck, ShellData } from "@/app/api/shell/route";
import { api } from "@/lib/ui/client";
import { cn } from "@/lib/utils";

const isActive = (href: string, path: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

/** The top bar's checks and the sidebar's counts, refreshed every minute and on focus. */
const ShellCtx = createContext<{ data: ShellData | null; down: boolean }>({ data: null, down: false });

function ShellDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<ShellData | null>(null);
  const [down, setDown] = useState(false);
  useEffect(() => {
    const load = () => api<ShellData>("/api/shell").then((d) => { setData(d); setDown(false); }).catch(() => setDown(true));
    load();
    const t = setInterval(load, 60_000);
    window.addEventListener("focus", load);
    return () => { clearInterval(t); window.removeEventListener("focus", load); };
  }, []);
  return <ShellCtx.Provider value={{ data, down }}>{children}</ShellCtx.Provider>;
}

function NavLink({ n, path }: { n: NavItem; path: string }) {
  const Icon = NAV_ICON[n.href];
  const count = useContext(ShellCtx).data?.counts[n.href] ?? 0;
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive(n.href, path)} tooltip={count ? `${n.label} (${count})` : n.label}>
        <Link href={n.href} onClick={() => isMobile && setOpenMobile(false)}>
          {Icon && <Icon />}
          <span>{n.label}</span>
        </Link>
      </SidebarMenuButton>
      {count > 0 && <SidebarMenuBadge className="num rounded-full bg-primary-soft text-primary-ink">{count}</SidebarMenuBadge>}
    </SidebarMenuItem>
  );
}

// Each workspace's "More" is remembered in this browser (closed by default).
const moreKey = (id: string) => `nav.more.${id}`;
const moreListeners = new Set<() => void>();
const readMore = (id: string) => { try { return localStorage.getItem(moreKey(id)) === "1"; } catch { return false; } };
const writeMore = (id: string, open: boolean) => {
  try { localStorage.setItem(moreKey(id), open ? "1" : "0"); } catch { /* not remembered */ }
  moreListeners.forEach((l) => l());
};
const subscribeMore = (l: () => void) => { moreListeners.add(l); return () => { moreListeners.delete(l); }; };

function WorkspaceGroup({ w, path }: { w: Workspace; path: string }) {
  const main = w.nav.filter((n) => !n.more), more = w.nav.filter((n) => n.more);
  const saved = useSyncExternalStore(subscribeMore, () => readMore(w.id), () => false);
  // The page you're on is never hidden: its More opens (without changing what's remembered).
  const here = more.some((n) => isActive(n.href, path));
  const open = saved || here;
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{w.label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {main.map((n) => <NavLink key={n.href} n={n} path={path} />)}
          {more.length > 0 && (
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => writeMore(w.id, !saved)} aria-expanded={open} disabled={here && !saved}
                tooltip={`${open ? "Fewer" : "More"} ${w.label} pages`} className="text-muted-foreground disabled:opacity-100">
                <ChevronRightIcon className={cn("transition-transform", open && "rotate-90")} />
                <span>More</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {open && more.map((n) => <NavLink key={n.href} n={n} path={path} />)}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function AppSidebar() {
  const path = usePathname();
  const today = SHARED_NAV.filter((n) => n.href === "/"), pinned = SHARED_NAV.filter((n) => n.href !== "/");
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip="Wholesale Scout">
              <Link href="/">
                <Logo size={32} />
                <span className="truncate font-semibold tracking-tight">Wholesale Scout</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <CommandPaletteButton />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Home</SidebarGroupLabel>
          <SidebarGroupContent><SidebarMenu>{today.map((n) => <NavLink key={n.href} n={n} path={path} />)}</SidebarMenu></SidebarGroupContent>
        </SidebarGroup>
        {WORKSPACES.map((w) => <WorkspaceGroup key={w.id} w={w} path={path} />)}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>{pinned.map((n) => <NavLink key={n.href} n={n} path={path} />)}</SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

/** One chip for every integration: "All systems OK", or how many need you, with the list in a popover. */
function StatusPopover() {
  const { data, down } = useContext(ShellCtx);
  if (!data && !down) return null;
  const issues = down ? 1 : data!.issues;
  const checks: ShellCheck[] = down ? [{ key: "api", label: "The app's server", ok: false, detail: "Didn't answer: check your connection or the deployment" }] : data!.checks;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="cursor-pointer rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/40" aria-label={issues ? `${issues} issue${issues === 1 ? "" : "s"}: show` : "All systems OK: show"}>
          <StatusChip tone={issues ? "warn" : "good"}>
            {issues ? <>{issues}<span className="hidden sm:inline"> issue{issues === 1 ? "" : "s"}</span></> : <span className="hidden sm:inline">All systems OK</span>}
          </StatusChip>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <p className="border-b border-divider px-4 py-3 text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">Systems</p>
        <ul className="divide-y divide-divider">
          {checks.map((c) => (
            <li key={c.key} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{c.href ? <Link href={c.href} className="hover:underline">{c.label}</Link> : c.label}</p>
                <p className="text-meta text-muted-foreground">{c.detail}</p>
              </div>
              <StatusChip tone={c.ok === null ? "neutral" : c.ok ? "good" : "warn"} className="mt-0.5">{c.ok === null ? "Info" : c.ok ? "OK" : "Check"}</StatusChip>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** The page's name: its last breadcrumb, else its menu label. Left out when the page shows its own PageHeader. */
function TopTitle() {
  const crumbs = useCrumbs();
  const path = usePathname();
  const hasHeader = useHasPageHeader();
  if (hasHeader) return null;
  const nav = [...SHARED_NAV, ...WORKSPACES.flatMap((w) => w.nav)].find((n) => isActive(n.href, path));
  const title = crumbs.length ? crumbs[crumbs.length - 1].label : nav?.label;
  return title ? <p className="min-w-0 truncate text-sm font-medium">{title}</p> : null;
}

/** The breadcrumb, above the page's title. */
function PageCrumbs() {
  const crumbs = useCrumbs();
  if (crumbs.length < 2) return null;
  return (
    <Breadcrumb className="mb-2 min-w-0 overflow-hidden">
      <BreadcrumbList className="flex-nowrap text-meta">
        {crumbs.map((c, i) => (
          <Fragment key={i}>
            {i > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem className={i === crumbs.length - 1 ? "min-w-0" : "flex-none"}>
              {c.href && i < crumbs.length - 1
                ? <BreadcrumbLink asChild><Link href={c.href}>{c.label}</Link></BreadcrumbLink>
                : <BreadcrumbPage className="truncate">{c.label}</BreadcrumbPage>}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

/** Collapsible grouped sidebar (a drawer on phones), the top bar, the breadcrumb and the page. */
export function AppShell({ defaultOpen, qogita, children }: { defaultOpen: boolean; qogita: boolean; children: ReactNode }) {
  return (
    <ShellDataProvider>
    <QogitaCartProvider enabled={qogita}>
    <CrumbsProvider>
    <HelpProvider>
    <CommandPaletteProvider>
      <SidebarProvider defaultOpen={defaultOpen} style={{ "--sidebar-width": "15rem", "--sidebar-width-icon": "4rem" } as CSSProperties}>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <header className="sticky top-0 z-30 flex h-14 flex-none items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:px-6">
            <SidebarTrigger className="-ml-1 size-9" aria-label="Menu" />
            <TopTitle />
            <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
              <StatusPopover />
              <QogitaCartButton />
              <HelpButton />
              <ThemeToggle />
            </div>
          </header>
          <div className="mx-auto w-full max-w-[1400px] min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-8">
            <PageCrumbs />
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </CommandPaletteProvider>
    </HelpProvider>
    </CrumbsProvider>
    </QogitaCartProvider>
    </ShellDataProvider>
  );
}
