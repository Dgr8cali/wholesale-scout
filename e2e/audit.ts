/**
 * The full axe report (every serious or critical node, with its colours), for fixing:
 * `node --env-file=.env.local node_modules/.bin/playwright test e2e/audit.ts` writes test-results/axe.json.
 * Not part of `npm run test:a11y` (a11y.spec.ts is the check).
 */
import AxeBuilder from "@axe-core/playwright";
import { test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { open, readOnly } from "./helpers";
import { allRoutes } from "./routes";

test("axe report", async ({ page, request }) => {
  test.setTimeout(60 * 60_000);
  await readOnly(page);
  const out: unknown[] = [];
  for (const theme of ["light", "dark"] as const) {
    for (const r of await allRoutes(request)) {
      await open(page, r.path, theme);
      const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      for (const v of res.violations.filter((x) => x.impact === "serious" || x.impact === "critical")) {
        for (const n of v.nodes) out.push({ theme, route: r.name, rule: v.id, target: n.target.join(" "), html: n.html.slice(0, 200), why: n.failureSummary?.slice(0, 300) });
      }
    }
  }
  writeFileSync("test-results/axe.json", JSON.stringify(out, null, 1));
});
