"use client";

import { ArrowRightIcon, LoaderIcon, PencilIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useDialogs } from "@/components/Dialogs";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { GateResult } from "@/components/ui/status-chip";
import { Textarea } from "@/components/ui/textarea";
import { withAdsDefaults } from "@/lib/pl/adsDefaults";
import { budget, econ, money, referralOptions, type Evaluation } from "@/lib/pl/gatekeeper";
import { landedCost, type Quote } from "@/lib/pl/quotes";
import type { NextAction } from "@/lib/pl/pipeline";
import { api } from "@/lib/ui/client";
import { ago } from "@/lib/ui/when";
import { cn } from "@/lib/utils";
import { STATUSES, valuesOf } from "../types";
import { AsinTable, NotesBox } from "./parts";
import type { CandidateState } from "./useCandidate";

/** One line on a gate: why it isn't a pass, or that it is. */
function gateNote(x: Evaluation["gates"][number]): string {
  if (x.waiver) return `Waived: ${x.waiver.reason}`;
  const bad = x.rows.find((r) => r.status === "fail" && !r.waiver) ?? x.rows.find((r) => r.status === "warn" && !r.waiver);
  if (bad) return `${bad.label}${bad.detail ? `: ${bad.detail}` : ""}`;
  if (x.status === "pass") return `All ${x.rows.length} check${x.rows.length === 1 ? "" : "s"} pass`;
  const answered = x.rows.filter((r) => r.status !== "empty").length;
  return answered ? `${answered} of ${x.rows.length} checks answered` : "Not started";
}

/**
 * The Overview tab: Gatekeeper's summary (each gate in one line), the numbers that decide it, the next
 * action, then the candidate's notes and details (name, niche, category, status, page-one ASINs).
 */
export function OverviewTab({ s, next, action, onDeleted }: { s: CandidateState; next: NextAction | null; action: ReactNode; onDeleted: () => void }) {
  const { data, ev, fields, reload, load } = s;
  const [extras, setExtras] = useState<{ quotes: Quote[]; chosenQuote: string | null; chosenLanded: number | null } | null>(null);
  useEffect(() => { if (data) api<typeof extras>(`/api/pl/candidates/${data.candidate.id}/extras`).then(setExtras).catch(() => setExtras({ quotes: [], chosenQuote: null, chosenLanded: null })); }, [data]);
  if (s.error && !data) return <ErrorState title="Couldn't load the candidate" message={s.error} onRetry={load} />;
  if (!data || !ev) return <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]"><Skeleton className="h-96 rounded-[14px]" /><Skeleton className="h-72 rounded-[14px]" /></div>;

  // Ads per unit as Gate 6 reads them (the CPC defaults when not typed).
  const f = withAdsDefaults(valuesOf(fields), data.adsCpc);
  const e = econ(f, data.settings, data.candidate.category, data.card);
  const b = budget(f, data.settings);
  const landed = extras?.chosenLanded ?? (f.landed ? Number(f.landed) : null);
  const chosen = extras?.quotes.find((q) => q.id === extras.chosenQuote) ?? null;
  const lc = chosen ? landedCost(chosen) : null;
  const beforeAds = e && e.fbaV != null && e.landed != null ? e.revenue - e.referral - e.fbaV - e.landed - e.over : null;
  const breakEven = beforeAds != null && e ? beforeAds / e.sell : null;
  const units = f.units ? Number(f.units) : null;
  const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(0)}%`);

  const numbers: { label: string; value: string; sub?: string; tone?: "good" | "bad" }[] = [
    { label: "Price", value: money(e?.sell ?? (f.sell ? Number(f.sell) : null)), sub: "Gate 0's sell price" },
    { label: "Landed per unit", value: money(landed), sub: extras?.chosenLanded != null ? "the chosen quote" : f.landed ? "Gate 0" : "no quote or Gate 0 figure" },
    { label: "Profit after ads", value: money(e?.pL ?? null), sub: e?.pS != null ? `launch · ${money(e.pS)} steady` : "Gate 6, ads per unit in", tone: e?.pL == null ? undefined : e.pL >= 0 ? "good" : "bad" },
    { label: "First order", value: b ? money(b.stock) : "—", sub: units != null ? `${units.toLocaleString("en-GB")} units (Gate 7)` : "Gate 7's units × landed" },
    { label: "Goods + freight", value: lc ? money(lc.goods + lc.freight) : "—", sub: lc ? `${chosen!.supplier_name}: ${money(lc.goods)} + ${money(lc.freight)}` : "from the chosen quote" },
    { label: "Break-even ACoS", value: pct(breakEven), sub: "margin before ads ÷ price" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <section className="panel p-4" aria-labelledby="gk-title">
          <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
            <h2 id="gk-title" className="text-base font-semibold">Gatekeeper</h2>
            <span className="text-meta text-muted-foreground">{ev.passed} of 8 gates passed · {ev.sc.answered === 10 ? `${ev.sc.total}/30 · ${ev.v.title}` : `${ev.sc.answered} of 10 score lines in`}</span>
          </div>
          <ol className="divide-y divide-divider">
            {ev.gates.map((x) => (
              <li key={x.g.id}>
                <Link href={`?tab=gates&gate=${x.g.n}`} className="flex items-center gap-3 py-2.5 hover:bg-accent/50">
                  <span className="num flex size-7 flex-none items-center justify-center rounded-md bg-muted text-xs font-semibold">{x.g.n}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{x.g.title}</span>
                    <span className="block text-meta text-muted-foreground">{gateNote(x)}</span>
                  </span>
                  <GateResult status={x.waiver ? "pass" : x.status === "empty" ? null : x.status} />
                </Link>
              </li>
            ))}
          </ol>
        </section>
        <div className="space-y-4">
          <section className="panel p-4" aria-labelledby="numbers-title">
            <h2 id="numbers-title" className="mb-2 text-base font-semibold">The numbers</h2>
            <dl className="divide-y divide-divider">
              {numbers.map((n) => (
                <div key={n.label} className="flex items-baseline justify-between gap-3 py-2">
                  <dt className="min-w-0"><span className="block text-sm">{n.label}</span>{n.sub && <span className="block text-xs text-muted-foreground">{n.sub}</span>}</dt>
                  <dd className={cn("num flex-none text-base font-medium", n.tone === "good" && "text-success", n.tone === "bad" && "text-danger")}>{n.value}</dd>
                </div>
              ))}
            </dl>
          </section>
          {next && (
            <section className="panel space-y-2 border-primary/40 bg-primary-soft/40 p-4" aria-labelledby="next-title">
              <h2 id="next-title" className="text-xs font-semibold tracking-[0.06em] text-primary-ink uppercase">Next</h2>
              <p className="text-base font-semibold">{next.label}</p>
              <p className="text-sm text-muted-foreground">{next.detail}</p>
              {action}
            </section>
          )}
          <NextNote key={data.candidate.next_action_note ?? ""} saved={data.candidate.next_action_note ?? ""} onSave={(v) => s.patch({ next_action_note: v }, v ? "Next-action note saved" : "Next-action note cleared")} />
        </div>
      </div>
      <Details s={s} onDeleted={onDeleted} onRefreshed={reload} />
    </div>
  );
}

/** Notes, name, niche keyword, category, status, the page-one ASINs and Keepa: what the old header held. */
function Details({ s, onDeleted, onRefreshed }: { s: CandidateState; onDeleted: () => void; onRefreshed: () => Promise<unknown> }) {
  const { data, patch } = s;
  const { confirm, prompt } = useDialogs();
  const router = useRouter();
  const c = data!.candidate;
  const [name, setName] = useState(c.name);
  const [niche, setNiche] = useState(c.niche_keyword ?? "");
  const [asinText, setAsinText] = useState(data!.asins.map((a) => a.asin).join("\n"));
  const [editAsins, setEditAsins] = useState(false);
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    setBusy(true);
    try {
      const r = await api<{ tokensUsed: number; fetched: string[]; reused: string[]; missing: string[]; skippedManual: string[]; keepa: boolean; exhausted: boolean }>(`/api/pl/candidates/${c.id}/refresh`, { method: "POST" });
      await onRefreshed();
      if (!r.keepa) toast.error("Keepa isn't configured: set KEEPA_API_KEY.");
      else toast.success(`Keepa: ${r.fetched.length} fetched, ${r.reused.length} reused (under 7 days old), ${r.tokensUsed} token${r.tokensUsed === 1 ? "" : "s"}.${r.skippedManual.length ? ` ${r.skippedManual.length} manual field${r.skippedManual.length === 1 ? "" : "s"} kept.` : ""}${r.missing.length ? ` Not found: ${r.missing.join(", ")}.` : ""}${r.exhausted ? " Keepa ran out of tokens." : ""}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const park = async () => {
    const reason = await prompt({ title: `Park "${c.name}"?`, description: "Shelved, not deleted: it leaves the board (Show parked lists it), keeps every gate, quote and note, and Unpark puts it back where it was.", label: "Why (e.g. waiting for Q1 prices; supplier MOQ too high for now)", confirmLabel: "Park it" });
    if (reason) await patch({ status: "parked", park_reason: reason }, "Parked");
  };
  const remove = async () => {
    if (!(await confirm({ title: `Delete “${c.name}”?`, description: "Its fields, ASINs, quotes, checklist and Opportunity Explorer captures go with it.", confirmLabel: "Delete", destructive: true }))) return;
    await api(`/api/pl/candidates/${c.id}`, { method: "DELETE" });
    toast.success(`${c.name} deleted`);
    onDeleted();
    router.push("/pl");
  };
  return (
    <section className="panel space-y-4 p-4" aria-labelledby="details-title">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="details-title" className="mr-auto text-base font-semibold">Details</h2>
        <span className="text-xs text-muted-foreground">{c.refreshed_at ? `Keepa ${ago(c.refreshed_at)}` : "Not fetched"} · {c.token_cost} token{c.token_cost === 1 ? "" : "s"} so far</span>
        <Button size="sm" variant="secondary" onClick={refresh} disabled={busy || !data!.asins.length}>{busy ? <LoaderIcon className="animate-spin" /> : <RefreshCwIcon />} Refresh from Keepa</Button>
      </div>
      <NotesBox key={c.id} initial={c.notes ?? ""} onSave={async (notes) => { await patch({ notes }); }} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1.5"><span className="field-label">Product</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== c.name && patch({ name: name.trim() })} /></label>
        <label className="space-y-1.5"><span className="field-label">Niche keyword</span>
          <Input value={niche} placeholder="As Opportunity Explorer names it" onChange={(e) => setNiche(e.target.value)} onBlur={() => niche !== (c.niche_keyword ?? "") && patch({ niche_keyword: niche })} /></label>
        <label className="space-y-1.5"><span className="field-label">Referral category</span>
          <NativeSelect className="w-full" value={c.category} onChange={(e) => patch({ category: e.target.value })}>
            {referralOptions(data!.card).map((o) => <NativeSelectOption key={o.name} value={o.name}>{o.name} — {o.rates}</NativeSelectOption>)}
          </NativeSelect></label>
        <label className="space-y-1.5"><span className="field-label">Status</span>
          <NativeSelect className="w-full" value={c.status} onChange={(e) => (e.target.value === "parked" ? park() : patch({ status: e.target.value }))}>
            {STATUSES.map((x) => <NativeSelectOption key={x} value={x}>{x[0].toUpperCase() + x.slice(1)}</NativeSelectOption>)}
          </NativeSelect></label>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="field-label">Page-one ASINs ({data!.asins.length}/10, the first is the reference)</span>
          <Button variant="ghost" size="sm" onClick={() => setEditAsins((v) => !v)}><PencilIcon /> {editAsins ? "Cancel" : "Edit"}</Button>
        </div>
        {editAsins ? (
          <div className="flex flex-col gap-2">
            <Textarea className="num h-28 text-xs" value={asinText} onChange={(e) => setAsinText(e.target.value)} placeholder="One per line or comma-separated, up to 10" />
            <div><Button size="sm" variant="secondary" onClick={async () => { if (await patch({ asins: asinText })) { setEditAsins(false); void refresh(); } }}>Save and refresh</Button></div>
          </div>
        ) : <AsinTable data={data!} />}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-divider pt-3">
        <Link href="/pl" className="link inline-flex items-center gap-1 text-sm">Pipeline <ArrowRightIcon className="size-3.5" /></Link>
        <Button variant="danger" size="sm" className="ml-auto" onClick={remove}><Trash2Icon /> Delete candidate</Button>
      </div>
    </section>
  );
}

/** Your own note on what to do next (Ask Scout can propose one, for you to confirm). */
function NextNote({ saved, onSave }: { saved: string; onSave: (v: string) => Promise<boolean> }) {
  const [v, setV] = useState(saved);
  const [busy, setBusy] = useState(false);
  const long = v.trim().length > 300;
  return (
    <section className="panel space-y-2 p-4">
      <label className="block space-y-1.5">
        <span className="field-label">Your next-action note</span>
        <Input value={v} onChange={(e) => setV(e.target.value)} placeholder="e.g. Chase Tina for production and transit days" aria-invalid={long} />
      </label>
      {long && <p className="text-xs text-danger">Keep it under 300 characters</p>}
      <Button size="sm" variant="secondary" disabled={v.trim() === saved.trim() || long} loading={busy} onClick={async () => { setBusy(true); await onSave(v.trim()); setBusy(false); }}>Save note</Button>
    </section>
  );
}
