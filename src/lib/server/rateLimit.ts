import "server-only";

/**
 * Rate limits, counted in this instance's memory (the app runs as one container):
 *
 * - Sign-in attempts (a passkey, an email link asked for or used, the fallback password): 10 per
 *   10 minutes per IP.
 * - The extension API: requests per IP per minute.
 */

export const LOGIN_LIMIT = { max: 10, windowMs: 10 * 60_000 };

/** A fixed window per key (one minute unless given), in memory. */
const hits = new Map<string, { windowStart: number; count: number; windowMs: number }>();
export function overLimit(key: string, perWindow: number, now = Date.now(), windowMs = 60_000): { over: boolean; retryAfterS: number } {
  const h = hits.get(key);
  if (!h || now - h.windowStart >= h.windowMs) {
    hits.set(key, { windowStart: now, count: 1, windowMs });
    if (hits.size > 5_000) for (const [k, v] of hits) if (now - v.windowStart >= v.windowMs) hits.delete(k);
    return { over: false, retryAfterS: 0 };
  }
  h.count++;
  return { over: h.count > perWindow, retryAfterS: Math.ceil((h.windowStart + h.windowMs - now) / 1000) };
}

/** Count a sign-in attempt from this IP; `over` once it's past LOGIN_LIMIT. */
export const loginAttempt = (ip: string, now = Date.now()) => overLimit(`login:${ip}`, LOGIN_LIMIT.max, now, LOGIN_LIMIT.windowMs);

/** Requests a minute per IP on the extension API: a check can spend Keepa tokens. */
export const EXTENSION_LIMITS = { check: 60, other: 120 };

/** The caller's IP, as Vercel passes it. */
export const clientIp = (h: Headers) => (h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown");
