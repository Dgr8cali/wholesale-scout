/** Browser helpers: JSON fetch with readable errors, and number formatting. */
export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.json !== undefined ? { "content-type": "application/json" } : {}), ...init?.headers },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `${res.status} ${res.statusText}`);
  return body as T;
}

/**
 * A GET shared by everything on the page that asks within `maxAgeMs` (e.g. the Keepa balance,
 * shown in the top bar and on Home): one request, one answer.
 */
const shared = new Map<string, { at: number; value: Promise<unknown> }>();
export function sharedGet<T>(url: string, maxAgeMs = 10_000): Promise<T> {
  const hit = shared.get(url);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.value as Promise<T>;
  const value = api<T>(url);
  shared.set(url, { at: Date.now(), value });
  value.catch(() => shared.delete(url));
  return value;
}

export const gbp = (n: number | null | undefined, dp = 2) =>
  n == null ? "—" : `£${Number(n).toLocaleString("en-GB", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;

export const pct = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(Number(n))}%`);

export const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
