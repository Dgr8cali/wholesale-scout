import "server-only";

/**
 * Rate limits for the proxy.
 *
 * - Wrong passwords: counted per IP in the database (auth_failures); 10 in 15 minutes blocks
 *   the IP for 15 minutes, on every instance (each re-reads the blocked list at most every 10 s,
 *   so a normal request costs no query).
 * - The extension API: requests per IP per minute, counted in this instance's memory.
 */

export const AUTH_MAX_FAILURES = 10;
const AUTH_WINDOW = "15 minutes";
const AUTH_BLOCK = "15 minutes";
const BLOCKLIST_TTL_MS = 10_000;

type Db = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>; from: (t: string) => { select: (c: string) => { gt: (c: string, v: string) => PromiseLike<{ data: unknown; error: unknown }> } } };

let blocked = new Map<string, number>();
let blockedRead = 0;
let reading: Promise<void> | null = null;

async function refreshBlocked(db: Db) {
  const res = await db.from("auth_failures").select("ip, blocked_until").gt("blocked_until", new Date().toISOString());
  if (!res.error && Array.isArray(res.data)) {
    blocked = new Map((res.data as { ip: string; blocked_until: string }[]).map((r) => [r.ip, Date.parse(r.blocked_until)]));
  }
  blockedRead = Date.now();
}

/** When this IP's block ends, if it's blocked. Fails open if the database can't be read. */
export async function authBlockedUntil(db: () => Db, ip: string, now = Date.now()): Promise<number | null> {
  if (now - blockedRead > BLOCKLIST_TTL_MS) {
    reading ??= refreshBlocked(db()).catch(() => { blockedRead = Date.now(); }).finally(() => { reading = null; });
    await reading;
  }
  const until = blocked.get(ip);
  return until && until > now ? until : null;
}

/** Count a wrong password; returns when the IP's block ends if this one tipped it over. */
export async function recordAuthFailure(db: () => Db, ip: string): Promise<number | null> {
  try {
    const res = await db().rpc("record_auth_failure", { p_ip: ip, p_max: AUTH_MAX_FAILURES, p_window: AUTH_WINDOW, p_block: AUTH_BLOCK });
    const until = typeof res.data === "string" ? Date.parse(res.data) : null;
    if (until && until > Date.now()) blocked.set(ip, until);
    return until;
  } catch {
    return null;
  }
}

/** A fixed one-minute window per key, in memory. */
const hits = new Map<string, { windowStart: number; count: number }>();
export function overLimit(key: string, perMinute: number, now = Date.now()): { over: boolean; retryAfterS: number } {
  const h = hits.get(key);
  if (!h || now - h.windowStart >= 60_000) {
    hits.set(key, { windowStart: now, count: 1 });
    if (hits.size > 5_000) for (const [k, v] of hits) if (now - v.windowStart >= 60_000) hits.delete(k);
    return { over: false, retryAfterS: 0 };
  }
  h.count++;
  return { over: h.count > perMinute, retryAfterS: Math.ceil((h.windowStart + 60_000 - now) / 1000) };
}

/** Requests a minute per IP on the extension API: a check can spend Keepa tokens. */
export const EXTENSION_LIMITS = { check: 60, other: 120 };

/** The caller's IP, as Vercel passes it. */
export const clientIp = (h: Headers) => (h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown");
