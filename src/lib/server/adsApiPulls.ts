import "server-only";
import { AdsApiError, downloadReport, isTokenRejected, isTransient, reportStatus, requestReport } from "../adsapi/client";
import { backoffS, DAILY_AT_MINUTES, GIVE_UP_MS, KINDS, nextDailyAt, REPORTS, reportBody, ukDate, ukMinutes, windowFor, type ReportKind, type Trigger } from "../adsapi/reports";
import { summariseSources, type SourceSummary } from "../ads/source";
import { storeApiReport } from "./adsApiStore";
import { afterImport } from "./ads";
import { adsSession, connectionStatus, markNeedsReconnect, setDailyAttempt, type AdsConnection } from "./adsConnection";
import { db, must, selectAll } from "./db";
import { redact } from "./secrets";

/**
 * Amazon Ads pulls, driven from the database. A pull asks Amazon for reports (Reporting API v3,
 * read-only), records each in ads_api_reports and returns; advanceAdsPulls (the watchdog calls it
 * every minute) checks the pending ones with backoff, downloads and stores the finished ones, and
 * starts the daily pull from 06:30 UK time. Nothing depends on a page being open.
 */
type Fetch = typeof fetch;
export interface PullOpts { f?: Fetch; now?: Date }

export interface ReportRow {
  id: string; profile_id: string; report_type: ReportKind; date_from: string; date_to: string; trigger: Trigger; amazon_report_id: string | null; amazon_status: string | null;
  status: "pending" | "imported" | "failed"; failure_reason: string | null; requested_at: string; last_checked_at: string | null; next_check_at: string; attempts: number;
  claimed_at: string | null; finished_at: string | null; rows_added: number | null; rows_updated: number | null;
}

const iso = (d: Date) => d.toISOString();
const plus = (d: Date, s: number) => new Date(d.getTime() + s * 1000);
/** Access tokens seen by this process, so an error text that echoes one is masked (Amazon's own tokens also match their Atza|/Atzr| shape). */
const seen = new Set<string>();
const message = (e: unknown) => {
  let t = redact(e instanceof Error ? e.message : String(e)).replace(/Atz[ar]\|\S+/g, "[redacted]");
  for (const v of seen) if (v.length >= 6) t = t.split(v).join("[redacted]");
  return t.slice(0, 300);
};

/** Ask for one report: with every column; if Amazon rejects a column name (400), again with the core ones. */
async function ask(env: Parameters<typeof requestReport>[0], token: string, profileId: string, kind: ReportKind, win: { from: string; to: string }, f: Fetch): Promise<string> {
  try {
    return await requestReport(env, token, profileId, reportBody(kind, win.from, win.to), f);
  } catch (e) {
    if (e instanceof AdsApiError && e.status === 400) return requestReport(env, token, profileId, reportBody(kind, win.from, win.to, true), f);
    throw e;
  }
}

export interface PullResult { requested: { kind: ReportKind; from: string; to: string }[]; skipped: { kind: ReportKind; reason: string }[]; error: string | null; retryAfterS: number | null }

/**
 * Start a pull: one report per type for its window, each recorded as pending (the job polls them).
 * A type already being fetched for the same dates is skipped, never asked twice. If Amazon says an
 * identical report exists, its id is reused. Stops at the first sign Amazon wants us to slow down.
 */
export async function requestPull(trigger: Trigger, opts: PullOpts & { kinds?: ReportKind[] } = {}): Promise<PullResult> {
  const f = opts.f ?? fetch, now = opts.now ?? new Date();
  let session;
  try { session = await adsSession(f); } catch (e) { if (isTokenRejected(e)) await markNeedsReconnect(message(e)); throw e; }
  const { env, token, profileId } = session;
  seen.add(token);
  if (!profileId) throw new Error("Choose the UK profile first");
  const out: PullResult = { requested: [], skipped: [], error: null, retryAfterS: null };
  const d = db();
  for (const kind of opts.kinds ?? KINDS) {
    const win = windowFor(kind, trigger, now);
    const dup = must(await d.from("ads_api_reports").select("id").eq("profile_id", profileId).eq("report_type", kind).eq("date_from", win.from).eq("date_to", win.to).eq("status", "pending"), "pending reports") as { id: string }[];
    if (dup.length) { out.skipped.push({ kind, reason: "already being fetched" }); continue; }
    const base = { profile_id: profileId, report_type: kind, date_from: win.from, date_to: win.to, trigger, requested_at: iso(now) };
    let amazonId: string;
    try {
      amazonId = await ask(env, token, profileId, kind, win, f);
    } catch (e) {
      if (isTokenRejected(e)) { await markNeedsReconnect(message(e)); out.error = message(e); break; }
      if (isTransient(e) || (e instanceof AdsApiError && e.status === 425)) { out.error = message(e); out.retryAfterS = (e as AdsApiError).retryAfterS ?? 60; break; }
      // Refused for good (bad request, no access): recorded, so Settings shows why; the other types go on.
      must(await d.from("ads_api_reports").insert({ ...base, status: "failed", failure_reason: message(e), finished_at: iso(now), next_check_at: iso(now) }), "record failed report");
      out.skipped.push({ kind, reason: message(e) });
      continue;
    }
    const ins = await d.from("ads_api_reports").insert({ ...base, amazon_report_id: amazonId, amazon_status: "requested", status: "pending", attempts: 0, next_check_at: iso(plus(now, 30)) });
    if (ins.error) {
      if (ins.error.code === "23505") { out.skipped.push({ kind, reason: "already being fetched" }); continue; } // a second pull raced this one
      throw new Error(`record report: ${ins.error.message}`);
    }
    out.requested.push({ kind, ...win });
  }
  return out;
}

/** Take a pending report for this call (a claim lasts 2 minutes), so two ticks never work on one. */
async function claim(r: ReportRow, now: Date): Promise<boolean> {
  const got = must(await db().from("ads_api_reports").update({ claimed_at: iso(now) }).eq("id", r.id).eq("status", "pending").or(`claimed_at.is.null,claimed_at.lt.${iso(plus(now, -120))}`).select("id"), "claim report") as { id: string }[];
  return got.length > 0;
}

/** Check one pending report: finished (store it), failed, still going (check again later), or trouble (back off). */
async function pollOne(r: ReportRow, f: Fetch, now: Date): Promise<"imported" | "failed" | "waiting" | "retry" | "reconnect"> {
  const d = db();
  const patch = async (p: Record<string, unknown>) => { must(await d.from("ads_api_reports").update({ claimed_at: null, ...p }).eq("id", r.id), "update report"); };
  const wait = async (status: string, retryAfterS?: number) => {
    await patch({ amazon_status: status, last_checked_at: iso(now), attempts: (r.attempts ?? 0) + 1, next_check_at: iso(plus(now, backoffS(r.attempts ?? 0, retryAfterS))) });
  };
  try {
    const { env, token } = await adsSession(f);
    seen.add(token);
    const st = await reportStatus(env, token, r.profile_id, r.amazon_report_id!, f);
    if (st.status === "FAILURE") { await patch({ status: "failed", amazon_status: "FAILURE", failure_reason: st.reason.slice(0, 300), finished_at: iso(now), last_checked_at: iso(now) }); return "failed"; }
    if (st.status !== "COMPLETED") {
      if (now.getTime() - Date.parse(r.requested_at) > GIVE_UP_MS) { await patch({ status: "failed", amazon_status: st.status, failure_reason: "Amazon hadn't finished the report after 2 hours", finished_at: iso(now), last_checked_at: iso(now) }); return "failed"; }
      await wait(st.status);
      return "waiting";
    }
    const json = await downloadReport(st.url, f);
    let stored;
    try { stored = await storeApiReport(r.report_type, json, { from: r.date_from, to: r.date_to }); }
    catch (e) { await patch({ status: "failed", amazon_status: "COMPLETED", failure_reason: `Couldn't save the report: ${message(e)}`, finished_at: iso(now), last_checked_at: iso(now) }); return "failed"; }
    await patch({ status: "imported", amazon_status: "COMPLETED", failure_reason: null, rows_added: stored.added, rows_updated: stored.updated, finished_at: iso(now), last_checked_at: iso(now) });
    await afterImport([stored.importId]).catch(() => null); // the account's CPC estimate follows the new data (when auto)
    return "imported";
  } catch (e) {
    if (isTokenRejected(e)) { await markNeedsReconnect(message(e)); await patch({ last_checked_at: iso(now), next_check_at: iso(plus(now, 600)) }); return "reconnect"; }
    // 429, Amazon's own errors, a network blip: keep the report, look again later (Retry-After respected).
    await wait(r.amazon_status ?? "PENDING", e instanceof AdsApiError ? e.retryAfterS : undefined);
    return "retry";
  }
}

const POLLS_PER_TICK = 3;

/** One-minute tick: start the daily pull when due, then check the pending reports that are due. */
export async function advanceAdsPulls(opts: PullOpts = {}): Promise<{ state: string; started?: PullResult; polled: Record<string, number> }> {
  const f = opts.f ?? fetch, now = opts.now ?? new Date();
  const conn = await connectionStatus();
  if (!conn.connected || !conn.profileId) return { state: "not connected", polled: {} };
  if (conn.needsReconnect) return { state: "needs reconnect", polled: {} };
  const d = db();
  let started: PullResult | undefined;

  // The daily pull: from 06:30 UK, each report type once a day (a type that failed to be asked for is tried again).
  if (ukMinutes(now) >= DAILY_AT_MINUTES && (!conn.nextDailyAttemptAt || Date.parse(conn.nextDailyAttemptAt) <= now.getTime())) {
    const missing = await missingDaily(conn, now);
    if (missing.length) {
      try {
        started = await requestPull("daily", { f, now, kinds: missing });
        await setDailyAttempt(started.error ? iso(plus(now, started.retryAfterS ?? 300)) : null, started.error);
      } catch (e) {
        await setDailyAttempt(iso(plus(now, 300)), message(e));
      }
    }
  }

  const due = must(await d.from("ads_api_reports").select("*").eq("status", "pending").lte("next_check_at", iso(now)).order("next_check_at").limit(POLLS_PER_TICK), "due reports") as ReportRow[];
  const polled: Record<string, number> = {};
  for (const r of due) {
    if (!(await claim(r, now))) continue;
    if (r.profile_id !== conn.profileId && !r.amazon_report_id) continue;
    const res = await pollOne(r, f, now);
    polled[res] = (polled[res] ?? 0) + 1;
    if (res === "reconnect") break;
  }
  return { state: "ok", started, polled };
}

/** The report types with no daily report asked for yet today (UK date). */
async function missingDaily(conn: AdsConnection, now: Date): Promise<ReportKind[]> {
  const today = ukDate(now);
  const rows = must(await db().from("ads_api_reports").select("report_type, requested_at").eq("profile_id", conn.profileId!).eq("trigger", "daily").gte("requested_at", iso(plus(now, -36 * 3600))), "daily reports") as { report_type: ReportKind; requested_at: string }[];
  const done = new Set(rows.filter((r) => ukDate(new Date(r.requested_at)) === today).map((r) => r.report_type));
  return KINDS.filter((k) => !done.has(k));
}

/* ===================== status, for Settings ===================== */

export interface PullStatus {
  connection: Pick<AdsConnection, "connected" | "needsReconnect" | "reconnectReason" | "lastError" | "profileId" | "profileName">;
  lastSuccess: { at: string; rowsAdded: number; rowsUpdated: number; from: string; to: string; reports: { kind: ReportKind; label: string; from: string; to: string; added: number; updated: number; at: string }[] } | null;
  pending: (Pick<ReportRow, "id" | "report_type" | "date_from" | "date_to" | "trigger" | "requested_at" | "next_check_at" | "attempts" | "amazon_status"> & { label: string })[];
  failed: { id: string; kind: ReportKind; label: string; from: string; to: string; reason: string; at: string }[];
  nextRun: string | null;
  source: SourceSummary;
}

export async function pullStatus(opts: PullOpts = {}): Promise<PullStatus> {
  const now = opts.now ?? new Date();
  const conn = await connectionStatus();
  const d = db();
  const recent = must(await d.from("ads_api_reports").select("*").order("requested_at", { ascending: false }).limit(60), "reports") as ReportRow[];
  const imported = recent.filter((r) => r.status === "imported" && r.finished_at);
  const newest = imported.map((r) => r.finished_at!).sort().at(-1);
  // "Last successful pull": the reports imported in the same sitting (within a day of the newest).
  const batch = newest ? imported.filter((r) => Date.parse(newest) - Date.parse(r.finished_at!) < 24 * 3600_000) : [];
  const bestPerKind = KINDS.flatMap((k) => batch.filter((r) => r.report_type === k).sort((a, b) => b.finished_at!.localeCompare(a.finished_at!)).slice(0, 1));
  const day = await selectAll<{ date: string; source: string }>("ads_campaign_daily", "date, source", ["campaign", "date", "source"]).catch(() => []);
  const todayDone = conn.profileId ? (await missingDaily(conn, now)).length === 0 : false;
  const horizon = Date.parse(iso(plus(now, -7 * 86400)));
  return {
    connection: { connected: conn.connected, needsReconnect: conn.needsReconnect, reconnectReason: conn.reconnectReason, lastError: conn.lastError, profileId: conn.profileId, profileName: conn.profileName },
    lastSuccess: newest ? {
      at: newest, rowsAdded: bestPerKind.reduce((a, r) => a + (r.rows_added ?? 0), 0), rowsUpdated: bestPerKind.reduce((a, r) => a + (r.rows_updated ?? 0), 0),
      from: bestPerKind.map((r) => r.date_from).sort()[0], to: bestPerKind.map((r) => r.date_to).sort().at(-1)!,
      reports: bestPerKind.map((r) => ({ kind: r.report_type, label: REPORTS[r.report_type].label, from: r.date_from, to: r.date_to, added: r.rows_added ?? 0, updated: r.rows_updated ?? 0, at: r.finished_at! })),
    } : null,
    pending: recent.filter((r) => r.status === "pending").map((r) => ({ id: r.id, report_type: r.report_type, label: REPORTS[r.report_type].label, date_from: r.date_from, date_to: r.date_to, trigger: r.trigger, requested_at: r.requested_at, next_check_at: r.next_check_at, attempts: r.attempts, amazon_status: r.amazon_status })),
    failed: recent.filter((r) => r.status === "failed" && Date.parse(r.requested_at) >= horizon).slice(0, 10).map((r) => ({ id: r.id, kind: r.report_type, label: REPORTS[r.report_type].label, from: r.date_from, to: r.date_to, reason: r.failure_reason ?? "", at: r.finished_at ?? r.requested_at })),
    nextRun: conn.connected && conn.profileId && !conn.needsReconnect ? nextDailyAt(todayDone, now) : null,
    source: summariseSources(day),
  };
}
