/**
 * The app's three workspaces: Wholesale (resell existing listings), Private label (launch your own
 * product) and Ads (run and tune Sponsored Products). Each has its own sidebar; Home, Settings and
 * Help belong to all three. Pure: the shell, the layout and the tests share it.
 */

export type WorkspaceId = "wholesale" | "pl" | "ads";

export interface NavItem { href: string; label: string; soon?: boolean }

export interface Workspace {
  id: WorkspaceId;
  label: string;
  /** What it's for, under the switcher. */
  tagline: string;
  /** Where switching to it goes. */
  landing: string;
  nav: NavItem[];
}

export const WORKSPACES: Workspace[] = [
  {
    id: "wholesale", label: "Wholesale", tagline: "Resell existing listings", landing: "/runs",
    nav: [
      { href: "/runs", label: "Runs" },
      { href: "/upload", label: "Upload" },
      { href: "/check", label: "Check ASINs" },
      { href: "/qogita", label: "Qogita" },
      { href: "/sellers", label: "Sellers" },
      { href: "/brands", label: "Brands" },
      { href: "/suppliers", label: "Suppliers" },
      { href: "/favourites", label: "Favourites" },
      { href: "/watchlist", label: "Watchlist" },
      { href: "/plan", label: "Plan" },
      { href: "/hunt", label: "Hunt" },
      // Not in the brief's list, but wholesale pages that would otherwise have no way in.
      { href: "/products", label: "Products" },
      { href: "/tracker", label: "Tracker" },
    ],
  },
  {
    id: "pl", label: "Private label", tagline: "Launch your own product", landing: "/pl/candidates",
    nav: [
      { href: "/pl/candidates", label: "Candidates" },
      { href: "/pl/niche-hunt", label: "Niche Hunt" },
      { href: "/pl/quotes", label: "Quotes" },
      { href: "/pl/launch", label: "Launch" },
    ],
  },
  {
    id: "ads", label: "Ads", tagline: "Run and tune Sponsored Products", landing: "/ads/dashboard",
    nav: [
      { href: "/ads/dashboard", label: "Dashboard" },
      { href: "/ads/imports", label: "Imports" },
      { href: "/ads/rules", label: "Rules" },
      { href: "/ads/proposals", label: "Proposals" },
      { href: "/ads/ngrams", label: "N-grams" },
      { href: "/ads/launch", label: "Launch" },
    ],
  },
];

/** In every workspace. */
export const SHARED_NAV: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/settings", label: "Settings" },
  { href: "/help", label: "Help" },
];

export const DEFAULT_WORKSPACE: WorkspaceId = "wholesale";
export const WORKSPACE_COOKIE = "ws_workspace";
/** A year: the workspace is remembered until changed. */
export const WORKSPACE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

export const workspace = (id: WorkspaceId): Workspace => WORKSPACES.find((w) => w.id === id)!;

const under = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

/** The workspace a page belongs to; null for the shared pages (Home, Settings, Help). */
export function workspaceForPath(path: string): WorkspaceId | null {
  if (SHARED_NAV.some((n) => (n.href === "/" ? path === "/" : under(path, n.href)))) return null;
  if (under(path, "/pl")) return "pl";
  if (under(path, "/ads")) return "ads";
  // A wholesale page, or one of its detail pages (/runs/…, /products/…, /suppliers/…).
  return WORKSPACES[0].nav.some((n) => under(path, n.href)) ? "wholesale" : null;
}

/** The cookie's workspace, or the default when it's missing or not one of the three. */
export function parseWorkspace(value: string | null | undefined): WorkspaceId {
  return WORKSPACES.some((w) => w.id === value) ? (value as WorkspaceId) : DEFAULT_WORKSPACE;
}

/** The cookie that remembers a workspace (read by the layout on the next visit). */
export const workspaceCookie = (id: WorkspaceId) => `${WORKSPACE_COOKIE}=${id}; path=/; max-age=${WORKSPACE_COOKIE_MAX_AGE}; samesite=lax`;

/** The next workspace round (the keyboard shortcut cycles Wholesale → Private label → Ads → Wholesale). */
export function nextWorkspace(id: WorkspaceId): WorkspaceId {
  const i = WORKSPACES.findIndex((w) => w.id === id);
  return WORKSPACES[(i + 1) % WORKSPACES.length].id;
}

/** "Candidates · Private label · Wholesale Scout"; a shared page is "Settings · Wholesale Scout". */
export function pageTitle(path: string, page: string | null | undefined): string {
  const ws = workspaceForPath(path);
  // A page without breadcrumbs: its name in the nav.
  if (!page) page = [...SHARED_NAV, ...WORKSPACES.flatMap((w) => w.nav)].find((n) => (n.href === "/" ? path === "/" : path === n.href || path.startsWith(`${n.href}/`)))?.label;
  if (page === "Home" && path === "/") page = null;
  const parts = [page, ws ? workspace(ws).label : null, "Wholesale Scout"].filter((x): x is string => !!x);
  // "Private label · Private label · …" when a page is named after its workspace.
  return parts.filter((p, i) => p !== parts[i - 1]).join(" · ");
}

/**
 * The keyboard shortcut: Alt+Shift+W (Option+Shift+W on a Mac). Chrome keeps Ctrl/Cmd+Shift+W for
 * "close window". Matched on the physical key (KeyW): on a Mac, Option changes the character typed
 * (Option+Shift+W types "„").
 */
export const isSwitchShortcut = (e: { key: string; code?: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }) =>
  e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && (e.code === "KeyW" || e.key.toLowerCase() === "w");

/** Old addresses kept working (next.config redirects): /private-label to the Private label workspace. */
export const LEGACY_REDIRECTS = [
  { source: "/private-label", has: [{ type: "query" as const, key: "tab", value: "hunt" }], destination: "/pl/niche-hunt", permanent: false },
  { source: "/private-label", destination: "/pl/candidates", permanent: false },
  { source: "/pl", destination: "/pl/candidates", permanent: false },
  { source: "/ads", destination: "/ads/dashboard", permanent: false },
];
