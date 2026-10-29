import { defineConfig } from "@playwright/test";

/**
 * Browser checks against the built app (`npm run build` first): every route through axe in light and
 * dark, and at 390px wide. The app's password comes from APP_PASSWORD (.env.local), sent as a bearer
 * token: the local server runs with the emergency fallback on (AUTH_PASSWORD_FALLBACK=1) so it opens
 * the pages; the data is the app's own database, read only (every write is blocked in the browser).
 * E2E_PASSKEY=1 runs e2e/passkey.ts instead: the whole sign-in with a virtual authenticator.
 * Run with `npm run test:a11y`.
 */
const PORT = Number(process.env.E2E_PORT || 3311);
export default defineConfig({
  testDir: "e2e",
  testMatch: process.env.E2E_PASSKEY ? "passkey.ts" : process.env.E2E_AUDIT ? "audit.ts" : process.env.E2E_SCREENS ? "screens.ts" : "*.spec.ts",
  timeout: 120_000,
  fullyParallel: true,
  workers: 4,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE || `http://localhost:${PORT}`,
    extraHTTPHeaders: process.env.E2E_PASSKEY ? {} : { authorization: `Bearer ${process.env.APP_PASSWORD ?? ""}` },
  },
  webServer: process.env.E2E_BASE ? undefined : {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/manifest.webmanifest`,
    reuseExistingServer: true,
    env: { AUTH_PASSWORD_FALLBACK: process.env.E2E_PASSKEY ? "" : "1" },
    timeout: 60_000,
  },
});
