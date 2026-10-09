"use client";

import { LoaderIcon, RefreshCwIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useDialogs } from "@/components/Dialogs";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { PRICE_BASES, PRICE_BASIS_LABEL, type PriceBasis } from "@/lib/screening/config";
import { api } from "@/lib/ui/client";
import { cn } from "@/lib/utils";

interface Business { vatRegistered: boolean; vatRate: number; qogitaRegion: "UK" | "EU"; priceBasis: PriceBasis }
interface Change { id: string; runId: string; asin: string | null; title: string | null; before: number | null; after: number | null; change: number }
interface Status { job: { id: string; started_at: string; basis: string } | null; pending: number; runs: number; done: boolean; changed: number; top: Change[] }

/** The recalculation's status, again every 5 seconds until it's done. */
async function watchStatus(jobId: string | undefined, onStatus: (s: Status) => void, timer: { current: ReturnType<typeof setTimeout> | null }) {
  try {
    const s = await api<Status>(`/api/business/recalculate${jobId ? `?job=${jobId}` : ""}`);
    onStatus(s);
    if (s.job && !s.done) timer.current = setTimeout(() => watchStatus(s.job!.id, onStatus, timer), 5000);
  } catch { /* tried again on the next visit */ }
}

const gbp = (v: number | null) => (v == null ? "—" : `£${v.toFixed(2)}`);

/**
 * Settings → Business: VAT registration (every profit figure follows it: wholesale screening, the
 * buy plan, Gatekeeper's Gate 6, the Tracker), the VAT rate, the Qogita account's region, and
 * Recalculate all for the saved results.
 */
export function BusinessSettingsTab() {
  const [b, setB] = useState<Business | null>(null);
  const [saved, setSaved] = useState<Business | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const { confirm } = useDialogs();
  const poll = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const timer = poll;
    api<Business>("/api/business").then((r) => { setB(r); setSaved(r); }).catch((e: Error) => setError(e.message));
    watchStatus(undefined, setStatus, timer);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, []);

  if (error) return <ErrorState title="Couldn't load the business settings" message={error} />;
  if (!b || !saved) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const changed = JSON.stringify(b) !== JSON.stringify(saved);
  const basisChanged = b.vatRegistered !== saved.vatRegistered || b.vatRate !== saved.vatRate || b.priceBasis !== saved.priceBasis;

  const save = async () => {
    setBusy(true);
    try {
      const r = await api<{ settings: Business; profilesUpdated: number }>("/api/business", { method: "PUT", json: b });
      setB(r.settings); setSaved(r.settings);
      toast.success("Business settings saved", basisChanged ? { description: `${r.profilesUpdated} screening profile${r.profilesUpdated === 1 ? "" : "s"} now on these settings. Screenings made on the old ones show as stale: Re-check them, or Recalculate all.` } : undefined);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const recalc = async () => {
    if (!(await confirm({ title: "Recalculate all saved results?", description: `Every finished run is re-screened on the current basis (${saved.vatRegistered ? `VAT registered at ${saved.vatRate}%` : "not VAT registered"}) from its stored data: no Amazon or Keepa calls. It runs in the background; the biggest profit changes show here when it's done. Private-label candidates follow the setting at once.`, confirmLabel: "Recalculate all" }))) return;
    setBusy(true);
    try {
      const r = await api<{ jobId: string; runs: number; results: number }>("/api/business/recalculate", { method: "POST" });
      toast.success(`Re-screening ${r.runs} run${r.runs === 1 ? "" : "s"} (${r.results.toLocaleString("en-GB")} results)`);
      if (poll.current) clearTimeout(poll.current);
      await watchStatus(r.jobId, setStatus, poll);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="panel space-y-4 p-4 sm:p-5">
        <div className="space-y-1">
          <h2 className="section-label">VAT</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">Every profit, ROI and margin in the app follows this: wholesale screening and results, the buy plan, the Tracker, and Private label&apos;s Gate 6. Each figure carries a small <b>VAT reg.</b> or <b>Non-VAT</b> tag for the basis it&apos;s on.</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={b.vatRegistered} onCheckedChange={(on) => setB({ ...b, vatRegistered: on })} />
          VAT registered
        </label>
        <div className="grid max-w-xl gap-3 sm:grid-cols-2">
          <label className="space-y-1.5"><span className="field-label">VAT rate (%)</span>
            <Input className="num" type="number" step="any" value={b.vatRate} onChange={(e) => setB({ ...b, vatRate: Number(e.target.value) })} /></label>
        </div>
        <ul className="max-w-3xl list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
          {b.vatRegistered ? <>
            <li>Revenue is the Amazon sale price ÷ {(1 + b.vatRate / 100).toFixed(2)}: the output VAT is HMRC&apos;s.</li>
            <li>Cost of goods is the supplier&apos;s price ex-VAT (a supplier pricing inc-VAT is divided by {(1 + b.vatRate / 100).toFixed(2)}).</li>
            <li>Amazon&apos;s referral, FBA and storage fees count ex-VAT (the VAT on them is reclaimed); the digital services fee stays.</li>
            <li>Import VAT on a private-label order is reclaimed: it isn&apos;t in the landed cost (it&apos;s still cash on the day).</li>
            <li>VAT payable per unit (output VAT less input VAT) shows as information, not a cost.</li>
          </> : <>
            <li>Revenue is the full sale price; VAT on Amazon&apos;s fees and on the goods is a cost.</li>
          </>}
        </ul>
      </section>

      <section className="panel space-y-4 p-4 sm:p-5">
        <div className="space-y-1">
          <h2 className="section-label">Price basis for profit</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">The sell price every screening works profit out at: the referral fee, profit, ROI, margin, the Fee engine gate and the score. Every card also shows the profit at the current Buy Box and at the 90-day median side by side, and says which the gates used. With no current Buy Box (suppressed, no offers) it falls back to the 90-day median and says so. Screenings made on another basis show a <b>stale</b> banner until re-checked.</p>
        </div>
        <label className="block max-w-xl space-y-1.5"><span className="field-label">Price basis</span>
          <NativeSelect className="w-full" value={b.priceBasis} onChange={(e) => setB({ ...b, priceBasis: e.target.value as PriceBasis })}>
            {PRICE_BASES.map((k) => <NativeSelectOption key={k} value={k}>{PRICE_BASIS_LABEL[k]}{k === "lower90" ? " (default)" : ""}</NativeSelectOption>)}
          </NativeSelect></label>
        <p className="max-w-3xl text-xs text-muted-foreground">Current Buy Box matches SellerAmp. Conservative scores on the lower of the current Buy Box and its 90-day median, so a temporary spike doesn&apos;t flatter the profit.</p>
      </section>

      <section className="panel space-y-4 p-4 sm:p-5">
        <div className="space-y-1">
          <h2 className="section-label">Qogita</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">Which Qogita account the app&apos;s login (QOGITA_EMAIL, QOGITA_PASSWORD) is. UK prices come in £ with shipping included and ex-VAT (supplier &ldquo;Qogita UK&rdquo;): no conversion. EU prices are € and converted at the day&apos;s ECB rate (supplier &ldquo;Qogita EU&rdquo;). A pull or import that comes back in the other currency says so.</p>
        </div>
        <label className="block max-w-xs space-y-1.5"><span className="field-label">Region</span>
          <NativeSelect className="w-full" value={b.qogitaRegion} onChange={(e) => setB({ ...b, qogitaRegion: e.target.value as "UK" | "EU" })}>
            <NativeSelectOption value="UK">UK (GBP)</NativeSelectOption>
            <NativeSelectOption value="EU">EU (EUR)</NativeSelectOption>
          </NativeSelect></label>
        <p className="text-xs text-muted-foreground">Each supplier&apos;s <b>Supplier prices are: ex-VAT / inc-VAT</b> is on its page under <Link className="text-brand underline" href="/suppliers">Suppliers</Link>.</p>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={busy || !changed} onClick={save}>{busy && <LoaderIcon className="animate-spin" />} Save</Button>
        {changed && <span className="text-sm text-muted-foreground">Unsaved changes</span>}
      </div>

      <section className="panel space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="section-label">Recalculate all</h2>
            <p className="max-w-3xl text-sm text-muted-foreground">Saved results keep the basis they were screened on until they&apos;re recalculated. This re-screens every finished run from its stored data (no Amazon or Keepa calls) and shows the 20 biggest profit changes.</p>
          </div>
          <Button variant="outline" disabled={busy || changed} onClick={recalc} title={changed ? "Save first" : undefined}><RefreshCwIcon /> Recalculate all</Button>
        </div>
        {status?.job && (
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              {new Date(status.job.started_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {status.job.basis} · {status.done ? `done: ${status.changed.toLocaleString("en-GB")} result${status.changed === 1 ? "" : "s"} changed` : <><LoaderIcon className="inline size-3.5 animate-spin" /> {status.pending} of {status.runs} runs still re-screening</>}
            </p>
            {status.top.length > 0 && (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead><tr className="border-b text-left text-[11px] tracking-wide text-muted-foreground uppercase">
                    <th className="px-2 py-1.5">Product</th><th className="px-2 py-1.5 text-right">Profit before</th><th className="px-2 py-1.5 text-right">After</th><th className="px-2 py-1.5 text-right">Change</th>
                  </tr></thead>
                  <tbody>{status.top.map((c) => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="max-w-96 truncate px-2 py-1.5"><Link className="text-brand hover:underline" href={`/runs/${c.runId}`}>{c.asin ?? "—"}</Link> <span className="text-muted-foreground">{c.title?.slice(0, 70)}</span></td>
                      <td className="num px-2 py-1.5 text-right">{gbp(c.before)}</td>
                      <td className="num px-2 py-1.5 text-right">{gbp(c.after)}</td>
                      <td className={cn("num px-2 py-1.5 text-right font-semibold", c.change > 0 ? "text-pass" : "text-fail")}>{c.change > 0 ? "+" : ""}{gbp(c.change)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
