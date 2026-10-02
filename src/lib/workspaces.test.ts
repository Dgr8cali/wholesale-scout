import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { articles } from "./help/load";
import { workspaceOfArticle } from "./help/catalog";
import {
  isSwitchShortcut, nextWorkspace, pageTitle, parseWorkspace, WORKSPACE_COOKIE, workspace, workspaceCookie, workspaceForPath, WORKSPACES,
} from "./workspaces";

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
  it("are Wholesale, Private label, Ads and Stock, each with its own nav", () => {
    expect(WORKSPACES.map((w) => [w.id, w.label, w.tagline])).toEqual([
      ["wholesale", "Wholesale", "Resell existing listings"],
      ["pl", "Private label", "Launch your own product"],
      ["ads", "Ads", "Run and tune Sponsored Products"],
      ["stock", "Stock", "Track what you hold"],
    ]);
    expect(workspace("stock").nav.map((n) => n.href)).toEqual(["/stock/levels", "/stock/movements", "/stock/sales", "/stock/reorder", "/stock/import"]);
    expect(workspace("pl").nav.map((n) => [n.href, n.soon ?? false])).toEqual([["/pl/candidates", false], ["/pl/niche-hunt", false], ["/pl/quotes", false], ["/pl/launch", false]]);
    expect(workspace("ads").nav.map((n) => n.href)).toEqual(["/ads/dashboard", "/ads/imports", "/ads/rules", "/ads/proposals", "/ads/ngrams", "/ads/launch", "/ads/review"]);
    expect(workspace("ads").nav.some((n) => n.soon)).toBe(false);
    expect(workspace("wholesale").nav.map((n) => n.label)).toEqual(expect.arrayContaining(["Runs", "Upload", "Check ASINs", "Qogita", "Sellers", "Brands", "Suppliers", "Favourites", "Watchlist", "Plan", "Hunt"]));
  });

  it("knows which workspace a page belongs to; Home, Settings and Help belong to all", () => {
    expect(workspaceForPath("/runs/abc")).toBe("wholesale");
    expect(workspaceForPath("/products/B0ABC12345")).toBe("wholesale");
    expect(workspaceForPath("/pl/candidates")).toBe("pl");
    expect(workspaceForPath("/ads/rules")).toBe("ads");
    expect(workspaceForPath("/stock/levels")).toBe("stock");
    for (const p of ["/", "/settings", "/help", "/help/pages/runs"]) expect(workspaceForPath(p)).toBeNull();
  });

  it("remembers the workspace in a cookie, falling back to Wholesale", () => {
    expect(workspaceCookie("pl")).toBe(`${WORKSPACE_COOKIE}=pl; path=/; max-age=31536000; samesite=lax`);
    expect(parseWorkspace("ads")).toBe("ads");
    expect(parseWorkspace(undefined)).toBe("wholesale");
    expect(parseWorkspace("nonsense")).toBe("wholesale");
  });

  it("cycles with Alt+Shift+W (Option+Shift+W on a Mac)", () => {
    expect([nextWorkspace("wholesale"), nextWorkspace("pl"), nextWorkspace("ads"), nextWorkspace("stock")]).toEqual(["pl", "ads", "stock", "wholesale"]);
    const k = (o: Partial<{ key: string; code: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }>) => ({ key: "W", code: "KeyW", shiftKey: true, ctrlKey: false, metaKey: false, altKey: true, ...o });
    expect(isSwitchShortcut(k({}))).toBe(true);
    // Option+Shift+W on a Mac types "„": the physical key decides.
    expect(isSwitchShortcut(k({ key: "„" }))).toBe(true);
    // Chrome's close-window shortcuts, and plain or partial chords, aren't it.
    expect(isSwitchShortcut(k({ altKey: false, ctrlKey: true }))).toBe(false);
    expect(isSwitchShortcut(k({ altKey: false, metaKey: true }))).toBe(false);
    expect(isSwitchShortcut(k({ shiftKey: false }))).toBe(false);
    expect(isSwitchShortcut(k({ altKey: false }))).toBe(false);
    expect(isSwitchShortcut(k({ code: "KeyQ", key: "Q" }))).toBe(false);
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

  it("renders the switcher as four options with the current one checked", () => {
    const html = renderToStaticMarkup(createElement(WorkspaceSwitcher, { value: "pl", onChange: () => {} }));
    expect(html).toContain('role="radiogroup"');
    expect(html.match(/role="radio"/g)).toHaveLength(4);
    expect(html).toMatch(/aria-checked="true"[^>]*title="Private label: Launch your own product"/);
    expect(html.match(/aria-checked="false"/g)).toHaveLength(3);
    expect(html).toContain("Launch your own product");
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
