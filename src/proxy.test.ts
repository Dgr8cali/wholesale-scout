import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { proxy } from "./proxy";

const req = (path: string, auth?: string) => new NextRequest(`https://app.test${path}`, { headers: auth ? { authorization: auth } : {} });

describe("password gate", () => {
  afterEach(() => { delete process.env.CRON_SECRET; delete process.env.APP_PASSWORD; });

  it("lets Vercel Cron through with the CRON_SECRET, only on cron routes", () => {
    process.env.APP_PASSWORD = "pw";
    process.env.CRON_SECRET = "s3cret";
    expect(proxy(req("/api/cron/qogita", "Bearer s3cret")).status).toBe(200);
    expect(proxy(req("/api/cron/qogita", "Bearer wrong!")).status).toBe(401);
    expect(proxy(req("/api/runs", "Bearer s3cret")).status).toBe(401);
    expect(proxy(req("/api/runs", `Basic ${btoa("x:pw")}`)).status).toBe(200);
  });

  it("never lets cron through when no CRON_SECRET is set", () => {
    process.env.APP_PASSWORD = "pw";
    expect(proxy(req("/api/cron/qogita", "Bearer ")).status).toBe(401);
  });
});
