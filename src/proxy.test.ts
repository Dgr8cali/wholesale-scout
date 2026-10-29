import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearAuthCache, createApiToken, createSession, SESSION_COOKIE } from "./lib/server/auth";
import { __setDbForTests } from "./lib/server/db";
import { FakeDb } from "./lib/server/fakeDb";
import { PUBLIC_PATHS, proxy, vercelRedirect } from "./proxy";

/** Every page and API route in the app, with [params] filled in. */
function routes(): { path: string; api: boolean }[] {
  const out: { path: string; api: boolean }[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f === "route.ts" || f === "page.tsx") {
        const rel = relative(join(__dirname, "app"), dir).split(sep).filter((s) => !/^\(.*\)$/.test(s));
        const path = "/" + rel.map((s) => (s.startsWith("[") ? "x" : s)).join("/");
        out.push({ path: path === "/" ? "/" : path.replace(/\/$/, ""), api: f === "route.ts" });
      }
    }
  };
  walk(join(__dirname, "app"));
  return out;
}

const IP = "203.0.113.1";
const req = (path: string, h: Record<string, string> = {}, method = "GET") =>
  new NextRequest(`https://ws.test${path}`, { method, headers: { "x-forwarded-for": IP, host: "ws.test", ...h } });
const cookie = (token: string) => ({ cookie: `${SESSION_COOKIE}=${token}` });
const passed = (r: Response) => r.status === 200 && r.headers.get("x-middleware-next") === "1";

describe("the sign-in gate", () => {
  let db: FakeDb;
  beforeEach(() => {
    db = new FakeDb();
    __setDbForTests(db);
    clearAuthCache();
    process.env.AUTH_ALLOWED_EMAILS = "akin@dgr8cali.co.uk";
    process.env.CRON_SECRET = "cron-s3cret";
    process.env.WATCHDOG_SECRET = "dog-s3cret";
    process.env.APP_PASSWORD = "old-pw";
  });
  afterEach(() => {
    __setDbForTests(null);
    for (const k of ["AUTH_ALLOWED_EMAILS", "CRON_SECRET", "WATCHDOG_SECRET", "APP_PASSWORD", "AUTH_PASSWORD_FALLBACK"]) delete process.env[k];
  });

  const all = routes();
  it("finds the app's routes", () => {
    expect(all.length).toBeGreaterThan(150);
    expect(all).toContainEqual({ path: "/settings", api: false });
    expect(all).toContainEqual({ path: "/api/extension/check", api: true });
  });

  it("every page and API route needs a session: pages go to /login, APIs answer 401 without a password prompt", async () => {
    for (const r of all) {
      if (PUBLIC_PATHS.has(r.path)) continue;
      const res = await proxy(req(r.path));
      if (r.api) {
        expect(res.status, r.path).toBe(401);
        expect(res.headers.get("www-authenticate"), r.path).toBeNull();
      } else {
        expect(res.status, r.path).toBe(307);
        expect(new URL(res.headers.get("location")!).pathname, r.path).toBe("/login");
      }
      // A POST to a page (a server action) is refused, not redirected.
      if (!r.api) expect((await proxy(req(r.path, {}, "POST"))).status, r.path).toBe(401);
    }
  });

  it("…and a live session opens every one; the page asked for comes back after signing in", async () => {
    const token = await createSession("akin@dgr8cali.co.uk", "passkey", {});
    for (const r of all) expect(passed(await proxy(req(r.path, cookie(token)))), r.path).toBe(true);
    const res = await proxy(req("/ads/dashboard?tab=terms"));
    expect(res.headers.get("location")).toBe("https://ws.test/login?next=%2Fads%2Fdashboard%3Ftab%3Dterms");
  });

  it("the sign-in page and its calls are open; nothing else is", async () => {
    for (const p of PUBLIC_PATHS) expect(passed(await proxy(req(p))), p).toBe(true);
    expect(PUBLIC_PATHS.has("/api/auth/tokens")).toBe(false);
    expect(PUBLIC_PATHS.has("/api/auth/passkeys/options")).toBe(false);
    expect(PUBLIC_PATHS.has("/api/auth/security")).toBe(false);
  });

  it("signed out, expired, or an address no longer allowed: refused", async () => {
    const token = await createSession("akin@dgr8cali.co.uk", "passkey", {});
    db.tables.auth_sessions[0].revoked_at = new Date().toISOString();
    clearAuthCache();
    expect((await proxy(req("/api/runs", cookie(token)))).status).toBe(401);

    const t2 = await createSession("akin@dgr8cali.co.uk", "email", {}, Date.now() - 91 * 86_400_000);
    expect((await proxy(req("/api/runs", cookie(t2)))).status).toBe(401);

    const t3 = await createSession("akin@dgr8cali.co.uk", "passkey", {});
    process.env.AUTH_ALLOWED_EMAILS = "someone@else.example";
    expect((await proxy(req("/api/runs", cookie(t3)))).status).toBe(401);
    expect((await proxy(req("/api/runs", cookie("made-up")))).status).toBe(401);
  });

  it("sessions slide: used after an hour, the 90 days start again and the cookie is set again", async () => {
    const start = Date.now() - 2 * 3_600_000;
    const token = await createSession("akin@dgr8cali.co.uk", "passkey", {}, start);
    const res = await proxy(req("/", cookie(token)));
    expect(passed(res)).toBe(true);
    expect(Date.parse(db.tables.auth_sessions[0].expires_at as string)).toBeGreaterThan(Date.now() + 89.9 * 86_400_000);
    expect(res.headers.get("set-cookie")).toMatch(/ws_session=.*Max-Age=7776000.*HttpOnly/i);
  });

  it("an extension token opens the extension's endpoints only, and stops when revoked", async () => {
    const { token, row } = await createApiToken("Chrome on Mac");
    const bearer = { authorization: `Bearer ${token}` };
    for (const p of ["/api/extension/check", "/api/extension/ping", "/api/pl/poe", "/api/pl/poe/attach", "/api/pl/reviews/capture", "/api/pl/suppliers/capture", "/api/ads/ranks"]) {
      expect(passed(await proxy(req(p, bearer))), p).toBe(true);
    }
    for (const p of ["/", "/settings", "/api/runs", "/api/auth/tokens", "/api/auth/security", "/api/stock", "/api/cron/qogita", "/api/pl/poems"]) {
      const res = await proxy(req(p, bearer));
      expect(passed(res), p).toBe(false);
    }
    expect(await (await proxy(req("/api/runs", bearer))).json()).toEqual({ error: "An extension token only opens the extension's endpoints." });
    db.tables.api_tokens.find((t) => t.id === row.id)!.revoked_at = new Date().toISOString();
    clearAuthCache();
    expect((await proxy(req("/api/extension/ping", bearer))).status).toBe(401);
    expect((await proxy(req("/api/extension/ping", { authorization: "Bearer wst_madeup" }))).status).toBe(401);
    // The preflight carries no credentials.
    expect(passed(await proxy(req("/api/extension/check", {}, "OPTIONS")))).toBe(true);
    expect((await proxy(req("/api/runs", {}, "OPTIONS"))).status).toBe(401);
  });

  it("cron keeps its server-side secrets; the app's background calls carry the CRON_SECRET (APIs only, not sign-in)", async () => {
    expect(passed(await proxy(req("/api/cron/qogita", { authorization: "Bearer cron-s3cret" })))).toBe(true);
    expect(passed(await proxy(req("/api/cron/watchdog", { authorization: "Bearer dog-s3cret" })))).toBe(true);
    expect(passed(await proxy(req("/api/runs/x/process", { authorization: "Bearer cron-s3cret" }, "POST")))).toBe(true);
    expect((await proxy(req("/api/runs/x/process", { authorization: "Bearer dog-s3cret" }, "POST"))).status).toBe(401);
    expect((await proxy(req("/api/auth/tokens", { authorization: "Bearer cron-s3cret" }, "POST"))).status).toBe(401);
    expect((await proxy(req("/settings", { authorization: "Bearer cron-s3cret" }))).status).toBe(307);
    expect((await proxy(req("/api/cron/qogita", { authorization: "Bearer wrong" }))).status).toBe(401);
  });

  it("APP_PASSWORD opens nothing unless AUTH_PASSWORD_FALLBACK=1; old Basic retries never block the address", async () => {
    for (let i = 0; i < 30; i++) expect((await proxy(req("/api/runs", { authorization: `Basic ${btoa("x:old-pw-typo")}` }))).status).toBe(401);
    expect((await proxy(req("/api/runs", { authorization: "Bearer old-pw" }))).status).toBe(401);
    const token = await createSession("akin@dgr8cali.co.uk", "passkey", {});
    expect(passed(await proxy(req("/api/runs", { ...cookie(token), authorization: `Basic ${btoa("x:old-pw-typo")}` })))).toBe(true);

    process.env.AUTH_PASSWORD_FALLBACK = "1";
    expect(passed(await proxy(req("/api/runs", { authorization: "Bearer old-pw" })))).toBe(true);
    expect(passed(await proxy(req("/", { authorization: `Basic ${btoa("x:old-pw")}` }, "GET")))).toBe(true);
  });

  it("the client can't claim to be someone: x-ws-auth is set by the gate", async () => {
    const token = await createSession("akin@dgr8cali.co.uk", "passkey", {});
    const res = await proxy(req("/api/runs", { ...cookie(token), "x-ws-auth": "cron" }));
    expect(res.headers.get("x-middleware-request-x-ws-auth")).toBe("you (passkey)");
  });

  it("sends everything on the old Vercel address to the same path on the server (308), before the gate", async () => {
    expect(vercelRedirect("wholesale-scout.vercel.app", "/ads/proposals?tab=open")).toBe("https://ws.dgr8cali.co.uk/ads/proposals?tab=open");
    expect(vercelRedirect("ws.dgr8cali.co.uk", "/")).toBeNull();
    const r = await proxy(new NextRequest("https://wholesale-scout.vercel.app/api/plan?x=1", { method: "POST", headers: { host: "wholesale-scout.vercel.app" } }));
    expect(r.status).toBe(308);
    expect(r.headers.get("location")).toBe("https://ws.dgr8cali.co.uk/api/plan?x=1");
  });
});
