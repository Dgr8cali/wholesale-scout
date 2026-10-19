import { getKeepa } from "@/lib/keepa/client";
import type { KeepaTokens } from "@/lib/keepa/types";
import { db } from "@/lib/server/db";
import { spApiConfigFromEnv } from "@/lib/spapi/client";

/** One line of the top bar's status popover. `ok: null` is information, not an issue. */
export interface ShellCheck { key: string; label: string; ok: boolean | null; detail: string; href?: string }
export interface ShellData { checks: ShellCheck[]; issues: number; counts: Record<string, number> }

// Keepa's /token is free, but every open tab polls this; share one answer briefly.
let keepaCache: { at: number; tokens: KeepaTokens | null } | null = null;
const TTL_MS = 30_000;
/** The nightly Qogita pull runs at 03:00: older than this, it missed a night. */
const CRON_STALE_MS = 36 * 60 * 60 * 1000;

const ago = (iso: string) => {
  const h = Math.round((Date.now() - Date.parse(iso)) / 3_600_000);
  return h < 1 ? "under an hour ago" : h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
};

/**
 * The top bar: the integrations (SP-API, Keepa tokens, Ads API, the last nightly cron) as checks,
 * how many need attention, and the sidebar's count badges. Never returns secret values.
 */
export async function GET() {
  const d = db();
  const keepa = getKeepa();
  if (keepa.available && (!keepaCache || Date.now() - keepaCache.at > TTL_MS)) keepaCache = { at: Date.now(), tokens: await keepa.tokenStatus().catch(() => null) };
  const [pull, proposals] = await Promise.all([
    d.from("qogita_pulls").select("started_at, error").eq("kind", "nightly").order("started_at", { ascending: false }).limit(1),
    d.from("ads_proposals").select("id", { count: "exact", head: true }).eq("status", "open"),
  ]);
  const sp = spApiConfigFromEnv();
  const t = keepa.available ? keepaCache?.tokens ?? null : null;
  const last = (pull.data as { started_at: string; error: string | null }[] | null)?.[0];
  const checks: ShellCheck[] = [
    { key: "db", label: "Database", ok: !pull.error, detail: pull.error ? `Not answering: ${pull.error.message}` : "Connected" },
    sp
      ? { key: "spapi", label: "SP-API", ok: true, detail: sp.sellerId ? "Connected, with gating checks" : "Connected; set SPAPI_SELLER_ID for gating checks" }
      : { key: "spapi", label: "SP-API", ok: false, detail: "Not set up: SPAPI_CLIENT_ID, SPAPI_CLIENT_SECRET, SPAPI_REFRESH_TOKEN" },
    !keepa.available
      ? { key: "keepa", label: "Keepa tokens", ok: false, detail: "No KEEPA_API_KEY: history gates are skipped" }
      : t
        ? { key: "keepa", label: "Keepa tokens", ok: t.tokensLeft >= 0, detail: `${t.tokensLeft.toLocaleString("en-GB")} left · refills ${t.refillRate}/min` }
        : { key: "keepa", label: "Keepa tokens", ok: false, detail: "Keepa didn't report a balance" },
    { key: "ads", label: "Ads API", ok: null, detail: process.env.ADS_LWA_CLIENT_ID ? "Waiting for approval: reports come in as files" : "Not connected: reports come in as files", href: "/ads/imports" },
    !last
      ? { key: "cron", label: "Last cron run", ok: false, detail: "No nightly Qogita pull recorded yet" }
      : { key: "cron", label: "Last cron run", ok: !last.error && Date.now() - Date.parse(last.started_at) < CRON_STALE_MS, detail: `Qogita nightly ${ago(last.started_at)}${last.error ? `: ${last.error}` : ""}`, href: "/qogita" },
  ];
  const data: ShellData = { checks, issues: checks.filter((c) => c.ok === false).length, counts: { "/ads/proposals": proposals.count ?? 0 } };
  return Response.json(data);
}
