import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __setDbForTests } from "./lib/server/db";
import { proxy } from "./proxy";

// Wrong passwords are counted in the database: a stand-in that blocks at 10.
const failures = new Map<string, number>();
const blockedUntil = new Map<string, string>();
const fakeDb = {
  rpc: async (_fn: string, a: { p_ip: string; p_max: number }) => {
    const n = (failures.get(a.p_ip) ?? 0) + 1;
    failures.set(a.p_ip, n);
    if (n >= a.p_max) blockedUntil.set(a.p_ip, new Date(Date.now() + 15 * 60_000).toISOString());
    return { data: blockedUntil.get(a.p_ip) ?? null, error: null };
  },
  from: () => ({ select: () => ({ gt: async () => ({ data: [...blockedUntil].map(([ip, b]) => ({ ip, blocked_until: b })), error: null }) }) }),
};

const req = (path: string, auth?: string, ip = "203.0.113.1") => new NextRequest(`https://app.test${path}`, { headers: { "x-forwarded-for": ip, ...(auth ? { authorization: auth } : {}) } });

describe("password gate", () => {
  beforeEach(() => { failures.clear(); blockedUntil.clear(); __setDbForTests(fakeDb); });
  afterEach(() => { delete process.env.CRON_SECRET; delete process.env.APP_PASSWORD; });

  it("lets Vercel Cron through with the CRON_SECRET, only on cron routes", async () => {
    process.env.APP_PASSWORD = "pw";
    process.env.CRON_SECRET = "s3cret";
    expect((await proxy(req("/api/cron/qogita", "Bearer s3cret"))).status).toBe(200);
    expect((await proxy(req("/api/cron/qogita", "Bearer wrong!"))).status).toBe(401);
    expect((await proxy(req("/api/runs", "Bearer s3cret"))).status).toBe(401);
    expect((await proxy(req("/api/runs", `Basic ${btoa("x:pw")}`))).status).toBe(200);
  });

  it("lets the watchdog through with its own secret", async () => {
    process.env.APP_PASSWORD = "pw";
    process.env.WATCHDOG_SECRET = "dog-secret";
    expect((await proxy(req("/api/cron/watchdog", "Bearer dog-secret"))).status).toBe(200);
    expect((await proxy(req("/api/runs", "Bearer dog-secret"))).status).toBe(401);
    delete process.env.WATCHDOG_SECRET;
  });

  it("never lets cron through when no CRON_SECRET is set", async () => {
    process.env.APP_PASSWORD = "pw";
    expect((await proxy(req("/api/cron/qogita", "Bearer "))).status).toBe(401);
  });

  it("takes the password as a bearer token, and lets the extension's preflight through", async () => {
    process.env.APP_PASSWORD = "pw";
    expect((await proxy(req("/api/extension/check?asin=B000000001", "Bearer pw"))).status).toBe(200);
    expect((await proxy(req("/api/extension/check?asin=B000000001", "Bearer nope"))).status).toBe(401);
    expect((await proxy(req("/api/extension/check"))).status).toBe(401);
    expect((await proxy(new NextRequest("https://app.test/api/extension/check", { method: "OPTIONS" }))).status).toBe(200);
    expect((await proxy(new NextRequest("https://app.test/api/runs", { method: "OPTIONS" }))).status).toBe(401);
  });

  it("blocks an address after 10 wrong passwords, even with the right one; others unaffected", async () => {
    process.env.APP_PASSWORD = "pw";
    // No password at all (a browser's first request) isn't a failure.
    for (let i = 0; i < 20; i++) expect((await proxy(req("/", undefined, "198.51.100.7"))).status).toBe(401);
    for (let i = 0; i < 9; i++) expect((await proxy(req("/", `Basic ${btoa("x:guess" + i)}`, "198.51.100.7"))).status).toBe(401);
    expect((await proxy(req("/", `Basic ${btoa("x:guess9")}`, "198.51.100.7"))).status).toBe(429);
    const r = await proxy(req("/", `Basic ${btoa("x:pw")}`, "198.51.100.7"));
    expect(r.status).toBe(429);
    expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await proxy(req("/", `Basic ${btoa("x:pw")}`, "198.51.100.8"))).status).toBe(200);
  });

  it("limits the extension API per address", async () => {
    process.env.APP_PASSWORD = "pw";
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await proxy(req("/api/extension/check?asin=B000000001", "Bearer pw", "192.0.2.50"))).status;
    expect(last).toBe(429);
    expect((await proxy(req("/api/extension/ping", "Bearer pw", "192.0.2.50"))).status).toBe(200);
    expect((await proxy(req("/api/extension/check?asin=B000000001", "Bearer pw", "192.0.2.51"))).status).toBe(200);
  });
});
