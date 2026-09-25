"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EditableName } from "@/components/EditableName";
import { Button } from "@/components/ui/button";
import { api, when } from "@/lib/ui/client";

interface Run {
  id: string;
  name?: string | null;
  source: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  row_count: number;
  processed_count: number;
  token_cost: number;
  profile: { name: string } | null;
}

interface Status {
  supabase: boolean;
  spapi: boolean;
  spapiSellerId: boolean;
  keepa: boolean;
  password: boolean;
}

function Dot({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <div className="flex items-center gap-2 text-sm" title={hint}>
      <span className={`h-2 w-2 rounded-full ${ok ? "bg-pass" : "bg-warn"}`} />
      <span>{label}</span>
      {!ok && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

export default function Home() {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Status>("/api/status").then(setStatus).catch(() => {});
    api<{ runs: Run[] }>("/api/runs").then((r) => setRuns(r.runs)).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">Runs</h1>
        <Button asChild><Link href="/upload">Upload price lists</Link></Button>
      </div>

      {status && (
        <div className="panel flex flex-wrap gap-x-6 gap-y-2 px-4 py-3">
          <Dot ok={status.supabase} label="Supabase" hint="Set SUPABASE_URL and SUPABASE_SERVICE_KEY" />
          <Dot ok={status.spapi} label="SP-API" hint="Set SPAPI_CLIENT_ID, SPAPI_CLIENT_SECRET, SPAPI_REFRESH_TOKEN" />
          <Dot ok={status.spapiSellerId} label="Gating checks" hint="Set SPAPI_SELLER_ID (your merchant token)" />
          <Dot ok={status.keepa} label="Keepa" hint="Stub until KEEPA_API_KEY is a real key: history gates are skipped" />
        </div>
      )}

      {error && <p className="rounded-md bg-fail-soft px-3 py-2 text-sm text-fail">{error}</p>}
      <ImageBackfill />

      {runs && !runs.length && (
        <div className="panel px-6 py-10 text-center">
          <p className="section-title">No runs yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Upload a supplier price list to screen it against Amazon UK.</p>
        </div>
      )}

      {runs && runs.length > 0 && (
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Source</th>
                <th className="px-4 py-2">Profile</th>
                <th className="px-4 py-2">Started</th>
                <th className="px-4 py-2 text-right">Rows</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Keepa tokens</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted">
                  <td className="px-4 py-2">
                    <EditableName value={r.name || r.source} inputClassName="py-1"
                      display={<Link href={`/runs/${r.id}`} className="font-medium text-brand hover:underline">{r.name || r.source}</Link>}
                      onSave={async (name) => {
                        await api(`/api/runs/${r.id}`, { method: "PATCH", json: { name } });
                        setRuns((rs) => rs && rs.map((x) => (x.id === r.id ? { ...x, name } : x)));
                      }} />
                    {r.name && r.name !== r.source && <div className="truncate text-xs text-muted-foreground">{r.source}</div>}
                  </td>
                  <td className="px-4 py-2">{r.profile?.name ?? "—"}</td>
                  <td className="px-4 py-2">{when(r.started_at)}</td>
                  <td className="num px-4 py-2 text-right">{r.row_count}</td>
                  <td className="px-4 py-2">{r.status === "done" ? "Done" : `${r.processed_count} / ${r.row_count} screened`}</td>
                  <td className="num px-4 py-2 text-right">{r.token_cost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Products screened before images were kept get theirs from Amazon's catalog (free), 400 at a time. */
function ImageBackfill() {
  const [state, setState] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    setState(null);
    try {
      let looked = 0, found = 0;
      for (;;) {
        const r = await api<{ looked: number; found: number }>("/api/products/images", { method: "POST" });
        looked += r.looked;
        found += r.found;
        setState(`Checked ${looked} products, found ${found} images…`);
        if (r.looked < 400) break;
      }
      setState(looked ? `Done: ${found} images found for ${looked} products.` : "Every product already has its image (or Amazon has none).");
    } catch (e) {
      setState((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <p className="text-xs text-muted-foreground">
      <button className="text-brand hover:underline disabled:opacity-50" disabled={busy} onClick={run}>{busy ? "Fetching images…" : "Fetch missing product images"}</button>
      {state && <span className="ml-2">{state}</span>}
    </p>
  );
}
