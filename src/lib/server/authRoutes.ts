import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { createSession, SESSION_COOKIE, sessionCookie, sessionFor, type Session } from "./auth";
import { AuthError } from "./passkeys";
import { clientIp, loginAttempt } from "./rateLimit";

/** The WebAuthn challenge's id, for the five minutes between options and verify. */
export const CHALLENGE_COOKIE = "ws_challenge";
export const challengeCookie = (id: string, host: string | null) => ({ name: CHALLENGE_COOKIE, value: id, httpOnly: true, sameSite: "strict" as const, secure: !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host ?? ""), path: "/api/auth", maxAge: 300 });

/** A 429 once this IP has made 10 sign-in attempts in 10 minutes, else null (and the attempt counts). */
export function limited(req: NextRequest): Response | null {
  const r = loginAttempt(clientIp(req.headers));
  if (!r.over) return null;
  return Response.json({ error: `Too many sign-in attempts from this address: try again in ${Math.ceil(r.retryAfterS / 60)} minutes.` }, { status: 429, headers: { "Retry-After": String(r.retryAfterS) } });
}

/** Start a session for this device and set its cookie. */
export async function signedIn(req: NextRequest, email: string, method: Session["method"], passkeyId: string | null = null) {
  const token = await createSession(email, method, { passkeyId, userAgent: req.headers.get("user-agent"), ip: clientIp(req.headers) });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(sessionCookie(token, req.headers.get("host")));
  res.cookies.delete({ name: CHALLENGE_COOKIE, path: "/api/auth" });
  return res;
}

/** This request's session (the proxy has let it in; it may also have come with the fallback password). */
export async function currentSession(req: NextRequest) {
  return (await sessionFor(req.cookies.get(SESSION_COOKIE)?.value))?.session ?? null;
}

/** A refusal the user can act on (400 or 401), else rethrown for handle()'s 500. */
export function refused(e: unknown, status = 401) {
  if (e instanceof AuthError) return Response.json({ error: e.message }, { status });
  throw e;
}
