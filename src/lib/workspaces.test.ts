import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { articles } from "./help/load";
import { workspaceOfArticle } from "./help/catalog";
import { pageTitle, SHARED_NAV, workspace, workspaceForPath, WORKSPACES } from "./workspaces";

/** Where next.config's redirects send a request: the first rule whose source (and query condition) matches. */
async function redirected(url: string): Promise<string | null> {
  const u = new URL(url, "https://app.test");
  for (const r of (await nextConfig.redirects!()) as { source: string; destination: string; has?: { type: string; key: string; value?: string }[] }[]) {
    if (r.source !== u.pathname) continue;
    if (r.has?.some((h) => h.type === "query" && u.searchParams.get(h.key) !== (h.value ?? u.searchParams.get(h.key)))) continue;
    if (r.has?.some((h) => h.type === "query" && !u.searchParams.has(h.key))) continue;
    // Next carries the query string across to the destination.
    return `${r.destination}${u.search}`;
  }
  return null;
}

describe("workspaces", () => {
  it("are Wholesale, Private label, Ads and Stock, each a sidebar group with its main pages then More", () => {
    expect(WORKSPACES.map((w) => [w.id, w.label, w.tagline])).toEqual([
      ["wholesale", "Wholesale", "Resell existing listings"],
      ["pl", "Private label", "Launch your own product"],
      ["ads", "Ads", "Run and tune Sponsored Products"],
      ["stock", "Stock", "Track what you hold"],
    ]);
    const main = (id: Parameters<typeof workspace>[0]) => workspace(id).nav.filter((n) => !n.more).map((n) => n.label);
    const more = (id: Parameters<typeof workspace>[0]) => workspace(id).nav.filter((n) => n.more).map((n) => n.label);
    expect(main("wholesale")).toEqual(["Runs", "New run", "Products", "Suppliers", "Watchlist", "Tracker"]);
    expect(more("wholesale")).toEqual(["Sellers", "Brands", "Favourites", "Plan"]);
    expect(main("pl")).toEqual(["Candidates", "Niches", "Suppliers", "Quotes"]);
    expect(more("pl")).toEqual(["Niche Hunt", "Launch checklist"]);
    expect(main("ads")).toEqual(["Dashboard", "Proposals", "Launch", "Keywords"]);
    expect(more("ads")).toEqual(["Imports", "Rules", "N-grams", "Review"]);
    expect(main("stock")).toEqual(["Levels", "Orders", "Reorder"]);
    expect(more("stock")).toEqual(["Movements", "Sales", "Import"]);
    // A group's main pages come before its More.
    for (const w of WORKSPACES) expect(w.nav.findIndex((n) => n.more)).toBe(w.nav.filter((n) => !n.more).length);
    expect(SHARED_NAV.map((n) => n.label)).toEqual(["Today", "Settings", "Help"]);
  });

  it("links only to pages that exist, each once", () => {
    const hrefs = [...SHARED_NAV, ...WORKSPACES.flatMap((w) => w.nav)].map((n) => n.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const h of hrefs) expect(existsSync(`src/app${h === "/" ? "" : h}/page.tsx`), h).toBe(true);
  });

  it("knows which workspace a page belongs to; Home, Settings and Help belong to all", () => {
    expect(workspaceForPath("/runs/abc")).toBe("wholesale");
    expect(workspaceForPath("/products/B0ABC12345")).toBe("wholesale");
    expect(workspaceForPath("/pl/candidates")).toBe("pl");
    expect(workspaceForPath("/ads/rules")).toBe("ads");
    expect(workspaceForPath("/stock/levels")).toBe("stock");
    for (const p of ["/", "/settings", "/help", "/help/pages/runs"]) expect(workspaceForPath(p)).toBeNull();
  });

  it("titles browser tabs page · workspace · app", () => {
    expect(pageTitle("/pl/candidates", "Candidates")).toBe("Candidates · Private label · Wholesale Scout");
    expect(pageTitle("/ads/rules", "Rules")).toBe("Rules · Ads · Wholesale Scout");
    expect(pageTitle("/settings", "Settings")).toBe("Settings · Wholesale Scout");
    expect(pageTitle("/", null)).toBe("Wholesale Scout");
    // No breadcrumbs: the nav label.
    expect(pageTitle("/runs", null)).toBe("Runs · Wholesale · Wholesale Scout");
  });

  it("redirects the old Private label addresses, keeping ?c=", async () => {
    expect(await redirected("/private-label")).toBe("/pl/candidates");
    expect(await redirected("/private-label?c=abc-123")).toBe("/pl/candidates?c=abc-123");
    expect(await redirected("/private-label?tab=hunt")).toBe("/pl/niche-hunt?tab=hunt");
    expect(await redirected("/pl")).toBe("/pl/candidates");
    expect(await redirected("/ads")).toBe("/ads/dashboard");
    expect(await redirected("/stock")).toBe("/stock/levels");
    expect(await redirected("/pl/candidates")).toBeNull();
  });

  it("groups Help articles under Wholesale, Private label, Ads and General", () => {
    expect(workspaceOfArticle("gates/demand", null)).toBe("wholesale");
    expect(workspaceOfArticle("pages/runs", "/runs")).toBe("wholesale");
    expect(workspaceOfArticle("pages/private-label", "/pl")).toBe("pl");
    expect(workspaceOfArticle("pages/settings", "/settings")).toBe("general");
    expect(workspaceOfArticle("concepts/niche-hunt", null, "pl")).toBe("pl");
    const by = (w: string) => articles().filter((a) => a.workspace === w).map((a) => a.slug);
    expect(by("pl")).toEqual(expect.arrayContaining(["pages/private-label", "concepts/niche-hunt"]));
    expect(by("ads")).toEqual(expect.arrayContaining(["pages/ads", "howto/ads-importing-reports"]));
    expect(by("stock")).toEqual(expect.arrayContaining(["pages/stock"]));
    expect(by("general")).toEqual(expect.arrayContaining(["getting-started", "pages/home", "pages/settings", "pages/help", "pages/extension", "reference/glossary"]));
    expect(by("wholesale")).toEqual(expect.arrayContaining(["pages/runs", "gates/demand", "concepts/fees", "howto/waive-a-gate"]));
  });
});
