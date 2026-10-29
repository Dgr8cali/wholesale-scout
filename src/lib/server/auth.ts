import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db, must } from "./db";

/**
 * Sign-in: passkeys (WebAuthn) first, an emailed link as the backup, sessions per device in
 * auth_sessions (90 days, sliding), and per-device API tokens for the Chrome extension. Only the
 * addresses in AUTH_ALLOWED_EMAILS can sign in; there's no sign-up.
 *
 * APP_PASSWORD is the emergency fallback, off unless AUTH_PASSWORD_FALLBACK=1, except that /login
 * offers it while no passkey exists yet (to add the first one).
 */

export const SESSION_COOKIE = "ws_session";
export const SESSION_DAYS = 90;
const DAY = 86_400_000;
/** A session's expiry moves on at most this often (one write an hour per device, not per request). */
const SLIDE_EVERY_MS = 60 * 60_000;
/** Sessions and tokens are re-read at most this often; signing out clears the cache at once. */
const CACHE_MS = 60_000;

const iso = (ms: number) => new Date(ms).toISOString();
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const randomToken = () => randomBytes(32).toString("base64url");

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/* ===================== who may sign in ===================== */

export const allowedEmails = () => (process.env.AUTH_ALLOWED_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
export const isAllowed = (email: string | null | undefined) => !!email && allowedEmails().includes(email.trim().toLowerCase());
/** The account a passkey or the app password signs in to: the first allowed address. */
export const ownerEmail = () => allowedEmails()[0] ?? null;
/** APP_PASSWORD accepted everywhere (headers and /login): emergency use only. */
export const passwordFallbackOn = () => process.env.AUTH_PASSWORD_FALLBACK === "1" && !!process.env.APP_PASSWORD;

/* ===================== sessions ===================== */

export interface Session {
  id: string; email: string; method: "passkey" | "email" | "password"; passkey_id: string | null;
  user_agent: string | null; ip: string | null; created_at: string; last_seen_at: string; expires_at: string; revoked_at: string | null;
}
const SESSION_COLS = "id, email, method, passkey_id, user_agent, ip, created_at, last_seen_at, expires_at, revoked_at";

// On globalThis: the proxy and the route handlers are bundled apart, each with its own copy of this
// module, and signing out (a route) has to clear the cache the proxy reads.
const cache = ((globalThis as { __wsAuthCache?: { sessions: Map<string, { s: Session | null; at: number }>; tokens: Map<string, { t: ApiToken | null; at: number }> } }).__wsAuthCache ??= { sessions: new Map(), tokens: new Map() });
const { sessions, tokens } = cache;
export function clearAuthCache() { sessions.clear(); tokens.clear(); }

/** Start a session; returns the cookie's token (shown to nobody, stored as its hash). */
export async function createSession(email: string, method: Session["method"], meta: { passkeyId?: string | null; userAgent?: string | null; ip?: string | null }, now = Date.now()): Promise<string> {
  const token = randomToken();
  must(await db().from("auth_sessions").insert({
    token_hash: sha256(token), email: email.toLowerCase(), method, passkey_id: meta.passkeyId ?? null,
    user_agent: meta.userAgent?.slice(0, 300) ?? null, ip: meta.ip ?? null, last_seen_at: iso(now), expires_at: iso(now + SESSION_DAYS * DAY),
  }), "start session");
  return token;
}

/**
 * The live session for a cookie token, else null (unknown, signed out, expired, or its address no
 * longer allowed). `slid`: its expiry just moved on, so the cookie should be set again.
 */
export async function sessionFor(token: string | undefined | null, now = Date.now()): Promise<{ session: Session; slid: boolean } | null> {
  if (!token) return null;
  const h = sha256(token);
  const hit = sessions.get(h);
  let s = hit && now - hit.at < CACHE_MS ? hit.s : undefined;
  if (s === undefined) {
    s = must(await db().from("auth_sessions").select(SESSION_COLS).eq("token_hash", h).maybeSingle(), "session") as Session | null;
    if (sessions.size > 1_000) sessions.clear();
    sessions.set(h, { s, at: now });
  }
  if (!s || s.revoked_at || Date.parse(s.expires_at) <= now || !isAllowed(s.email)) return null;
  if (now - Date.parse(s.last_seen_at) < SLIDE_EVERY_MS) return { session: s, slid: false };
  const patch = { last_seen_at: iso(now), expires_at: iso(now + SESSION_DAYS * DAY) };
  Object.assign(s, patch);
  await db().from("auth_sessions").update(patch).eq("id", s.id);
  return { session: s, slid: true };
}

export async function listSessions(now = Date.now()) {
  const rows = must(await db().from("auth_sessions").select(SESSION_COLS).is("revoked_at", null).gt("expires_at", iso(now)).order("last_seen_at", { ascending: false }), "sessions") as Session[];
  return rows;
}

/** Sign one device out (`id`), or every device. */
export async function revokeSessions(id?: string, now = Date.now()) {
  const q = db().from("auth_sessions").update({ revoked_at: iso(now) }).is("revoked_at", null);
  must(await (id ? q.eq("id", id) : q), "sign out");
  sessions.clear();
}

/* ===================== API tokens (the extension) ===================== */

export interface ApiToken { id: string; name: string; prefix: string; scope: "extension"; created_at: string; last_used_at: string | null; last_ip: string | null; revoked_at: string | null }
const TOKEN_COLS = "id, name, prefix, scope, created_at, last_used_at, last_ip, revoked_at";
export const TOKEN_PREFIX = "wst_";

/** The endpoints the Chrome extension calls: the only ones an extension token opens. */
export function isExtensionPath(path: string) {
  return path.startsWith("/api/extension/") || path === "/api/pl/poe" || path.startsWith("/api/pl/poe/")
    || path === "/api/pl/reviews/capture" || path === "/api/pl/suppliers/capture" || path === "/api/ads/ranks";
}

/** A new token: the whole value is returned once, here; only its hash is kept. */
export async function createApiToken(name: string): Promise<{ token: string; row: ApiToken }> {
  const token = TOKEN_PREFIX + randomToken();
  const row = must(await db().from("api_tokens").insert({ name: name.trim().slice(0, 80) || "Chrome extension", token_hash: sha256(token), prefix: token.slice(0, 10), scope: "extension" }).select(TOKEN_COLS).single(), "create token") as ApiToken;
  return { token, row };
}

/** The live token for a bearer value on this path, else null (unknown, revoked, or out of scope). */
export async function tokenFor(token: string, path: string, ip: string | null, now = Date.now()): Promise<ApiToken | null> {
  if (!token.startsWith(TOKEN_PREFIX) || !isExtensionPath(path)) return null;
  const h = sha256(token);
  const hit = tokens.get(h);
  let t = hit && now - hit.at < CACHE_MS ? hit.t : undefined;
  if (t === undefined) {
    t = must(await db().from("api_tokens").select(TOKEN_COLS).eq("token_hash", h).maybeSingle(), "token") as ApiToken | null;
    if (tokens.size > 1_000) tokens.clear();
    tokens.set(h, { t, at: now });
  }
  if (!t || t.revoked_at) return null;
  if (!t.last_used_at || now - Date.parse(t.last_used_at) > SLIDE_EVERY_MS) {
    t.last_used_at = iso(now);
    t.last_ip = ip;
    await db().from("api_tokens").update({ last_used_at: t.last_used_at, last_ip: ip }).eq("id", t.id);
  }
  return t;
}

export async function listApiTokens() {
  return must(await db().from("api_tokens").select(TOKEN_COLS).is("revoked_at", null).order("created_at", { ascending: false }), "tokens") as ApiToken[];
}

export async function revokeApiToken(id: string, now = Date.now()) {
  must(await db().from("api_tokens").update({ revoked_at: iso(now) }).eq("id", id), "revoke token");
  tokens.clear();
}

/* ===================== WebAuthn challenges ===================== */

export async function saveChallenge(kind: "register" | "login", challenge: string, email: string | null, now = Date.now()): Promise<string> {
  // Old ones go as new ones come (they're only good for five minutes).
  await db().from("auth_challenges").delete().lt("expires_at", iso(now));
  const row = must(await db().from("auth_challenges").insert({ kind, challenge, email, expires_at: iso(now + 5 * 60_000) }).select("id").single(), "challenge") as { id: string };
  return row.id;
}

/** The challenge, once: it's deleted as it's read. */
export async function takeChallenge(id: string | undefined, kind: "register" | "login", now = Date.now()): Promise<{ challenge: string; email: string | null } | null> {
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const row = must(await db().from("auth_challenges").select("id, kind, challenge, email, expires_at").eq("id", id).maybeSingle(), "challenge") as { kind: string; challenge: string; email: string | null; expires_at: string } | null;
  if (!row) return null;
  await db().from("auth_challenges").delete().eq("id", id);
  return row.kind === kind && Date.parse(row.expires_at) > now ? { challenge: row.challenge, email: row.email } : null;
}

/* ===================== emailed sign-in links ===================== */

export const EMAIL_LINK_MINUTES = 15;

export async function createEmailLink(email: string, ip: string | null, now = Date.now()): Promise<string> {
  const token = randomToken();
  must(await db().from("auth_email_links").insert({ token_hash: sha256(token), email: email.toLowerCase(), ip, expires_at: iso(now + EMAIL_LINK_MINUTES * 60_000) }), "sign-in link");
  return token;
}

/** The address a link signs in, once (it's marked used), else null. */
export async function consumeEmailLink(token: string, now = Date.now()): Promise<string | null> {
  const row = must(await db().from("auth_email_links").select("id, email, expires_at, used_at").eq("token_hash", sha256(token)).maybeSingle(), "sign-in link") as { id: string; email: string; expires_at: string; used_at: string | null } | null;
  if (!row || row.used_at || Date.parse(row.expires_at) <= now || !isAllowed(row.email)) return null;
  must(await db().from("auth_email_links").update({ used_at: iso(now) }).eq("id", row.id), "use sign-in link");
  return row.email;
}

/* ===================== passkeys ===================== */

export interface Passkey { id: string; email: string; credential_id: string; public_key: string; counter: number; transports: string[]; device_type: string | null; backed_up: boolean | null; name: string; created_at: string; last_used_at: string | null }

export async function listPasskeys() {
  return must(await db().from("auth_passkeys").select("id, email, credential_id, public_key, counter, transports, device_type, backed_up, name, created_at, last_used_at").order("created_at"), "passkeys") as Passkey[];
}

export async function hasPasskey() {
  const r = must(await db().from("auth_passkeys").select("id").limit(1), "passkeys") as unknown[];
  return r.length > 0;
}

/** A name for a passkey from the browser that made it: "Mac", "iPhone", "Windows"… */
export function deviceName(ua: string | null | undefined): string {
  const u = ua ?? "";
  if (/iPhone/.test(u)) return "iPhone";
  if (/iPad/.test(u)) return "iPad";
  if (/Android/.test(u)) return "Android";
  if (/Macintosh|Mac OS X/.test(u)) return "Mac";
  if (/Windows/.test(u)) return "Windows";
  if (/Linux/.test(u)) return "Linux";
  return "Passkey";
}

/** "Chrome on Mac", for the device list. */
export function browserName(ua: string | null | undefined): string {
  const u = ua ?? "";
  const b = /Edg\//.test(u) ? "Edge" : /Firefox\//.test(u) ? "Firefox" : /Chrome\//.test(u) ? "Chrome" : /Safari\//.test(u) ? "Safari" : null;
  return [b, deviceName(u) === "Passkey" ? null : deviceName(u)].filter(Boolean).join(" on ") || "Unknown browser";
}

/* ===================== the cookie ===================== */

/** The session cookie: httpOnly, SameSite=Lax (no cross-site posts carry it), Secure except on localhost. */
export function sessionCookie(token: string, host: string | null) {
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host ?? "");
  return { name: SESSION_COOKIE, value: token, httpOnly: true, sameSite: "lax" as const, secure: !local, path: "/", maxAge: SESSION_DAYS * 86_400 };
}
