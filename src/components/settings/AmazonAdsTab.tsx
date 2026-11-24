"use client";

import { PlugIcon, RefreshCwIcon, UnplugIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useDialogs } from "@/components/Dialogs";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { SectionTitle } from "@/components/ui/info-tip";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import type { Comparison, CompareRow, Totals } from "@/lib/adsapi/compare";
import { api, gbp, when } from "@/lib/ui/client";

interface Profile { profileId: string; country: string; currency: string; timezone: string; name: string; type: string; uk: boolean }
interface Conn { configured: boolean; connected: boolean; profileId: string | null; profileName: string | null; profileCountry: string | null; connectedAt: string | null; profiles?: Profile[]; profilesError?: string }
type Pull = { state: "idle" } | { state: "running"; note: string } | { state: "failed"; message: string } | { state: "done"; from: string; to: string; comparison: Comparison };

const ERRORS: Record<string, string> = {
  not_configured: "ADS_CLIENT_ID and ADS_CLIENT_SECRET aren't set on the server yet.",
  state_mismatch: "The sign-in couldn't be verified (it took too long, or the page was opened twice). Press Connect again.",
  access_denied: "Amazon sign-in was cancelled.",
};
const POLL_MS = 6000, POLL_MAX = 100; // up to ~10 minutes: Amazon builds reports in the background

/** Settings → Amazon Ads: connect (Login with Amazon, Europe), choose the UK profile, and a 7-day test pull beside the imported data. */
export function AmazonAdsTab() {
  const params = useSearchParams();
  const [c, setC] = useState<Conn | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pull, setPull] = useState<Pull>({ state: "idle" });
  const stop = useRef(false);
  const { confirm } = useDialogs();

  const load = useCallback((profiles = false) => api<Conn>(`/api/ads/connection${profiles ? "?profiles=1" : ""}`).then(setC).catch((e: Error) => setError(e.message)), []);
  useEffect(() => { void load(true); return () => { stop.current = true; }; }, [load]);

  const returned = params.get("ads_error");
  useEffect(() => {
    if (params.get("ads_connected")) toast.success("Amazon Ads connected: now choose the UK profile");
  }, [params]);

  const choose = async (profileId: string) => {
    setBusy(`p:${profileId}`);
    try { await api("/api/ads/connection", { method: "PUT", json: { profileId } }); toast.success("Profile saved"); await load(true); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const remove = async () => {
    if (!(await confirm({ title: "Disconnect Amazon Ads?", description: "The stored token is deleted. Bulk-sheet imports keep working; connect again to use the API.", confirmLabel: "Disconnect", destructive: true }))) return;
    setBusy("disconnect");
    try { await api("/api/ads/connection", { method: "DELETE" }); setPull({ state: "idle" }); await load(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };

  const runPull = async () => {
    stop.current = false;
    setPull({ state: "running", note: "Asking Amazon for the report…" });
    try {
      const { reportId, from, to } = await api<{ reportId: string; from: string; to: string }>("/api/ads/api-pull", { method: "POST" });
      for (let i = 0; i < POLL_MAX && !stop.current; i++) {
        await new Promise((r) => setTimeout(r, i === 0 ? 3000 : POLL_MS));
        if (stop.current) return;
        const r = await api<{ status: string; reason?: string; comparison?: Comparison }>(`/api/ads/api-pull?reportId=${encodeURIComponent(reportId)}&from=${from}&to=${to}`);
        if (r.status === "FAILURE") return setPull({ state: "failed", message: `Amazon couldn't build the report: ${r.reason}` });
        if (r.status === "COMPLETED" && r.comparison) return setPull({ state: "done", from, to, comparison: r.comparison });
        setPull({ state: "running", note: `Amazon is building the report (${r.status.toLowerCase()})…` });
      }
      setPull({ state: "failed", message: "Amazon is taking longer than 10 minutes: try again later." });
    } catch (e) { setPull({ state: "failed", message: (e as Error).message }); }
  };

  if (error) return <ErrorState title="Couldn't load Amazon Ads" message={error} />;
  if (!c) return <Skeleton className="h-60 rounded-lg" />;
  return (
    <div className="space-y-5">
      <section className="panel space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionTitle title={<>Amazon Ads API</>}>Connects through Login with Amazon (scope advertising::campaign_management) to the Europe Ads API. The refresh token is stored encrypted. The bulk-sheet import keeps working whether or not this is connected.</SectionTitle>
          <div className="flex items-center gap-2">
            {c.connected ? <StatusChip tone="good">Connected{c.profileName ? `: ${c.profileName}` : ""}</StatusChip> : <StatusChip tone="neutral">Not connected</StatusChip>}
          </div>
        </div>
        {returned && <p role="alert" className="rounded-lg border border-danger/40 bg-danger-soft p-3 text-sm">{ERRORS[returned] ?? `Amazon Ads sign-in failed: ${returned}`}</p>}
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

      {c.connected && c.profileId && (
        <section className="panel space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <SectionTitle title={<>Test pull: last 7 days</>}>Sponsored Products campaigns, one row per campaign per day, from the API, next to the daily rows already imported from report files. Amazon builds the report in the background, so it can take a few minutes.</SectionTitle>
            <Button onClick={runPull} loading={pull.state === "running"}><RefreshCwIcon />Pull last 7 days</Button>
          </div>
          {pull.state === "running" && <p role="status" className="text-sm text-muted-foreground">{pull.note}</p>}
          {pull.state === "failed" && <p role="alert" className="rounded-lg border border-danger/40 bg-danger-soft p-3 text-sm">{pull.message}</p>}
          {pull.state === "done" && <CompareTables from={pull.from} to={pull.to} cmp={pull.comparison} />}
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
