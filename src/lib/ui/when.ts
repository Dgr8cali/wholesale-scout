/** Times as the app shows them: "2 h ago", "25 Sept 21:14", UK time. */

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
/** A stock reading older than this is shown as stale. */
export const STOCK_STALE_MS = 7 * DAY;

export function ago(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null;
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  if (ms < MIN) return "just now";
  if (ms < HOUR) return `${Math.floor(ms / MIN)} min ago`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)} h ago`;
  const d = Math.floor(ms / DAY);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

/** "25 Sept 21:14" (the year too when it isn't this year). */
export function stamp(iso: string, now = Date.now()): string {
  const t = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", timeZone: "Europe/London" };
  if (t.getUTCFullYear() !== new Date(now).getUTCFullYear()) opts.year = "numeric";
  const time = t.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  return `${t.toLocaleDateString("en-GB", opts)} ${time}`;
}

export const isStale = (iso: string, now = Date.now()) => now - new Date(iso).getTime() > STOCK_STALE_MS;

/** "12 Sept 2026": a date without the time. */
export const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });

/**
 * When Amazon last held an offer: Keepa's date, else worked out from the days before the check
 * (snapshots from before the date was kept), with how long ago that is now.
 */
export function amazonLastSeen(days: number | null | undefined, at: string | null | undefined, checkedAt: string | null | undefined, now = Date.now()): { at: string; label: string } | null {
  const when = at ?? (days != null && checkedAt ? new Date(new Date(checkedAt).getTime() - days * DAY).toISOString() : null);
  if (!when) return days != null ? { at: "", label: `last seen ${days} days ago` } : null;
  const n = Math.max(0, Math.floor((now - new Date(when).getTime()) / DAY));
  return { at: when, label: `last seen ${day(when)} (${n === 0 ? "today" : `${n} day${n === 1 ? "" : "s"} ago`})` };
}
