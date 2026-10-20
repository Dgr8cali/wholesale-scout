/**
 * Every route at 390 × 844 (a phone): nothing wider than the screen, controls big enough to tap
 * (44px), the page's primary action near the top, and the menu drawer closing once a page is chosen.
 */
import { expect, test } from "@playwright/test";
import { open, readOnly } from "./helpers";
import { allRoutes, type Route } from "./routes";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

let routes: Route[] = [];
test.beforeAll(async ({ request }) => { routes = await allRoutes(request); });

test("phone: no sideways scroll, 44px targets, primary action near the top", async ({ page }) => {
  test.setTimeout(30 * 60_000);
  await readOnly(page);
  const failures: string[] = [];
  for (const r of routes) {
    await open(page, r.path, "light");
    const res = await page.evaluate(() => {
      const wide = document.documentElement.scrollWidth - window.innerWidth;
      // Tappable controls (inline text links and text buttons in a sentence are exempt, as WCAG allows).
      const small: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>("button, select, input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]), [role=tab], a[data-slot=button]")) {
        // Exempt: inline text actions and links, toasts, hidden or covered parts, and checkboxes and
        // switches (their tap area is drawn larger than the box, by an ::after the box doesn't measure).
        if (el.closest("[data-text-button], [data-variant=link], [data-sonner-toast], [aria-hidden=true], [data-radix-popper-content-wrapper], [role=dialog], [inert]")) continue;
        if (el.getAttribute("role") === "switch" || el.getAttribute("role") === "checkbox") continue;
        const b = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        if (!b.width || !b.height || style.visibility === "hidden" || style.display === "none") continue;
        if (b.height < 43.5) small.push(`${el.tagName.toLowerCase()}${el.getAttribute("aria-label") ? `[${el.getAttribute("aria-label")}]` : ""} "${(el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(b.height)}px`);
      }
      const primary = document.querySelector<HTMLElement>("[data-slot=page-header] [data-variant=primary], [data-slot=page-header] [data-variant=default]");
      const primaryTop = primary ? primary.getBoundingClientRect().top + window.scrollY : null;
      return { wide, small, primaryTop };
    });
    if (res.wide > 1) failures.push(`${r.name} (${r.path}): ${res.wide}px wider than the screen`);
    if (res.small.length) failures.push(`${r.name} (${r.path}): ${res.small.length} small target(s): ${res.small.slice(0, 4).join("; ")}`);
    if (res.primaryTop != null && res.primaryTop > 844) failures.push(`${r.name} (${r.path}): primary action at ${Math.round(res.primaryTop)}px, below the first screen`);
  }
  expect(failures, failures.join("\n")).toEqual([]);
});

test("phone: the menu drawer closes after choosing a page", async ({ page }) => {
  await readOnly(page);
  await open(page, "/", "light");
  await page.getByRole("button", { name: "Menu" }).click();
  const drawer = page.locator("[data-mobile=true][data-sidebar=sidebar]");
  await expect(drawer).toBeVisible();
  await drawer.getByRole("link", { name: "Products" }).click();
  await page.waitForURL("**/products");
  await expect(drawer).toBeHidden();
});
