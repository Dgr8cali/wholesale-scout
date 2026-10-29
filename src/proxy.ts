import { NextResponse, type NextRequest } from "next/server";
import { movedTo } from "@/lib/moved";
import { passwordFallbackOn, safeEqual, SESSION_COOKIE, sessionCookie, sessionFor, tokenFor, isExtensionPath, allowedEmails } from "@/lib/server/auth";
import { clientIp, EXTENSION_LIMITS, loginAttempt, overLimit } from "@/lib/server/rateLimit";

/** Where the app lives (Netcup) since the 17 Oct 2026 cutover. */
export const APP_HOME = "https://ws.dgr8cali.co.uk";

/**
 * The old Vercel deployment still answers on *.vercel.app and talks to Supabase Cloud (kept as
 * the rollback): every request there is sent to the same path here, so it can't write to it.
 * vercel.json redirects first; this is the backstop.
 */
export function vercelRedirect(host: string | null, pathAndQuery: string): string | null {
  return host && /(^|\.)vercel\.app(:\d+)?$/i.test(host) ? `${APP_HOME}${pathAndQuery}` : null;
}

/** Open without signing in: the sign-in page and the calls it makes. */
export const PUBLIC_PATHS = new Set([
  "/login", "/api/auth/state", "/api/auth/login/options", "/api/auth/login/verify",
  "/api/auth/email", "/api/auth/email/verify", "/api/auth/password", "/api/auth/logout",
]);

/** Who the request is, for the routes (whoOf): set here only, never taken from the client. */
export const AUTH_HEADER = "x-ws-auth";

/**
 * The gate, on every page and API route (src/lib/server/auth.ts):
 * - the session cookie (a passkey, an emailed link, or the app password while no passkey exists);
 * - an extension API token (Bearer wst_…), on the extension's endpoints only;
 * - the server's CRON_SECRET (crontab, and the app's own background calls) and WATCHDOG_SECRET (cron only);
 * - APP_PASSWORD (Bearer, or Basic), only with AUTH_PASSWORD_FALLBACK=1.
 * Pages without a session go to /login; API calls get a 401 (no browser password prompt).
 */
export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const moved = vercelRedirect(req.headers.get("host"), path + req.nextUrl.search);
  if (moved) return NextResponse.redirect(moved, 308);
  // A page merged into another (src/lib/moved.ts): permanently to its new home and tab.
  const merged = movedTo(path, req.nextUrl.search);
  if (merged) return NextResponse.redirect(new URL(merged, req.nextUrl), 308);

  const pass = (who: string) => {
    const headers = new Headers(req.headers);
    headers.set(AUTH_HEADER, who);
    return NextResponse.next({ request: { headers } });
  };
  // Local development with no allowlist set: open, as before the gate.
  if (process.env.NODE_ENV !== "production" && !allowedEmails().length) return pass("you (local)");
  if (PUBLIC_PATHS.has(path)) return pass("signing in");
  // The extension's CORS preflight carries no credentials; the request that follows does.
  if (req.method === "OPTIONS" && isExtensionPath(path)) return pass("preflight");

  const ip = clientIp(req.headers);
  const auth = req.headers.get("authorization") ?? "";
  const [scheme, value] = auth.split(" ");
  const extensionLimit = () => {
    if (!isExtensionPath(path)) return null;
    // Per address: a check can spend Keepa tokens.
    const isCheck = path === "/api/extension/check";
    const r = overLimit(`ext:${isCheck ? "check" : "other"}:${ip}`, isCheck ? EXTENSION_LIMITS.check : EXTENSION_LIMITS.other);
    return r.over ? tooMany(Date.now() + r.retryAfterS * 1000, "Too many requests from the extension") : null;
  };

  if (scheme === "Bearer" && value) {
    // The server's crontab and the watchdog; the CRON_SECRET also carries the app's calls to itself.
    const cron = process.env.CRON_SECRET, dog = process.env.WATCHDOG_SECRET;
    if (path.startsWith("/api/cron/") && ((cron && safeEqual(value, cron)) || (dog && safeEqual(value, dog)))) return pass("cron");
    if (path.startsWith("/api/") && !path.startsWith("/api/auth/") && cron && safeEqual(value, cron)) return pass("the app (background)");
    if (value.startsWith("wst_")) {
      let token;
      try { token = await tokenFor(value, path, ip); } catch { return unavailable(); }
      if (!token) return NextResponse.json({ error: isExtensionPath(path) ? "This token isn't valid: create a new one in Settings → Security." : "An extension token only opens the extension's endpoints." }, { status: 401, headers: CORS });
      return extensionLimit() ?? pass(`extension token "${token.name}"`);
    }
  }
  if (passwordFallbackOn() && (scheme === "Bearer" || scheme === "Basic") && value) {
    let given = value;
    if (scheme === "Basic") {
      try { const d = atob(value); given = d.slice(d.indexOf(":") + 1); } catch { given = ""; }
    }
    if (safeEqual(given, process.env.APP_PASSWORD!)) return extensionLimit() ?? pass("app password (fallback)");
    const r = loginAttempt(ip);
    if (r.over) return tooMany(Date.now() + r.retryAfterS * 1000, "Too many sign-in attempts from this address");
  }

  let live;
  try { live = await sessionFor(req.cookies.get(SESSION_COOKIE)?.value); } catch { return unavailable(); }
  if (live) {
    const res = pass(`you (${live.session.method === "passkey" ? "passkey" : live.session.method === "email" ? "email link" : "app password"})`);
    // Sliding: the cookie's 90 days start again with the session's.
    if (live.slid) res.cookies.set(sessionCookie(req.cookies.get(SESSION_COOKIE)!.value, req.headers.get("host")));
    return res;
  }
  if (path.startsWith("/api/")) return NextResponse.json({ error: "Sign in to Wholesale Scout first." }, { status: 401, headers: isExtensionPath(path) ? CORS : undefined });
  if (req.method === "GET" || req.method === "HEAD") {
    const to = new URL("/login", req.nextUrl);
    if (path !== "/") to.searchParams.set("next", path + req.nextUrl.search);
    return NextResponse.redirect(to, 307);
  }
  return new NextResponse("Sign in to Wholesale Scout first.", { status: 401 });
}

const CORS = { "Access-Control-Allow-Origin": "*" };

function tooMany(until: number, why: string) {
  const retry = Math.max(1, Math.ceil((until - Date.now()) / 1000));
  const at = new Date(until).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  return NextResponse.json({ error: `${why}: try again after ${at}.` }, { status: 429, headers: { "Retry-After": String(retry), ...CORS } });
}

const unavailable = () => NextResponse.json({ error: "Couldn't check the sign-in (the database didn't answer). Try again in a moment." }, { status: 503 });

// The logo, icons and web manifest are served without signing in: browsers fetch the manifest
// without credentials, and they're only the public mark.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon\\.svg|apple-icon\\.png|icon-192\\.png|icon-512\\.png|logo\\.svg|manifest\\.webmanifest).*)"],
};
