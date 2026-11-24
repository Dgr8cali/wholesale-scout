import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const saved: string[] = [];
vi.mock("@/lib/server/adsConnection", () => ({ saveRefreshToken: async (t: string) => { saved.push(t); } }));

import { GET as callback } from "@/app/api/ads/callback/route";
import { GET as connect } from "@/app/api/ads/connect/route";
import { checkState, publicOrigin, settingsUrl } from "./client";

const PUBLIC = "https://ws.dgr8cali.co.uk";
const ENV = { ADS_CLIENT_ID: "cid", ADS_CLIENT_SECRET: "csecret-value", ADS_REDIRECT_URI: `${PUBLIC}/api/ads/callback` };
// Inside the container the request URL is built from HOSTNAME=0.0.0.0, PORT=3000, whatever the Host header says.
const INTERNAL = "http://0.0.0.0:3000";

/** The cookie a browser keeps from a Set-Cookie header, and whether it sends it on a cross-site top-level GET to `url`. */
function jarFrom(setCookie: string, origin: string) {
  const [pair, ...attrs] = setCookie.split(";").map((x) => x.trim());
  const a = Object.fromEntries(attrs.map((x) => { const [k, v] = x.split("="); return [k.toLowerCase(), v ?? true]; })) as Record<string, string | boolean>;
  return {
    attrs: a,
    sentOnCrossSiteGet(url: string) {
      const u = new URL(url);
      if (String(a.samesite).toLowerCase() === "strict") return null; // Strict is withheld on any cross-site navigation
      if (a.domain) return null; // ours is host-only
      if (a.secure && u.protocol !== "https:") return null;
      if (u.origin !== origin) return null; // host-only: the same host that set it
      const path = String(a.path ?? "/");
      if (!(u.pathname === path || u.pathname.startsWith(path.endsWith("/") ? path : `${path}/`))) return null;
      return pair;
    },
  };
}
const setCookieOf = (res: Response) => res.headers.getSetCookie().find((c) => c.startsWith("ads_oauth_state=")) ?? "";
const req = (path: string, cookie?: string) => new NextRequest(`${INTERNAL}${path}`, { headers: { host: "ws.dgr8cali.co.uk", ...(cookie ? { cookie } : {}) } });
const stateOf = (res: Response) => new URL(res.headers.get("location")!).searchParams.get("state")!;

describe("public origin", () => {
  it("comes from ADS_REDIRECT_URI, with the site as the default", () => {
    expect(publicOrigin({ ADS_REDIRECT_URI: "https://example.test/api/ads/callback" } as unknown as NodeJS.ProcessEnv)).toBe("https://example.test");
    expect(publicOrigin({} as NodeJS.ProcessEnv)).toBe(PUBLIC);
    expect(publicOrigin({ ADS_REDIRECT_URI: "not a url" } as unknown as NodeJS.ProcessEnv)).toBe(PUBLIC);
    expect(settingsUrl("ads_connected=1", {} as NodeJS.ProcessEnv)).toBe(`${PUBLIC}/settings?tab=amazon-ads&ads_connected=1`);
  });
});

describe("Amazon Ads connect and callback", () => {
  beforeEach(() => { Object.assign(process.env, ENV); saved.length = 0; vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ access_token: "A", refresh_token: "R-token", expires_in: 3600 }), { status: 200 }))); });
  afterEach(() => { for (const k of Object.keys(ENV)) delete process.env[k]; vi.unstubAllGlobals(); });

  it("redirects every outcome to the public origin, never the container's address", async () => {
    const start = await connect();
    const state = stateOf(start);
    const outcomes = [
      await callback(req("/api/ads/callback?code=c&state=wrong", `ads_oauth_state=${state}`)), // mismatch
      await callback(req("/api/ads/callback?code=c&state=x")), // no cookie
      await callback(req("/api/ads/callback?error=access_denied", `ads_oauth_state=${state}`)), // Amazon refused
      await callback(req("/api/ads/callback?code=c&state=" + state, `ads_oauth_state=${state}`)), // success
    ];
    for (const r of outcomes) {
      expect(r.status).toBe(307);
      expect(r.headers.get("location")).toMatch(new RegExp(`^${PUBLIC}/settings\\?tab=amazon-ads&`));
      expect(r.headers.get("location")).not.toContain("0.0.0.0");
    }
    delete process.env.ADS_CLIENT_ID; delete process.env.ADS_CLIENT_SECRET;
    const unconfigured = await connect();
    expect(unconfigured.headers.get("location")).toBe(`${PUBLIC}/settings?tab=amazon-ads&ads_error=not_configured`);
  });

  it("sends the browser to Amazon's Europe consent page with the state and the public return URL", async () => {
    const res = await connect();
    const u = new URL(res.headers.get("location")!);
    expect(u.origin + u.pathname).toBe("https://eu.account.amazon.com/ap/oa");
    expect(u.searchParams.get("redirect_uri")).toBe(`${PUBLIC}/api/ads/callback`);
    expect(u.searchParams.get("state")).toMatch(/^[0-9a-f]{48}$/);
    expect(res.headers.get("location")).not.toContain("csecret-value");
  });

  it("keeps the state cookie across Amazon's cross-site return (SameSite=Lax, Path covers the callback, host-only, Secure on https)", async () => {
    const start = await connect();
    const state = stateOf(start);
    const jar = jarFrom(setCookieOf(start), PUBLIC);
    expect(jar.attrs).toMatchObject({ httponly: true, secure: true, path: "/api/ads", "max-age": "600" });
    expect(String(jar.attrs.samesite).toLowerCase()).toBe("lax");
    expect(jar.attrs.domain).toBeUndefined();
    const sent = jar.sentOnCrossSiteGet(`${PUBLIC}/api/ads/callback?code=c&state=${state}`);
    expect(sent).toBe(`ads_oauth_state=${state}`); // the browser sends it
    const res = await callback(req(`/api/ads/callback?code=c&state=${state}`, sent!));
    expect(res.headers.get("location")).toBe(`${PUBLIC}/settings?tab=amazon-ads&ads_connected=1`);
    expect(saved).toEqual(["R-token"]);
  });

  it("a Strict cookie would not have survived: the check the test above relies on", () => {
    expect(jarFrom("ads_oauth_state=x; Path=/api/ads; SameSite=Strict; Secure", PUBLIC).sentOnCrossSiteGet(`${PUBLIC}/api/ads/callback`)).toBeNull();
  });

  it("rejects a wrong state, with no token stored and no call to Amazon", async () => {
    const state = stateOf(await connect());
    const res = await callback(req("/api/ads/callback?code=c&state=" + "0".repeat(48), `ads_oauth_state=${state}`));
    expect(res.headers.get("location")).toBe(`${PUBLIC}/settings?tab=amazon-ads&ads_error=state_mismatch`);
    expect(saved).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("says so when the cookie never came back, and rejects a missing state or code", async () => {
    const none = await callback(req("/api/ads/callback?code=c&state=abc"));
    expect(none.headers.get("location")).toContain("ads_error=state_cookie_missing");
    const noState = await callback(req("/api/ads/callback?code=c", "ads_oauth_state=abc"));
    expect(noState.headers.get("location")).toContain("ads_error=state_mismatch");
    const noCode = await callback(req("/api/ads/callback?state=abc", "ads_oauth_state=abc"));
    expect(noCode.headers.get("location")).toContain("ads_error=state_mismatch");
    expect(saved).toEqual([]);
  });

  it("is single-use: every outcome clears the state cookie, so a repeat has nothing to match", async () => {
    const state = stateOf(await connect());
    const first = await callback(req(`/api/ads/callback?code=c&state=${state}`, `ads_oauth_state=${state}`));
    const cleared = first.headers.getSetCookie().find((c) => c.startsWith("ads_oauth_state="))!;
    expect(cleared).toMatch(/^ads_oauth_state=;/);
    expect(cleared.toLowerCase()).toContain("max-age=0");
    // The browser dropped it: replaying the same return (no cookie) is refused.
    const replay = await callback(req(`/api/ads/callback?code=c&state=${state}`));
    expect(replay.headers.get("location")).toContain("ads_error=state_cookie_missing");
    expect(saved).toEqual(["R-token"]);
  });

  it("is not Secure when the public origin is plain http (local development)", async () => {
    process.env.ADS_REDIRECT_URI = "http://localhost:3000/api/ads/callback";
    const res = await connect();
    expect(setCookieOf(res).toLowerCase()).not.toContain("secure");
  });
});

describe("checkState", () => {
  const eq = (a: string, b: string) => a === b;
  it("names why a state is refused", () => {
    expect(checkState("a", "a", eq)).toBe("ok");
    expect(checkState("a", "b", eq)).toBe("mismatch");
    expect(checkState(undefined, "a", eq)).toBe("no_cookie");
    expect(checkState("", "a", eq)).toBe("no_cookie");
    expect(checkState("a", null, eq)).toBe("no_state");
    expect(checkState("a", " a", eq)).toBe("mismatch"); // no trimming
  });
});
