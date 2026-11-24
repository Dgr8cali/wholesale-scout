/** Shared by the browser checks. */
import type { Page } from "@playwright/test";

/** Only reads: any write the page tries is aborted. */
export async function readOnly(page: Page) {
  await page.route("**/api/**", (r) => (r.request().method() === "GET" ? r.continue() : r.abort()));
}

/** The page open in a theme, settled (its data loaded). */
export async function open(page: Page, path: string, theme: "light" | "dark") {
  await page.addInitScript((t) => { try { localStorage.setItem("theme", t); } catch { /* none */ } }, theme);
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  await page.goto(path, { waitUntil: "networkidle", timeout: 60_000 });
  // Gentle on the live database the local app reads: a pause after every page (E2E_PAUSE_MS, default 1.5 s).
  await page.waitForTimeout(300 + Number(process.env.E2E_PAUSE_MS ?? 1500));
}
