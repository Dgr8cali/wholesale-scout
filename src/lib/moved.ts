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
  // 3. Niche Hunt → Niches → Find niches.
  { from: "/pl/niche-hunt", to: "/pl/niches?tab=find" },
  // 4. Ads Imports → the Dashboard's Import button (a sheet) and its Imports history tab.
  { from: "/ads/imports", to: "/ads/dashboard?tab=imports" },
  // 5. Settings → Ads → Ads → Rules → Ad settings (one home for the rules and what they work from).
  { from: "/settings", tab: "ads", to: "/ads/rules?tab=settings" },
  // 6. Bulk exports → the Exports tab of Proposals.
  { from: "/ads/proposals/exports", to: "/ads/proposals?tab=exports" },
  // 7. Keywords and N-grams (and the Dashboard's search terms) → Search terms, one ?asin= for every tab.
  { from: "/ads/keywords", to: "/ads/search-terms?tab=keywords" },
  { from: "/ads/ngrams", to: "/ads/search-terms?tab=ngrams" },
  // 8. Tracker + Stock → Orders → Stock → Purchases (the same purchase records, shown once).
  { from: "/tracker", to: "/stock/purchases" },
  { from: "/stock/orders", to: "/stock/purchases" },
  // 9. Private label Quotes → the Quotes tab of Suppliers & quotes.
  { from: "/pl/quotes", to: "/pl/suppliers?tab=quotes" },
];

/** Where an old address now lives (path + query), or null when it hasn't moved. */
export function movedTo(path: string, search: string): string | null {
  const clean = path.length > 1 ? path.replace(/\/+$/, "") : path;
  const q = new URLSearchParams(search);
  // 10. A candidate below the Candidates list (?c=) → its own page (phase 4b). The browser keeps a
  // #suppliers / #listing anchor across the redirect, and the page opens that tab.
  const c = clean === "/pl/candidates" ? q.get("c") : null;
  if (c && /^[\w-]{1,64}$/.test(c)) {
    q.delete("c");
    const rest = q.toString();
    return `/pl/candidates/${c}${rest ? `?${rest}` : ""}`;
  }
  const rule = MOVED.find((m) => m.from === clean && (m.tab === undefined || q.get("tab") === m.tab));
  if (!rule) return null;
  const [toPath, toQuery = ""] = rule.to.split("?");
  const out = new URLSearchParams(toQuery);
  // The old address's own query comes along; the new tab wins over an old ?tab=.
  for (const [k, v] of q) if (!(k === "tab" && out.has("tab"))) out.append(k, v);
  const s = out.toString();
  return s ? `${toPath}?${s}` : toPath;
}
