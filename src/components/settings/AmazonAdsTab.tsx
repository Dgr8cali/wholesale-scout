"use client";

import { DatabaseBackupIcon, PlugIcon, RefreshCwIcon, UnplugIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useDialogs } from "@/components/Dialogs";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { SectionTitle } from "@/components/ui/info-tip";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import type { Comparison, CompareRow, Totals } from "@/lib/adsapi/compare";
import { api, gbp, when } from "@/lib/ui/client";
import type { PullStatus } from "@/lib/server/adsApiPulls";

interface Profile { profileId: string; country: string; currency: string; timezone: string; name: string; type: string; uk: boolean }
interface Conn { configured: boolean; connected: boolean; needsReconnect?: boolean; reconnectReason?: string | null; profileId: string | null; profileName: string | null; profileCountry: string | null; connectedAt: string | null; profiles?: Profile[]; profilesError?: string }
interface PullRes { requested: { kind: string }[]; skipped: { kind: string; reason: string }[]; error: string | null }
interface CompareRes { from: string; to: string; comparison: Comparison; hasApi: boolean }

const ERRORS: Record<string, string> = {
  not_configured: "ADS_CLIENT_ID and ADS_CLIENT_SECRET aren't set on the server yet.",
  state_cookie_missing: "Your browser didn't send the sign-in check cookie back from Amazon (it expired after 10 minutes, was blocked, or the page was opened in a different tab or browser). Press Connect again and finish in the same tab.",
  state_mismatch: "The sign-in couldn't be verified (it took too long, or the page was opened twice). Press Connect again.",
  access_denied: "Amazon sign-in was cancelled.",
};
const WATCH_MS = 10 * 60_000; // how long a manual pull's card waits with the page open; the job carries on regardless
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const span = (a: string, b: string) => (a === b ? day(a) : `${day(a)} to ${day(b)}`);

/** Settings → Amazon Ads: connect (Login with Amazon, Europe), choose the UK profile, and how the background pulls are going. */
export function AmazonAdsTab() {
  const params = useSearchParams();
  const [c, setC] = useState<Conn | null>(null);
  const [st, setSt] = useState<PullStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [watch, setWatch] = useState<{ until: number } | null>(null);
  const [waited, setWaited] = useState(false);
  const [cmp, setCmp] = useState<CompareRes | null>(null);
  const { confirm } = useDialogs();

  const load = useCallback((profiles = false) => api<Conn>(`/api/ads/connection${profiles ? "?profiles=1" : ""}`).then(setC).catch((e: Error) => setError(e.message)), []);
  const loadStatus = useCallback(() => api<PullStatus>("/api/ads/api-pull").then(setSt).catch(() => {}), []);
  const loadCompare = useCallback(() => api<CompareRes>("/api/ads/api-pull/compare").then(setCmp).catch(() => {}), []);
  useEffect(() => { void load(true); }, [load]);
  const live = !!c?.connected && !!c.profileId;
  useEffect(() => { if (live) { void loadStatus(); void loadCompare(); } }, [live, loadStatus, loadCompare]);

  // While anything is pending, look again every 15 s (the page needn't be open for the pull to finish).
  const pendingCount = st?.pending.length ?? 0;
  useEffect(() => {
    if (!live || !pendingCount) return;
    const t = setInterval(() => { void loadStatus(); void loadCompare(); }, 15_000);
    return () => clearInterval(t);
  }, [live, pendingCount, loadStatus, loadCompare]);
  useEffect(() => {
    if (!watch) return;
    const t = setTimeout(() => { setWatch(null); setWaited(true); }, Math.max(0, watch.until - Date.now()));
    return () => clearTimeout(t);
  }, [watch]);

  const returned = params.get("ads_error");
  useEffect(() => { if (params.get("ads_connected")) toast.success("Amazon Ads connected: now choose the UK profile"); }, [params]);

  const choose = async (profileId: string) => {
    setBusy(`p:${profileId}`);
    try { await api("/api/ads/connection", { method: "PUT", json: { profileId } }); toast.success("Profile saved"); await load(true); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const remove = async () => {
    if (!(await confirm({ title: "Disconnect Amazon Ads?", description: "The stored token is deleted and the daily pull stops. Rows already pulled stay; bulk-sheet imports keep working. Connect again to use the API.", confirmLabel: "Disconnect", destructive: true }))) return;
    setBusy("disconnect");
    try { await api("/api/ads/connection", { method: "DELETE" }); setSt(null); await load(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const start = async (kind: "backfill" | "manual") => {
    setBusy(kind); setWaited(false);
    try {
      const r = await api<PullRes>("/api/ads/api-pull", { method: "POST", json: { kind } });
      if (r.error) toast.error(r.error);
      else if (!r.requested.length) toast.message("Already being fetched: nothing new to ask Amazon for");
      else { toast.success(`Asked Amazon for ${r.requested.length} report${r.requested.length === 1 ? "" : "s"}: they import in the background`); setWatch({ until: Date.now() + WATCH_MS }); }
      await loadStatus();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };

  if (error) return <ErrorState title="Couldn't load Amazon Ads" message={error} />;
  if (!c) return <Skeleton className="h-60 rounded-lg" />;
  const needsReconnect = c.needsReconnect || st?.connection.needsReconnect;
  return (
    <div className="space-y-5">
      <section className="panel space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionTitle title={<>Amazon Ads API</>}>Connects through Login with Amazon (scope advertising::campaign_management) to the Europe Ads API, read only: the app asks Amazon for reports and never changes a campaign, bid, budget or keyword. The refresh token is stored encrypted. The bulk-sheet import keeps working whether or not this is connected.</SectionTitle>
          <div className="flex items-center gap-2">
            {needsReconnect ? <StatusChip tone="bad">Needs reconnecting</StatusChip> : c.connected ? <StatusChip tone="good">Connected{c.profileName ? `: ${c.profileName}` : ""}</StatusChip> : <StatusChip tone="neutral">Not connected</StatusChip>}
          </div>
        </div>
        {returned && <p role="alert" className="rounded-lg border border-danger/40 bg-danger-soft p-3 text-sm">{ERRORS[returned] ?? `Amazon Ads sign-in failed: ${returned}`}</p>}
        {needsReconnect && <p role="alert" className="rounded-lg border border-danger/40 bg-danger-soft p-3 text-sm">Amazon rejected the saved sign-in{(c.reconnectReason ?? st?.connection.reconnectReason) ? ` (${c.reconnectReason ?? st?.connection.reconnectReason})` : ""}. The daily pull is stopped until you press Reconnect and approve again.</p>}
        {!c.configured && <p className="rounded-lg border border-warn/40 bg-warn-soft p-3 text-sm">The server has no ADS_CLIENT_ID / ADS_CLIENT_SECRET yet, so Connect can&apos;t start.</p>}
        <div className="flex flex-wrap items-center gap-2">
          {c.configured
            ? <Button asChild><a href="/api/ads/connect"><PlugIcon />{c.connected ? "Reconnect" : "Connect Amazon Ads"}</a></Button>
            : <Button disabled><PlugIcon />Connect Amazon Ads</Button>}
          {c.connected && <Button variant="ghost" onClick={remove} loading={busy === "disconnect"}><UnplugIcon />Disconnect</Button>}
          {c.connected && c.connectedAt && <span className="text-xs text-muted-foreground">Connected {when(c.connectedAt)}</span>}
        </div>
      </section>

      {c.connected && (
        <section className="panel space-y-4 p-4 sm:p-5">
          <SectionTitle title={<>Advertiser profile</>}>Amazon lists every advertiser account this login can reach. Choose the UK one: the API calls are scoped to it.</SectionTitle>
          {c.profilesError && <p role="alert" className="rounded-lg border border-danger/40 bg-danger-soft p-3 text-sm">{c.profilesError}</p>}
          <ul className="divide-y divide-border rounded-lg border border-border">
            {(c.profiles ?? []).length === 0 && !c.profilesError && <li className="p-3 text-sm text-muted-foreground">Amazon returned no profiles for this login.</li>}
            {(c.profiles ?? []).map((p) => (
              <li key={p.profileId} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{p.name} {p.uk && <StatusChip tone="info">UK</StatusChip>} {c.profileId === p.profileId && <StatusChip tone="good">in use</StatusChip>}</p>
                  <p className="text-xs text-muted-foreground">{p.type || "account"} · {p.country} · {p.currency} · {p.timezone} · profile <span className="num">{p.profileId}</span></p>
                </div>
                <Button variant={c.profileId === p.profileId ? "ghost" : "secondary"} size="sm" disabled={c.profileId === p.profileId} onClick={() => choose(p.profileId)} loading={busy === `p:${p.profileId}`}>{c.profileId === p.profileId ? "Chosen" : "Use this one"}</Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {live && (
        <section className="panel space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <SectionTitle title={<>Automatic pulls</>}>Every day from 06:30 UK time the app asks Amazon for the last 7 days of Sponsored Products campaigns, search terms, targeting (keywords and product targets, with current bids; this one covers 30 days, like a bulk export) and advertised products, and imports them. Recent days are fetched again because Amazon revises attribution afterwards. It runs on the server, so this page needn&apos;t be open.</SectionTitle>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => start("backfill")} loading={busy === "backfill"} disabled={!!needsReconnect}><DatabaseBackupIcon />Backfill 30 days</Button>
              <Button onClick={() => start("manual")} loading={busy === "manual"} disabled={!!needsReconnect}><RefreshCwIcon />Pull last 7 days</Button>
            </div>
          </div>
          {!st && <Skeleton className="h-24 rounded-lg" />}
          {st && (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="field-label">Last successful pull</dt><dd>{st.lastSuccess ? <>{when(st.lastSuccess.at)}: {span(st.lastSuccess.from, st.lastSuccess.to)}, <span className="num">{st.lastSuccess.rowsAdded.toLocaleString("en-GB")}</span> rows added, <span className="num">{st.lastSuccess.rowsUpdated.toLocaleString("en-GB")}</span> updated</> : "None yet: press Backfill 30 days"}</dd></div>
              <div><dt className="field-label">Next scheduled run</dt><dd>{st.nextRun ? when(st.nextRun) : "Stopped until you reconnect"}</dd></div>
              <div className="sm:col-span-2"><dt className="field-label">Which numbers the app uses</dt><dd>
                {st.source.api.days === 0 ? `Imported files only (${st.source.import.days} days). Pulled rows will take over for the days they cover; imported rows are never changed.`
                  : <>Daily campaign figures: the API for {span(st.source.api.from!, st.source.api.to!)} ({st.source.api.days} days){st.source.import.days ? <>, imported files for the other days they cover ({st.source.import.days} imported days{st.source.overlapDays ? `; on the ${st.source.overlapDays} days both cover, the app uses the API's and keeps the imported rows untouched` : ""})</> : ""}.</>}
              </dd></div>
            </dl>
          )}
          {watch && pendingCount > 0 && <p role="status" className="text-sm text-muted-foreground">Amazon is building the reports. They import in the background, so you can leave this page.</p>}
          {waited && pendingCount > 0 && <p role="status" className="rounded-lg border border-border bg-subtle p-3 text-sm">Report requested: Amazon is still building it, so check back later. It imports by itself when it&apos;s ready (the job checks every minute, backing off to every few minutes, for up to 2 hours).</p>}
          {st?.connection.lastError && !needsReconnect && <p role="alert" className="rounded-lg border border-warn/40 bg-warn-soft p-3 text-sm">The last attempt to ask Amazon for the daily reports failed: {st.connection.lastError}. It tries again shortly.</p>}
          {st && st.pending.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Waiting for Amazon</h3>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {st.pending.map((p) => <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"><span>{p.label}, {span(p.date_from, p.date_to)} <span className="text-xs text-muted-foreground">({p.trigger})</span></span><span className="text-xs text-muted-foreground">asked {when(p.requested_at)} · {(p.amazon_status ?? "requested").toLowerCase()} · next check {when(p.next_check_at)}</span></li>)}
              </ul>
            </div>
          )}
          {st && st.failed.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Failed in the last 7 days</h3>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {st.failed.map((p) => <li key={p.id} className="space-y-0.5 p-3 text-sm"><p>{p.label}, {span(p.from, p.to)} <StatusChip tone="bad">failed</StatusChip></p><p className="text-xs text-muted-foreground">{p.reason || "No reason given"} · {when(p.at)}</p></li>)}
              </ul>
            </div>
          )}
          {cmp?.hasApi && <CompareTables from={cmp.from} to={cmp.to} cmp={cmp.comparison} />}
          {cmp && !cmp.hasApi && <p className="text-sm text-muted-foreground">Once the campaign report has been pulled, its last 7 days show here next to the daily rows imported from files, so you can check they agree.</p>}
        </section>
      )}
    </div>
  );
}

const cell = (t: Totals | null, key: keyof Totals) => (t == null ? "—" : key === "cost" || key === "sales" ? gbp(t[key]) : t[key].toLocaleString("en-GB"));
const same = (a: Totals | null, b: Totals | null, key: keyof Totals) => a != null && b != null && Math.abs(a[key] - b[key]) < 0.01;
const COLS: [keyof Totals, string][] = [["cost", "Spend"], ["sales", "Sales"], ["orders", "Orders"], ["clicks", "Clicks"], ["impressions", "Impr."]];

function CompareTable({ title, rows, first }: { title: string; rows: CompareRow[]; first: string }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <caption className="sr-only">{title}: API and imported</caption>
          <thead className="bg-subtle text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" rowSpan={2} className="px-3 py-2 align-bottom font-medium">{first}</th>
              {COLS.map(([, l]) => <th key={l} scope="colgroup" colSpan={2} className="border-l border-border px-3 py-1 text-center font-medium">{l}</th>)}
            </tr>
            <tr>{COLS.map(([k]) => <><th key={`${k}a`} scope="col" className="border-l border-border px-2 py-1 text-right font-medium">API</th><th key={`${k}i`} scope="col" className="px-2 py-1 text-right font-medium">Imported</th></>)}</tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row" className="max-w-[16rem] truncate px-3 py-2 text-left font-normal" title={r.label}>{r.label}</th>
                {COLS.map(([k]) => (
                  <><td key={`${k}a`} className="num border-l border-border px-2 py-2 text-right">{cell(r.api, k)}</td>
                  <td key={`${k}i`} className={`num px-2 py-2 text-right ${r.imported == null ? "text-muted-foreground" : same(r.api, r.imported, k) ? "" : "text-warn-ink"}`}>{cell(r.imported, k)}</td></>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CompareTables({ from, to, cmp }: { from: string; to: string; cmp: Comparison }) {
  const total: CompareRow = { key: "total", label: "Total", api: cmp.apiTotal, imported: cmp.importedTotal };
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">{from} to {to}. Imported numbers that differ from the API are highlighted; “—” means nothing imported for that day or campaign. Amazon&apos;s API orders and sales are 7-day attributed.</p>
      <CompareTable title="By day" first="Day" rows={[...cmp.days, total]} />
      <CompareTable title="By campaign" first="Campaign" rows={cmp.campaigns} />
    </div>
  );
}
