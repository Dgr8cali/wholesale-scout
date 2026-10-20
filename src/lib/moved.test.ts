import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MOVED, movedTo } from "./moved";
import { SHARED_NAV, WORKSPACES } from "./workspaces";

const pageAt = (path: string) => existsSync(`src/app${path === "/" ? "" : path}/page.tsx`);

describe("merged pages", () => {
  it("send every old address to a page that exists, and the old page is gone", () => {
    for (const m of MOVED) {
      expect(pageAt(m.to.split("?")[0]), m.to).toBe(true);
      if (!m.tab) expect(pageAt(m.from), m.from).toBe(false);
    }
  });

  it("keep the old query string, with the new tab winning", () => {
    expect(movedTo("/check", "?asins=B0HM8FBX3T")).toBe("/new-run?tab=check&asins=B0HM8FBX3T");
    expect(movedTo("/sellers/scan", "?seller=A1B2C3")).toBe("/new-run?tab=seller&seller=A1B2C3");
    expect(movedTo("/upload/", "")).toBe("/new-run?tab=upload");
    expect(movedTo("/runs", "")).toBeNull();
    // A tab that moved on its own: only that ?tab= redirects.
    expect(movedTo("/settings", "?tab=ads")).toBe("/ads/rules?tab=settings");
    expect(movedTo("/settings", "?tab=business")).toBeNull();
  });

  it("open a candidate from the old list address on its own page, keeping the rest of the query", () => {
    expect(movedTo("/pl/candidates", "?c=aed5a06e-1715-4197-9812-29aef4303174")).toBe("/pl/candidates/aed5a06e-1715-4197-9812-29aef4303174");
    expect(movedTo("/pl/candidates", "?c=abc&tab=suppliers")).toBe("/pl/candidates/abc?tab=suppliers");
    expect(existsSync("src/app/pl/candidates/[id]/page.tsx")).toBe(true);
    // The list itself, and New candidate, stay.
    expect(movedTo("/pl/candidates", "")).toBeNull();
    expect(movedTo("/pl/candidates", "?new=1")).toBeNull();
    expect(movedTo("/pl/candidates", "?c=../../etc")).toBeNull();
  });

  it("aren't in the menu any more", () => {
    const hrefs = [...SHARED_NAV, ...WORKSPACES.flatMap((w) => w.nav)].map((n) => n.href);
    for (const m of MOVED) if (!m.tab) expect(hrefs, m.from).not.toContain(m.from);
  });
});
