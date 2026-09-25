"use client";

import { BuildingIcon, CircleHelpIcon, CrosshairIcon, DownloadCloudIcon, HomeIcon, ListChecksIcon, ScanSearchIcon, SettingsIcon, StarIcon, StoreIcon, UploadIcon, EyeIcon, TruckIcon, ClipboardListIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { CrumbsProvider, useCrumbs } from "@/components/Crumbs";
import { QogitaCartButton, QogitaCartProvider } from "@/components/QogitaCart";
import { ThemeToggle } from "@/components/ThemeToggle";
import { HelpButton } from "@/components/help/HelpButton";
import { HelpProvider } from "@/components/help/HelpPanel";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarInset,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api, sharedGet } from "@/lib/ui/client";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/runs", label: "Runs", icon: ListChecksIcon },
  { href: "/upload", label: "Upload", icon: UploadIcon },
  { href: "/check", label: "Check ASINs", icon: ScanSearchIcon },
  { href: "/hunt", label: "Hunt", icon: CrosshairIcon },
  { href: "/sellers", label: "Sellers", icon: StoreIcon },
  { href: "/suppliers", label: "Suppliers", icon: TruckIcon },
  { href: "/qogita", label: "Qogita", icon: DownloadCloudIcon },
  { href: "/favourites", label: "Favourites", icon: StarIcon },
  { href: "/watchlist", label: "Watchlist", icon: EyeIcon },
  { href: "/plan", label: "Plan", icon: ClipboardListIcon },
  { href: "/brands", label: "Brands", icon: BuildingIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
  { href: "/help", label: "Help", icon: CircleHelpIcon },
];

const isActive = (href: string, path: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

function AppSidebar() {
  const path = usePathname();
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
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((n) => (
                <SidebarMenuItem key={n.href}>
                  <SidebarMenuButton asChild isActive={isActive(n.href, path)} tooltip={n.label}>
                    <Link href={n.href}><n.icon /><span>{n.label}</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
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
export function AppShell({ defaultOpen, qogita, children }: { defaultOpen: boolean; qogita: boolean; children: ReactNode }) {
  return (
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
  );
}
