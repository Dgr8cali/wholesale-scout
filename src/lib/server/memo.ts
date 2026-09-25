import "server-only";

/**
 * A value kept for a short while in this server instance (each serverless instance has its
 * own). Concurrent callers share one computation; `forget` drops it after a change.
 */
const store = new Map<string, { until: number; value: Promise<unknown> }>();

export function memo<T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.until > Date.now()) return hit.value as Promise<T>;
  const value = compute();
  store.set(key, { until: Date.now() + ttlMs, value });
  // A failure isn't kept.
  value.catch(() => store.delete(key));
  return value;
}

/** Drop cached values whose key starts with this. */
export function forget(prefix: string) {
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}
