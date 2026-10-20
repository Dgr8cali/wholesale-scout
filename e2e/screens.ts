/**
 * Every route at 1440 and 390 wide, light and dark, full page, into docs/ui-audit/final/ (gitignored):
 * `E2E_SCREENS=1 node --env-file=.env.local node_modules/.bin/playwright test`. Not part of test:a11y.
 */
import { test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { open, readOnly } from "./helpers";
import { allRoutes } from "./routes";

const OUT = "docs/ui-audit/final";
const slug = (p: string) => p.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-").replace(/-+$/, "") || "today";

for (const [w, h] of [[1440, 900], [390, 844]] as const) {
  for (const theme of ["light", "dark"] as const) {
    test(`screens ${w} ${theme}`, async ({ browser, request }) => {
      test.setTimeout(30 * 60_000);
      mkdirSync(OUT, { recursive: true });
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 600, hasTouch: w < 600, extraHTTPHeaders: { authorization: `Bearer ${process.env.APP_PASSWORD ?? ""}` } });
      const page = await ctx.newPage();
      await readOnly(page);
      for (const r of await allRoutes(request)) {
        await open(page, r.path, theme);
        await page.screenshot({ path: `${OUT}/${slug(r.path)}-${w}-${theme}.png`, fullPage: true });
      }
      await ctx.close();
    });
  }
}
