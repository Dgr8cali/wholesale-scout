"use client";

import { RefreshCwIcon, SparklesIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { StatusChip, type Tone } from "@/components/ui/status-chip";
import { costTxt } from "@/lib/ads/ai";
import { api } from "@/lib/ui/client";

export interface Run<T> { result: T; cached?: boolean; model: string; at: string; costGbp: number; tokens: { input: number; output: number }; uncited?: string[] }

const when = (d: string) => new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** "This explanation cost £0.02 · Claude Sonnet 5.5 · 2 Oct 15:04 (stored: same data)". */
export function CostLine({ run, what }: { run: Run<unknown>; what: string }) {
  return (
    <p className="text-xs text-muted-foreground">
      This {what} cost <b className="text-foreground">{costTxt(run.costGbp)}</b> ({run.tokens.input.toLocaleString("en-GB")} tokens in, {run.tokens.output.toLocaleString("en-GB")} out) · {run.model} · {when(run.at)}
      {run.cached ? " · stored answer: the data hasn't changed, so no new call" : ""}
    </p>
  );
}

/** Figures in the answer that aren't in the data sent: shown, never hidden. */
export function Uncited({ list }: { list?: string[] }) {
  if (!list?.length) return <p className="text-xs text-success">Every figure checked against the data sent.</p>;
  return <p className="text-xs text-warn-ink">Not found in the data sent (check them): {list.join(", ")}</p>;
}

/** See exactly what would be sent (free: no API call). */
export function DataSent({ url }: { url: string }) {
  const [data, setData] = useState<{ context: unknown; contextTokens: number } | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <details className="text-xs" open={open} onToggle={(e) => { const o = (e.target as HTMLDetailsElement).open; setOpen(o); if (o && !data) api<{ context: unknown; contextTokens: number }>(url).then(setData).catch((err: Error) => toast.error(err.message)); }}>
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">The data sent{data ? ` (about ${data.contextTokens.toLocaleString("en-GB")} tokens)` : ""}</summary>
      {data ? <pre className="mt-1 max-h-72 overflow-auto rounded-lg bg-subtle p-2 text-xs">{JSON.stringify(data.context, null, 1)}</pre> : open ? <p className="mt-1 text-muted-foreground">Loading…</p> : null}
    </details>
  );
}

interface Explain { narrative: string; drivers: { title: string; detail: string }[]; proposals_effect: string; numbers_cited: string[] }

/** Explain this product: a short narrative of the period from the app's own figures, on your click. */
export function ExplainPanel({ asin }: { asin: string }) {
  const [run, setRun] = useState<Run<Explain> | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ latest: Run<Explain> | null }>(`/api/ads/ai/explain?asin=${asin}`).then((r) => r.latest && setRun({ ...r.latest, cached: true })).catch(() => {});
  }, [asin]);
  const go = async (force: boolean) => {
    setBusy(true);
    try {
      setRun(await api<Run<Explain>>("/api/ads/ai/explain", { method: "POST", json: { asin, force } }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <SparklesIcon className="size-4 text-link" />
        <span className="text-sm font-semibold">Explain this product</span>
        <InfoTip label="About Explain this product">A short read of the period from these figures (Claude). Facts only from the data; it never sets bids or budgets. It runs only when you click.</InfoTip>
        <span className="ml-auto flex gap-1">
          {run && <Button size="sm" variant="ghost" loading={busy} onClick={() => go(true)} title="Ask again even if the data hasn't changed"><RefreshCwIcon /> Re-run</Button>}
          {!run && <Button size="sm" variant="secondary" loading={busy} onClick={() => go(false)}><SparklesIcon /> Explain</Button>}
        </span>
      </div>
      {busy && run && <p className="text-xs text-muted-foreground">Asking…</p>}
      {run && (
        <div className="space-y-2 text-sm">
          <p className="whitespace-pre-line">{run.result.narrative}</p>
          <ul className="space-y-1">{run.result.drivers.map((d) => <li key={d.title}><b>{d.title}.</b> {d.detail}</li>)}</ul>
          <p><b>The proposals in flight:</b> {run.result.proposals_effect}</p>
          <Uncited list={run.uncited} />
          <CostLine run={run} what="explanation" />
        </div>
      )}
      <DataSent url={`/api/ads/ai/explain?asin=${asin}&preview=1`} />
    </div>
  );
}

interface Targets { launch_target_pct: number; steady_target_pct: number; justification: string; confidence: "low" | "medium" | "high"; warnings?: string[] }

/** Recommend launch and steady targets; Apply writes them (never automatic). */
export function TargetsPanel({ asin, onApplied }: { asin: string; onApplied: () => void }) {
  const [run, setRun] = useState<Run<Targets> | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async (force: boolean) => {
    setBusy(true);
    try {
      setRun(await api<Run<Targets>>("/api/ads/ai/targets", { method: "POST", json: { asin, force } }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const apply = async () => {
    if (!run) return;
    try {
      await api(`/api/ads/products/${asin}`, { method: "PUT", json: { target: { launch: run.result.launch_target_pct, steady: run.result.steady_target_pct } } });
      toast.success(`Targets set: launch ${run.result.launch_target_pct}%, steady ${run.result.steady_target_pct}%`);
      onApplied();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const tone: Record<Targets["confidence"], Tone> = { low: "neutral", medium: "warn", high: "good" };
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <SparklesIcon className="size-4 text-link" />
        <span className="text-sm font-semibold">Recommend targets</span>
        <InfoTip label="About Recommend targets">Launch and steady target ACoS from break-even, reviews, rank, stock cover and conversion (Claude). Nothing changes until you Apply.</InfoTip>
        <span className="ml-auto flex gap-1">
          {run && <Button size="sm" variant="ghost" loading={busy} onClick={() => go(true)}><RefreshCwIcon /> Re-run</Button>}
          {!run && <Button size="sm" variant="secondary" loading={busy} onClick={() => go(false)}><SparklesIcon /> Recommend</Button>}
        </span>
      </div>
      {run && (
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <span>Launch <b className="num">{run.result.launch_target_pct}%</b></span>
            <span>Steady <b className="num">{run.result.steady_target_pct}%</b></span>
            <StatusChip tone={tone[run.result.confidence]}>{run.result.confidence} confidence</StatusChip>
            <Button size="sm" variant="secondary" onClick={apply}>Apply</Button>
          </div>
          <p>{run.result.justification}</p>
          {run.result.warnings?.map((w) => <p key={w} className="text-xs text-warn-ink">{w}</p>)}
          <Uncited list={run.uncited} />
          <CostLine run={run} what="recommendation" />
        </div>
      )}
      <DataSent url={`/api/ads/ai/targets?asin=${asin}&preview=1`} />
    </div>
  );
}
