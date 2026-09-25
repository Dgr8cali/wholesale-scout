import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/server/db";
import { authBlockedUntil, clientIp, EXTENSION_LIMITS, overLimit, recordAuthFailure } from "@/lib/server/rateLimit";

/**
 * Password gate until Supabase Auth lands. Set APP_PASSWORD in Vercel; the browser asks
 * once (any username). Without it, production refuses to serve, because the app can
 * call your seller account's SP-API.
 */
export async function proxy(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("Set APP_PASSWORD in the Vercel project to open Wholesale Scout.", { status: 503 });
    }
    return NextResponse.next();
  }
  const auth = req.headers.get("authorization") ?? "";
  // Vercel Cron can't send the password; it sends the CRON_SECRET as a bearer token instead.
  // The watchdog (Supabase pg_cron) uses its own WATCHDOG_SECRET the same way.
  if (req.nextUrl.pathname.startsWith("/api/cron/")) {
    for (const secret of [process.env.CRON_SECRET, process.env.WATCHDOG_SECRET]) {
      if (secret && auth.length === secret.length + 7 && timingSafeEqual(auth, `Bearer ${secret}`)) return NextResponse.next();
    }
  }
  // The extension's CORS preflight carries no credentials; the request that follows does.
  if (req.method === "OPTIONS" && req.nextUrl.pathname.startsWith("/api/extension/")) return NextResponse.next();

  // Too many wrong passwords from this address: refused for a while, even with the right one.
  const ip = clientIp(req.headers);
  const until = await authBlockedUntil(db, ip);
  if (until) return tooMany(until, "Too many wrong passwords from this address");

  const [scheme, encoded] = auth.split(" ");
  let ok = false;
  // Scripts and the extension may send the password as a bearer token.
  if (scheme === "Bearer" && encoded && encoded.length === password.length && timingSafeEqual(encoded, password)) ok = true;
  if (!ok && scheme === "Basic" && encoded) {
    let decoded = "";
    try { decoded = atob(encoded); } catch { /* not base64: a wrong password */ }
    const given = decoded.slice(decoded.indexOf(":") + 1);
    if (given.length === password.length && timingSafeEqual(given, password)) ok = true;
  }
  if (ok) {
    // The extension API, per address: a check can spend Keepa tokens.
    const path = req.nextUrl.pathname;
    if (path.startsWith("/api/extension/")) {
      const isCheck = path === "/api/extension/check";
      const r = overLimit(`ext:${isCheck ? "check" : "other"}:${ip}`, isCheck ? EXTENSION_LIMITS.check : EXTENSION_LIMITS.other);
      if (r.over) return tooMany(Date.now() + r.retryAfterS * 1000, "Too many requests from the extension");
    }
    return NextResponse.next();
  }
  // A password was given and it was wrong (no header at all is just the browser's first ask).
  if (auth) {
    const blockedUntil = await recordAuthFailure(db, ip);
    if (blockedUntil) return tooMany(blockedUntil, "Too many wrong passwords from this address");
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Wholesale Scout", charset="UTF-8"' },
  });
}

function tooMany(until: number, why: string) {
  const retry = Math.max(1, Math.ceil((until - Date.now()) / 1000));
  const at = new Date(until).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  return NextResponse.json({ error: `${why}: try again after ${at}.` }, {
    status: 429,
    headers: { "Retry-After": String(retry), "Access-Control-Allow-Origin": "*" },
  });
}

function timingSafeEqual(a: string, b: string) {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
