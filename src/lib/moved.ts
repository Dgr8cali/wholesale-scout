/**
 * Pages merged into others (UI redesign phase 3a): each old address answers with a permanent
 * redirect to its new home and tab, keeping the rest of its query string (?asin=, ?seller=…).
 * Pure: the proxy, the tests and the docs share it. A rule with `tab` matches only that ?tab=.
 */
export interface Moved {
  from: string;
  /** Only when the old address had this ?tab= (it's replaced by `to`'s own). */
  tab?: string;
  /** The new path, with its ?tab= when it has tabs. */
  to: string;
}

export const MOVED: Moved[] = [
  // 1. Wholesale → New run: one page, a tab per source.
  { from: "/upload", to: "/new-run?tab=upload" },
  { from: "/check", to: "/new-run?tab=check" },
  { from: "/qogita", to: "/new-run?tab=qogita" },
  { from: "/hunt", to: "/new-run?tab=hunt" },
  { from: "/sellers/scan", to: "/new-run?tab=seller" },
  // 2. Favourites + Watchlist → Shortlist (the same starred products; two tabs of tools).
  { from: "/favourites", to: "/shortlist?tab=products" },
  { from: "/watchlist", to: "/shortlist?tab=watching" },
];

/** Where an old address now lives (path + query), or null when it hasn't moved. */
export function movedTo(path: string, search: string): string | null {
  const clean = path.length > 1 ? path.replace(/\/+$/, "") : path;
  const q = new URLSearchParams(search);
  const rule = MOVED.find((m) => m.from === clean && (m.tab === undefined || q.get("tab") === m.tab));
  if (!rule) return null;
  const [toPath, toQuery = ""] = rule.to.split("?");
  const out = new URLSearchParams(toQuery);
  // The old address's own query comes along; the new tab wins over an old ?tab=.
  for (const [k, v] of q) if (!(k === "tab" && out.has("tab"))) out.append(k, v);
  const s = out.toString();
  return s ? `${toPath}?${s}` : toPath;
}
