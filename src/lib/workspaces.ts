/**
 * The app's four workspaces: Wholesale (resell existing listings), Private label (launch your own
 * product), Ads (run and tune Sponsored Products) and Stock (track what you hold). The sidebar lists
 * them all, each as a labelled group: its main pages, then a collapsible "More" with the rest.
 * Today (Home), Settings and Help belong to all of them. Pure: the shell, the command palette and
 * the tests share it.
 */

export type WorkspaceId = "wholesale" | "pl" | "ads" | "stock";

export interface NavItem {
  href: string;
  label: string;
  soon?: boolean;
  /** Under the workspace's collapsible "More" in the sidebar. */
  more?: boolean;
}

export interface Workspace {
  id: WorkspaceId;
  label: string;
  /** What it's for. */
  tagline: string;
  /** Its first page. */
  landing: string;
  nav: NavItem[];
}

export const WORKSPACES: Workspace[] = [
  {
    id: "wholesale", label: "Wholesale", tagline: "Resell existing listings", landing: "/runs",
    nav: [
      { href: "/runs", label: "Runs" },
      { href: "/products", label: "Products" },
      { href: "/suppliers", label: "Suppliers" },
      { href: "/watchlist", label: "Watchlist" },
      { href: "/tracker", label: "Tracker" },
      { href: "/upload", label: "Upload", more: true },
      { href: "/check", label: "Check ASINs", more: true },
      { href: "/qogita", label: "Qogita", more: true },
      { href: "/sellers", label: "Sellers", more: true },
      { href: "/brands", label: "Brands", more: true },
      { href: "/favourites", label: "Favourites", more: true },
      { href: "/plan", label: "Plan", more: true },
      { href: "/hunt", label: "Hunt", more: true },
    ],
  },
  {
    id: "pl", label: "Private label", tagline: "Launch your own product", landing: "/pl/candidates",
    nav: [
      { href: "/pl/candidates", label: "Candidates" },
      { href: "/pl/niches", label: "Niches" },
      { href: "/pl/suppliers", label: "Suppliers" },
      { href: "/pl/quotes", label: "Quotes" },
      { href: "/pl/niche-hunt", label: "Niche Hunt", more: true },
      { href: "/pl/launch", label: "Launch checklist", more: true },
    ],
  },
  {
    id: "ads", label: "Ads", tagline: "Run and tune Sponsored Products", landing: "/ads/dashboard",
    nav: [
      { href: "/ads/dashboard", label: "Dashboard" },
      { href: "/ads/proposals", label: "Proposals" },
      { href: "/ads/launch", label: "Launch" },
      { href: "/ads/keywords", label: "Keywords" },
      { href: "/ads/imports", label: "Imports", more: true },
      { href: "/ads/rules", label: "Rules", more: true },
      { href: "/ads/ngrams", label: "N-grams", more: true },
      { href: "/ads/review", label: "Review", more: true },
    ],
  },
  {
    id: "stock", label: "Stock", tagline: "Track what you hold", landing: "/stock/levels",
    nav: [
      { href: "/stock/levels", label: "Levels" },
      { href: "/stock/orders", label: "Orders" },
      { href: "/stock/reorder", label: "Reorder" },
      { href: "/stock/movements", label: "Movements", more: true },
      { href: "/stock/sales", label: "Sales", more: true },
      { href: "/stock/import", label: "Import", more: true },
    ],
  },
];

/** In every workspace: Today at the top, Settings and Help pinned at the bottom. */
export const SHARED_NAV: NavItem[] = [
  { href: "/", label: "Today" },
  { href: "/settings", label: "Settings" },
  { href: "/help", label: "Help" },
];

export const workspace = (id: WorkspaceId): Workspace => WORKSPACES.find((w) => w.id === id)!;

const under = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

/** The workspace a page belongs to; null for the shared pages (Home, Settings, Help). */
export function workspaceForPath(path: string): WorkspaceId | null {
  if (SHARED_NAV.some((n) => (n.href === "/" ? path === "/" : under(path, n.href)))) return null;
  if (under(path, "/pl")) return "pl";
  if (under(path, "/ads")) return "ads";
  if (under(path, "/stock")) return "stock";
  // A wholesale page, or one of its detail pages (/runs/…, /products/…, /suppliers/…).
  return WORKSPACES[0].nav.some((n) => under(path, n.href)) ? "wholesale" : null;
}

/** "Candidates · Private label · Wholesale Scout"; a shared page is "Settings · Wholesale Scout". */
export function pageTitle(path: string, page: string | null | undefined): string {
  const ws = workspaceForPath(path);
  // A page without breadcrumbs: its name in the nav.
  if (!page) page = [...SHARED_NAV, ...WORKSPACES.flatMap((w) => w.nav)].find((n) => (n.href === "/" ? path === "/" : path === n.href || path.startsWith(`${n.href}/`)))?.label;
  // Today (Home) is titled with just the app's name.
  if (path === "/") page = null;
  const parts = [page, ws ? workspace(ws).label : null, "Wholesale Scout"].filter((x): x is string => !!x);
  // "Private label · Private label · …" when a page is named after its workspace.
  return parts.filter((p, i) => p !== parts[i - 1]).join(" · ");
}

/** Old addresses kept working (next.config redirects): /private-label to the Private label workspace. */
export const LEGACY_REDIRECTS = [
  { source: "/private-label", has: [{ type: "query" as const, key: "tab", value: "hunt" }], destination: "/pl/niche-hunt", permanent: false },
  { source: "/private-label", destination: "/pl/candidates", permanent: false },
  { source: "/pl", destination: "/pl/candidates", permanent: false },
  { source: "/ads", destination: "/ads/dashboard", permanent: false },
  { source: "/stock", destination: "/stock/levels", permanent: false },
];
