/**
 * WCAG 2.1 AA on every route (axe), light and dark: no serious or critical violation.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { open, readOnly } from "./helpers";
import { allRoutes, type Route } from "./routes";

let routes: Route[] = [];
test.beforeAll(async ({ request }) => { routes = await allRoutes(request); });

for (const theme of ["light", "dark"] as const) {
  test(`axe, ${theme}: every route`, async ({ page }) => {
    test.setTimeout(30 * 60_000);
    await readOnly(page);
    const failures: string[] = [];
    for (const r of routes) {
      await open(page, r.path, theme);
      const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      for (const v of res.violations.filter((x) => x.impact === "serious" || x.impact === "critical")) {
        failures.push(`${r.name} (${r.path}) · ${v.id} [${v.impact}] ×${v.nodes.length}: ${v.help}\n    ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("\n    ")}`);
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });
}
