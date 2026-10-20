import { defineConfig } from "@playwright/test";

/**
 * Browser checks against the built app (`npm run build` first): every route through axe in light and
 * dark, and at 390px wide. The app's password comes from APP_PASSWORD (.env.local), sent as a bearer
 * token; the data is the app's own database, read only (every write is blocked in the browser).
 * Run with `npm run test:a11y`.
 */
const PORT = Number(process.env.E2E_PORT || 3311);
export default defineConfig({
  testDir: "e2e",
  testMatch: process.env.E2E_AUDIT ? "audit.ts" : process.env.E2E_SCREENS ? "screens.ts" : "*.spec.ts",
  timeout: 120_000,
  fullyParallel: true,
  workers: 4,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE || `http://localhost:${PORT}`,
    extraHTTPHeaders: { authorization: `Bearer ${process.env.APP_PASSWORD ?? ""}` },
  },
  webServer: process.env.E2E_BASE ? undefined : {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/manifest.webmanifest`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
