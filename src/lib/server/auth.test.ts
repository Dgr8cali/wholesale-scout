import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __setDbForTests } from "./db";
import { FakeDb } from "./fakeDb";

// The WebAuthn signature check itself is SimpleWebAuthn's (and its tests'); here it's stubbed so
// the app's rules around it can be tested: the challenge, the registered key, the allowlist.
vi.mock("@simplewebauthn/server", () => ({
  generateAuthenticationOptions: vi.fn(async () => ({ challenge: "chal-login", rpId: "ws.test" })),
  generateRegistrationOptions: vi.fn(async () => ({ challenge: "chal-reg" })),
  verifyAuthenticationResponse: vi.fn(async (o: { expectedChallenge: string; response: { id: string } }) => ({
    verified: o.expectedChallenge === "chal-login", authenticationInfo: { newCounter: 7, credentialBackedUp: true },
  })),
  verifyRegistrationResponse: vi.fn(async () => ({
    verified: true, registrationInfo: { credential: { id: "cred-2", publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: ["internal"] }, credentialDeviceType: "multiDevice", credentialBackedUp: true },
  })),
}));
const sent: { to?: string; text: string }[] = [];
vi.mock("./email", async (orig) => ({ ...(await orig<typeof import("./email")>()), sendEmail: vi.fn(async (m: { to?: string; text: string }) => { sent.push(m); return { sent: true }; }) }));

const { POST: password } = await import("@/app/api/auth/password/route");
const { POST: emailLink } = await import("@/app/api/auth/email/route");
const { POST: useLink } = await import("@/app/api/auth/email/verify/route");
const { POST: loginOptions } = await import("@/app/api/auth/login/options/route");
const { POST: loginVerify } = await import("@/app/api/auth/login/verify/route");
const { POST: addKey } = await import("@/app/api/auth/passkeys/route");
const { POST: addKeyOptions } = await import("@/app/api/auth/passkeys/options/route");
const { POST: newToken } = await import("@/app/api/auth/tokens/route");
const { GET: security } = await import("@/app/api/auth/security/route");
const { GET: state } = await import("@/app/api/auth/state/route");
const { clearAuthCache, sessionFor, sha256, deviceName, browserName } = await import("./auth");

let ipN = 0;
const post = (path: string, body: unknown, h: Record<string, string> = {}, ip = `198.51.100.${++ipN % 250}`) =>
  new NextRequest(`https://ws.test${path}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", "x-forwarded-for": ip, host: "ws.test", "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15", ...h } });
const get = (path: string, h: Record<string, string> = {}) => new NextRequest(`https://ws.test${path}`, { headers: { host: "ws.test", ...h } });
const sessionToken = (res: Response) => /ws_session=([^;]+)/.exec(res.headers.get("set-cookie") ?? "")?.[1] ?? null;
const challenge = (res: Response) => /ws_challenge=([^;]+)/.exec(res.headers.get("set-cookie") ?? "")![1];

describe("sign-in", () => {
  let db: FakeDb;
  beforeEach(() => {
    db = new FakeDb();
    __setDbForTests(db);
    clearAuthCache();
    sent.length = 0;
    process.env.AUTH_ALLOWED_EMAILS = "akin@dgr8cali.co.uk";
    process.env.APP_PASSWORD = "old-pw";
    process.env.RESEND_API_KEY = "re_test";
    process.env.APP_URL = "https://ws.test";
  });
  afterEach(() => {
    __setDbForTests(null);
    for (const k of ["AUTH_ALLOWED_EMAILS", "APP_PASSWORD", "AUTH_PASSWORD_FALLBACK", "RESEND_API_KEY", "APP_URL"]) delete process.env[k];
  });

  it("the app password signs in only until the first passkey exists (or with the fallback on)", async () => {
    expect((await password(post("/api/auth/password", { password: "nope" }))).status).toBe(401);
    const ok = await password(post("/api/auth/password", { password: "old-pw" }));
    expect(ok.status).toBe(200);
    const token = sessionToken(ok)!;
    expect((await sessionFor(token))?.session).toMatchObject({ email: "akin@dgr8cali.co.uk", method: "password" });
    // Only the token's hash is stored.
    expect(db.tables.auth_sessions[0].token_hash).toBe(sha256(token));
    expect(JSON.stringify(db.tables.auth_sessions)).not.toContain(token);

    db.tables.auth_passkeys = [{ id: "k1", email: "akin@dgr8cali.co.uk", credential_id: "cred-1", public_key: "AQID", counter: 0, transports: [], name: "Mac", created_at: "2026-10-29" }];
    expect((await password(post("/api/auth/password", { password: "old-pw" }))).status).toBe(403);
    expect(await (await state(get("/api/auth/state"))).json()).toMatchObject({ passkeys: true, password: false, email: true, ready: true, signedIn: false });
    process.env.AUTH_PASSWORD_FALLBACK = "1";
    expect((await password(post("/api/auth/password", { password: "old-pw" }))).status).toBe(200);
  });

  it("10 sign-in attempts per 10 minutes per address, then 429", async () => {
    const ip = "192.0.2.77";
    for (let i = 0; i < 10; i++) expect((await password(post("/api/auth/password", { password: `guess${i}` }, {}, ip))).status).toBe(401);
    const r = await password(post("/api/auth/password", { password: "old-pw" }, {}, ip));
    expect(r.status).toBe(429);
    expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(500);
    expect((await password(post("/api/auth/password", { password: "old-pw" }, {}, "192.0.2.78"))).status).toBe(200);
  });

  it("email links: only to an allowed address (same answer either way), once, for 15 minutes", async () => {
    const other = await (await emailLink(post("/api/auth/email", { email: "someone@else.example" }))).json();
    expect(sent).toEqual([]);
    expect(db.tables.auth_email_links ?? []).toEqual([]);
    const mine = await (await emailLink(post("/api/auth/email", { email: "Akin@dgr8cali.co.uk" }))).json();
    expect(mine.message.replace("akin@dgr8cali.co.uk", "X")).toBe(other.message.replace("someone@else.example", "X"));
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("akin@dgr8cali.co.uk");
    const token = /\/login\?link=([\w-]+)/.exec(sent[0].text)![1];

    const first = await useLink(post("/api/auth/email/verify", { token }));
    expect(first.status).toBe(200);
    expect((await sessionFor(sessionToken(first)))?.session.method).toBe("email");
    expect((await useLink(post("/api/auth/email/verify", { token }))).status).toBe(401);

    await emailLink(post("/api/auth/email", { email: "akin@dgr8cali.co.uk" }));
    const late = /\/login\?link=([\w-]+)/.exec(sent[1].text)![1];
    db.tables.auth_email_links.at(-1)!.expires_at = new Date(Date.now() - 1000).toISOString();
    expect((await useLink(post("/api/auth/email/verify", { token: late }))).status).toBe(401);
  });

  it("no email sender set up: says so, and the passkey still works", async () => {
    delete process.env.RESEND_API_KEY;
    const r = await emailLink(post("/api/auth/email", { email: "akin@dgr8cali.co.uk" }));
    expect(r.status).toBe(503);
    expect((await r.json()).error).toMatch(/isn't set up/);
  });

  it("a passkey signs in: its challenge once, a registered key, an allowed account", async () => {
    db.tables.auth_passkeys = [{ id: "k1", email: "akin@dgr8cali.co.uk", credential_id: "cred-1", public_key: "AQID", counter: 0, transports: [], name: "Mac", created_at: "2026-10-29" }];
    const opts = await loginOptions(post("/api/auth/login/options", {}));
    const chal = challenge(opts);
    const ok = await loginVerify(post("/api/auth/login/verify", { id: "cred-1", response: {} }, { cookie: `ws_challenge=${chal}` }));
    expect(ok.status).toBe(200);
    expect((await sessionFor(sessionToken(ok)))?.session).toMatchObject({ method: "passkey", passkey_id: "k1" });
    expect(db.tables.auth_passkeys[0]).toMatchObject({ counter: 7, backed_up: true });
    // The same challenge again: gone.
    expect((await loginVerify(post("/api/auth/login/verify", { id: "cred-1", response: {} }, { cookie: `ws_challenge=${chal}` }))).status).toBe(401);
    // A key that isn't registered.
    const c2 = challenge(await loginOptions(post("/api/auth/login/options", {})));
    const unknown = await loginVerify(post("/api/auth/login/verify", { id: "cred-x", response: {} }, { cookie: `ws_challenge=${c2}` }));
    expect(unknown.status).toBe(401);
    expect((await unknown.json()).error).toMatch(/isn't registered/);
    // The account taken off the allowlist.
    process.env.AUTH_ALLOWED_EMAILS = "someone@else.example";
    const c3 = challenge(await loginOptions(post("/api/auth/login/options", {})));
    expect((await loginVerify(post("/api/auth/login/verify", { id: "cred-1", response: {} }, { cookie: `ws_challenge=${c3}` }))).status).toBe(401);
  });

  it("adding a passkey: to the signed-in account, named after the device", async () => {
    const t = sessionToken(await password(post("/api/auth/password", { password: "old-pw" })))!;
    const chal = challenge(await addKeyOptions(post("/api/auth/passkeys/options", {}, { cookie: `ws_session=${t}` })));
    const r = await addKey(post("/api/auth/passkeys", { response: { id: "cred-2" } }, { cookie: `ws_session=${t}; ws_challenge=${chal}` }));
    expect(await r.json()).toMatchObject({ passkey: { name: "Mac" } });
    expect(db.tables.auth_passkeys[0]).toMatchObject({ email: "akin@dgr8cali.co.uk", credential_id: "cred-2", public_key: "AQID", device_type: "multiDevice" });
    expect(deviceName("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("iPhone");
    expect(browserName("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/141.0 Safari/537.36")).toBe("Chrome on Mac");
  });

  it("an API token is shown once; Security lists devices, passkeys and tokens without any secret", async () => {
    const t = sessionToken(await password(post("/api/auth/password", { password: "old-pw" })))!;
    const { token } = await (await newToken(post("/api/auth/tokens", { name: "Chrome on Mac" }))).json();
    expect(token).toMatch(/^wst_[\w-]{43}$/);
    expect(JSON.stringify(db.tables.api_tokens)).not.toContain(token);
    const s = await (await security(get("/api/auth/security", { cookie: `ws_session=${t}` }))).json();
    expect(s.sessions).toHaveLength(1);
    expect(s.sessions[0]).toMatchObject({ device: "Safari on Mac", method: "password", current: true });
    expect(s.tokens[0]).toMatchObject({ name: "Chrome on Mac", prefix: token.slice(0, 10) });
    const text = JSON.stringify(s);
    expect(text).not.toContain(token);
    expect(text).not.toContain(t);
    expect(text).not.toContain("token_hash");
  });
});
