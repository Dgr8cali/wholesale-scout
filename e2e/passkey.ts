import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

/**
 * The whole sign-in, in a real browser with a virtual authenticator (Chrome's WebAuthn DevTools
 * domain stands in for Touch ID): the app password while no passkey exists, add a passkey in
 * Settings → Security, sign out, sign in with the passkey. It writes to the app's database, so it
 * runs only on request, and removes what it made (it signs out only its own sessions):
 *   npm run build && E2E_PASSKEY=1 npm run test:a11y
 */
const NAME = "E2E virtual authenticator (delete me)";

test("passkey sign-in end to end", async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });

  try {
    // Signed out: a page sends you to /login and back after.
    await page.goto("/settings?tab=security");
    await expect(page).toHaveURL(/\/login\?next=%2Fsettings%3Ftab%3Dsecurity$/);
    expect((await page.request.get("/api/runs")).status()).toBe(401);

    // No passkey yet: the app password gets you in (to add the first).
    await page.getByLabel("App password").fill(process.env.APP_PASSWORD ?? "");
    await page.getByRole("button", { name: "Sign in with the app password" }).click();
    await expect(page).toHaveURL(/\/settings\?tab=security$/);

    await page.getByPlaceholder("e.g. MacBook, iPhone").fill(NAME);
    await page.getByRole("button", { name: "Add a passkey on this device" }).click();
    await expect(page.getByText(`Passkey added: ${NAME}`)).toBeVisible();
    await expect(page.getByText(NAME, { exact: false }).first()).toBeVisible();

    // An extension token: shown once, opens the extension's endpoints only.
    await page.getByRole("button", { name: "Create token" }).click();
    const token = await page.getByLabel("New token").inputValue();
    expect(token).toMatch(/^wst_/);
    const ext = await page.request.get("/api/extension/ping", { headers: { authorization: `Bearer ${token}`, cookie: "" } });
    expect(await ext.json()).toEqual({ ok: true, app: "wholesale-scout" });

    // Sign this device out, then back in with the passkey: no password, no email.
    await page.getByRole("listitem").filter({ hasText: "this device" }).getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByLabel("App password")).toHaveCount(0);
    await page.getByRole("button", { name: "Sign in with passkey" }).click();
    await expect(page).toHaveURL(/\/$/);
    expect((await page.request.get("/api/runs")).status()).toBe(200);

    await page.goto("/settings?tab=security");
    await expect(page.getByRole("listitem").filter({ hasText: "this device" })).toContainText(`By passkey (${NAME})`);
    // Tidy up through the app: revoke the token, sign out everywhere.
    await page.getByRole("listitem").filter({ hasText: token.slice(0, 10) }).getByRole("button", { name: "Revoke" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Revoke" }).click();
    await expect(page.getByText("Token revoked")).toBeVisible();
    const gone = await page.request.get("/api/extension/ping", { headers: { authorization: `Bearer ${token}`, cookie: "" } });
    expect(gone.status()).toBe(401);
    // This device only: "Sign out everywhere" would sign out your real devices too.
    await page.getByRole("listitem").filter({ hasText: "this device" }).getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
  } finally {
    // The test passkey can't be removed in the app (it's the only one), so it goes here.
    const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, { auth: { persistSession: false } });
    const keys = ((await db.from("auth_passkeys").select("id").eq("name", NAME)).data ?? []).map((k) => k.id as string);
    if (keys.length) await db.from("auth_sessions").update({ revoked_at: new Date().toISOString() }).in("passkey_id", keys).is("revoked_at", null);
    const { error } = await db.from("auth_passkeys").delete().eq("name", NAME);
    if (error) throw new Error(`clean-up: ${error.message}`);
  }
});
