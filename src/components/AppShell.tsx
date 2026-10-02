"use client";

import {
  BoxesIcon, BuildingIcon, CircleHelpIcon, ClipboardListIcon, CrosshairIcon, DownloadCloudIcon, EyeIcon, FileUpIcon, GaugeIcon, HomeIcon,
  LightbulbIcon, ListChecksIcon, ListFilterIcon, PackageIcon, ReceiptIcon, RocketIcon, ScanSearchIcon, SettingsIcon, StarIcon, StoreIcon,
  TagIcon, TelescopeIcon, TruckIcon, UploadIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, Fragment, useCallback, useContext, useEffect, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { isSwitchShortcut, nextWorkspace, SHARED_NAV, workspace, workspaceCookie, workspaceForPath, type NavItem, type WorkspaceId } from "@/lib/workspaces";
import { CrumbsProvider, useCrumbs } from "@/components/Crumbs";
import { QogitaCartButton, QogitaCartProvider } from "@/components/QogitaCart";
import { ThemeToggle } from "@/components/ThemeToggle";
import { HelpButton } from "@/components/help/HelpButton";
import { ProductSearch } from "@/components/product/ProductSearch";
import { HelpProvider } from "@/components/help/HelpPanel";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInset,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api, sharedGet } from "@/lib/ui/client";
import { cn } from "@/lib/utils";

/** Icons by page. */
const ICON: Record<string, ComponentType> = {
  "/": HomeIcon, "/runs": ListChecksIcon, "/upload": UploadIcon, "/check": ScanSearchIcon, "/qogita": DownloadCloudIcon,
  "/sellers": StoreIcon, "/brands": BuildingIcon, "/suppliers": TruckIcon, "/favourites": StarIcon, "/watchlist": EyeIcon,
  "/plan": ClipboardListIcon, "/hunt": CrosshairIcon, "/products": BoxesIcon, "/tracker": PackageIcon,
  "/pl/candidates": TagIcon, "/pl/niche-hunt": TelescopeIcon, "/pl/quotes": ReceiptIcon, "/pl/launch": RocketIcon,
  "/ads/dashboard": GaugeIcon, "/ads/imports": FileUpIcon, "/ads/rules": ListFilterIcon, "/ads/proposals": LightbulbIcon,
  "/settings": SettingsIcon, "/help": CircleHelpIcon,
};

const isActive = (href: string, path: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

/** The workspace in use: from the cookie at first, then whichever workspace the page belongs to. */
const WorkspaceCtx = createContext<{ ws: WorkspaceId; switchTo: (id: WorkspaceId) => void }>({ ws: "wholesale", switchTo: () => {} });

function WorkspaceProvider({ initial, children }: { initial: WorkspaceId; children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const pageWs = workspaceForPath(path);
  // The workspace chosen last: the cookie's at first, then the switcher's, then whichever workspace
  // a page opened belongs to (a link or a bookmark into another workspace switches to it).
  const [chosen, setChosen] = useState<WorkspaceId>(pageWs ?? initial);
  const [seenPageWs, setSeenPageWs] = useState(pageWs);
  if (pageWs !== seenPageWs) {
    setSeenPageWs(pageWs);
    if (pageWs) setChosen(pageWs);
  }
  const ws = pageWs ?? chosen;
  // Remembered for the next visit (the layout reads it, so the first paint is right).
  useEffect(() => {
    document.cookie = workspaceCookie(ws);
  }, [ws]);
  const switchTo = useCallback((id: WorkspaceId) => {
    setChosen(id);
    // On a shared page (Home, Settings, Help) it stays put; on another workspace's page it goes to the new one's first page.
    if (pageWs !== null && pageWs !== id) router.push(workspace(id).landing);
  }, [pageWs, router]);
  // Alt+Shift+W (Option+Shift+W on a Mac) cycles Wholesale → Private label → Ads.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isSwitchShortcut(e)) return;
      e.preventDefault();
      switchTo(nextWorkspace(ws));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ws, switchTo]);
  return <WorkspaceCtx.Provider value={{ ws, switchTo }}>{children}</WorkspaceCtx.Provider>;
}

function NavList({ items, path }: { items: NavItem[]; path: string }) {
  return (
    <SidebarMenu>
      {items.map((n) => {
        const Icon = ICON[n.href] ?? CircleHelpIcon;
        return (
          <SidebarMenuItem key={n.href}>
            <SidebarMenuButton asChild isActive={isActive(n.href, path)} tooltip={n.soon ? `${n.label} (coming soon)` : n.label}>
              <Link href={n.href}>
                <Icon />
                <span>{n.label}</span>
                {n.soon && <span className="ml-auto rounded bg-empty-soft px-1 text-[10px] font-medium text-empty">soon</span>}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

function AppSidebar() {
  const path = usePathname();
  const { ws, switchTo } = useContext(WorkspaceCtx);
  const home = SHARED_NAV.filter((n) => n.href === "/"), rest = SHARED_NAV.filter((n) => n.href !== "/");
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip="Wholesale Scout">
              <Link href="/">
                <span className="flex size-8 flex-none items-center justify-center rounded-lg bg-brand text-sm font-bold text-brand-foreground">WS</span>
                <span className="truncate font-semibold tracking-tight">Wholesale Scout</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <WorkspaceSwitcher value={ws} onChange={switchTo} />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent><NavList items={home} path={path} /></SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>{workspace(ws).label}</SidebarGroupLabel>
          <SidebarGroupContent><NavList items={workspace(ws).nav} path={path} /></SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent><NavList items={rest} path={path} /></SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <p className="px-2 text-2xs text-muted-foreground group-data-[collapsible=icon]:hidden">Amazon UK · FBA</p>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

interface Status { supabase: boolean; spapi: boolean; spapiSellerId: boolean; keepa: boolean }
interface KeepaBalance { available: boolean; tokens: { tokensLeft: number; refillRate: number; refillInMs: number } | null }

function StatusDot({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground" tabIndex={0}>
          <span className={cn("size-2 rounded-full", ok ? "bg-pass" : "bg-warn")} aria-hidden="true" />
          {label}
          <span className="sr-only">{ok ? "connected" : "not configured"}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{ok ? `${label}: connected` : hint}</TooltipContent>
    </Tooltip>
  );
}

/** The four integration dots and the live Keepa balance, refreshed every minute and on focus. */
function StatusBar() {
  const [status, setStatus] = useState<Status | null>(null);
  const [down, setDown] = useState(false);
  const [keepa, setKeepa] = useState<KeepaBalance | null>(null);
  useEffect(() => {
    api<Status>("/api/status").then(setStatus).catch(() => setDown(true));
    const load = () => sharedGet<KeepaBalance>("/api/keepa").then(setKeepa).catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    window.addEventListener("focus", load);
    return () => { clearInterval(t); window.removeEventListener("focus", load); };
  }, []);
  if (down) return <StatusDot ok={false} label="Can't reach the server" hint="The app's API didn't answer; check your connection or the deployment" />;
  if (!status) return null;
  const t = keepa?.tokens;
  return (
    <div className="flex items-center gap-4">
      <div className="hidden items-center gap-3 lg:flex">
        <StatusDot ok={status.supabase} label="Supabase" hint="Set SUPABASE_URL and SUPABASE_SERVICE_KEY" />
        <StatusDot ok={status.spapi} label="SP-API" hint="Set SPAPI_CLIENT_ID, SPAPI_CLIENT_SECRET, SPAPI_REFRESH_TOKEN" />
        <StatusDot ok={status.spapiSellerId} label="Gating" hint="Set SPAPI_SELLER_ID (your merchant token) for gating checks" />
        <StatusDot ok={status.keepa} label="Keepa" hint="Stub until KEEPA_API_KEY is a real key: history gates are skipped" />
      </div>
      {status.keepa && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs whitespace-nowrap" tabIndex={0}>
              <span className="text-muted-foreground">Keepa</span>
              <span className="num font-medium">{t ? t.tokensLeft.toLocaleString("en-GB") : "—"}</span>
              {/* Phones: just "Keepa 1,260", so the breadcrumbs keep their room. */}
              <span className="hidden text-muted-foreground sm:inline">tokens</span>
            </span>
          </TooltipTrigger>
          <TooltipContent>{t ? `Refills ${t.refillRate}/min; a product costs 1 token for its history, 3 more for Buy Box data if it gets that far` : "Keepa didn't report a balance"}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

function Crumbs() {
  const crumbs = useCrumbs();
  // Browser tab titles come from each route's layout metadata (pageTitle), Next's own mechanism.
  if (!crumbs.length) return null;
  return (
    <>
    <Separator orientation="vertical" className="mx-1 data-vertical:h-4 data-vertical:self-center" />
    <Breadcrumb className="min-w-0 overflow-hidden">
      <BreadcrumbList className="flex-nowrap">
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
    </>
  );
}

/** Collapsible left sidebar, top bar with status and breadcrumbs, and the page. */
export function AppShell({ defaultOpen, qogita, workspace: initialWorkspace, children }: { defaultOpen: boolean; qogita: boolean; workspace: WorkspaceId; children: ReactNode }) {
  return (
    <WorkspaceProvider initial={initialWorkspace}>
    <QogitaCartProvider enabled={qogita}>
    <CrumbsProvider>
    <HelpProvider>
      <SidebarProvider defaultOpen={defaultOpen} style={{ "--sidebar-width": "13rem" } as CSSProperties}>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <header className="sticky top-0 z-30 flex h-12 flex-none items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <SidebarTrigger className="-ml-1" />
            <Crumbs />
            <div className="ml-auto flex items-center gap-3">
              <ProductSearch />
              <StatusBar />
              <QogitaCartButton />
              <HelpButton />
              <ThemeToggle />
            </div>
          </header>
          <div className="mx-auto w-full max-w-[1400px] min-w-0 flex-1 px-4 py-6 lg:px-6">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </HelpProvider>
    </CrumbsProvider>
    </QogitaCartProvider>
    </WorkspaceProvider>
  );
}
