"use client";

import { CheckIcon, ClockIcon, DownloadIcon, LoaderIcon, Undo2Icon, XIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { usePageCrumbs } from "@/components/Crumbs";
import { EmptyState, ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { RULE_IDS, RULE_LABEL, type Confidence, type RuleId } from "@/lib/ads/rules";
import { api } from "@/lib/ui/client";
import type { NgramData } from "../ngrams/page";
import { cn } from "@/lib/utils";

interface Row {
  id: string; rule: RuleId; asin: string | null; campaign: string | null; campaign_name: string | null; campaign_state: string | null;
  entity: { type: string; label: string; keywordId: string | null; targetId: string | null; adGroupId: string | null; campaignId: string | null };
  current_value: string | null; proposed_value: string | null; reason: string; confidence: Confidence; effect: string | null; grp: string | null;
  clicks: number; orders: number; status: "open" | "approved";
}
interface Data { proposals: Row[]; notes: Partial<Record<RuleId, string[]>>; held: { skipped: number; snoozed: number }; batchesAwaitingUpload: number }

const CONF_CLS: Record<Confidence, string> = { high: "bg-pass-soft text-pass", medium: "bg-warn-soft text-warn", low: "bg-empty-soft text-ink-2" };

/** Ads → Proposals: what the rules suggest, to approve, skip or snooze, and export as a bulk sheet. */
export default function AdsProposalsPage() {
  usePageCrumbs([{ label: "Ads", href: "/ads/dashboard" }, { label: "Proposals" }]);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rule, setRule] = useState<"" | RuleId>("");
  const [conf, setConf] = useState<"" | Confidence>("");
  const [campaign, setCampaign] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const [grams, setGrams] = useState<NgramData | null>(null);
  const load = useCallback(() => api<Data>("/api/ads/proposals").then(setData).catch((e: Error) => setError(e.message)), []);
  useEffect(() => { load(); api<NgramData>("/api/ads/ngrams").then(setGrams).catch(() => {}); }, [load]);

  const shown = useMemo(() => (data?.proposals ?? []).filter((p) => (!rule || p.rule === rule) && (!conf || p.confidence === conf) && (!campaign || p.campaign === campaign)), [data, rule, conf, campaign]);
  const groups = useMemo(() => {
    const byAsin = new Map<string, Map<string, Row[]>>();
    for (const p of shown) {
      const a = p.asin ?? "No ASIN";
      const g = byAsin.get(a) ?? new Map<string, Row[]>();
      const k = `${p.rule}${p.grp ? `|${p.grp}` : ""}`;
      g.set(k, [...(g.get(k) ?? []), p]);
      byAsin.set(a, g);
    }
    return [...byAsin.entries()].map(([asin, g]) => ({ asin, rules: [...g.entries()].sort((a, b) => RULE_IDS.indexOf(a[0].split("|")[0] as RuleId) - RULE_IDS.indexOf(b[0].split("|")[0] as RuleId) || a[0].localeCompare(b[0])) }));
  }, [shown]);

  if (error) return <ErrorState title="Couldn't load the proposals" message={error} />;
  if (!data) return <Skeleton className="h-64 rounded-lg" />;

  const act = async (ids: string[], action: "approve" | "skip" | "snooze" | "reopen") => {
    if (!ids.length) return;
    setBusy(ids.length > 1 ? action : ids[0]);
    try {
      await api("/api/ads/proposals", { method: "POST", json: { ids, action } });
      if (ids.length > 1) toast.success(`${ids.length} proposals ${action === "approve" ? "approved" : action === "skip" ? "skipped" : action === "snooze" ? "snoozed" : "reopened"}`);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const approved = data.proposals.filter((p) => p.status === "approved");
  const highOpen = shown.filter((p) => p.status === "open" && p.confidence === "high");
  const exportSheet = async () => {
    setBusy("export");
    try {
      const r = await api<{ id: string; label: string; rows: number; proposals: number }>("/api/ads/proposals/export", { method: "POST" });
      toast.success(`Batch ${r.label}: ${r.proposals} proposals, ${r.rows} rows. Downloading the sheet…`);
      // The file downloads (attachment): a link click, not a navigation.
      const link = document.createElement("a");
      link.href = `/api/ads/exports/${r.id}`;
      link.download = "";
      link.click();
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const campaigns = [...new Map(data.proposals.filter((p) => p.campaign).map((p) => [p.campaign!, p.campaign_name ?? ""])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const notes = Object.entries(data.notes) as [RuleId, string[]][];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-3xl">
          <h1 className="page-title">Proposals</h1>
          <p className="text-sm text-muted-foreground">What your <Link className="underline" href="/ads/rules">rules</Link> suggest from the imported data. Approve what you agree with, then export the bulk sheet and upload it in Amazon Ads (Campaign manager → Bulk operations). Nothing changes in Amazon Ads until you upload it.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild><Link href="/ads/proposals/exports">Exports{data.batchesAwaitingUpload ? ` (${data.batchesAwaitingUpload} to upload)` : ""}</Link></Button>
          <Button onClick={exportSheet} disabled={!approved.length || busy === "export"}>{busy === "export" ? <LoaderIcon className="animate-spin" /> : <DownloadIcon />} Export bulk sheet ({approved.length} approved)</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1"><span className="field-label">Rule</span>
          <NativeSelect value={rule} onChange={(e) => setRule(e.target.value as "" | RuleId)}>
            <NativeSelectOption value="">All rules</NativeSelectOption>
            {RULE_IDS.map((r) => <NativeSelectOption key={r} value={r}>{RULE_LABEL[r]} ({data.proposals.filter((p) => p.rule === r).length})</NativeSelectOption>)}
          </NativeSelect></label>
        <label className="space-y-1"><span className="field-label">Confidence</span>
          <NativeSelect value={conf} onChange={(e) => setConf(e.target.value as "" | Confidence)}>
            <NativeSelectOption value="">Any</NativeSelectOption>
            {(["high", "medium", "low"] as const).map((c) => <NativeSelectOption key={c} value={c}>{c[0].toUpperCase() + c.slice(1)} ({data.proposals.filter((p) => p.confidence === c).length})</NativeSelectOption>)}
          </NativeSelect></label>
        <label className="space-y-1"><span className="field-label">Campaign</span>
          <NativeSelect value={campaign} onChange={(e) => setCampaign(e.target.value)}>
            <NativeSelectOption value="">All campaigns</NativeSelectOption>
            {campaigns.map(([id, name]) => <NativeSelectOption key={id} value={id}>{name}</NativeSelectOption>)}
          </NativeSelect></label>
        <Button variant="outline" className="ml-auto" disabled={!highOpen.length || busy === "approve"} onClick={() => act(highOpen.map((p) => p.id), "approve")}>
          <CheckIcon /> Approve all high-confidence ({highOpen.length})
        </Button>
      </div>

      {grams && grams.rows.length > 0 && <NgramCard d={grams} />}

      {notes.length > 0 && (
        <details className="panel px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium">What the rules couldn&apos;t check ({notes.reduce((a, [, n]) => a + n.length, 0)})</summary>
          <ul className="mt-2 space-y-1 text-muted-foreground">{notes.flatMap(([r, ns]) => ns.map((n) => <li key={r + n}><b className="text-foreground">{RULE_LABEL[r]}:</b> {n}</li>))}</ul>
        </details>
      )}

      {!data.proposals.length ? (
        <EmptyState title="No proposals">{`Nothing for the rules to change in the data imported.${data.held.skipped + data.held.snoozed ? ` ${data.held.skipped} skipped and ${data.held.snoozed} snoozed proposals are held back.` : ""} Import a newer bulk export to run them again.`}</EmptyState>
      ) : !shown.length ? <p className="text-sm text-muted-foreground">No proposals match the filters.</p> : groups.map((g) => (
        <section key={g.asin} className="space-y-3">
          <h2 className="section-label">{g.asin}</h2>
          {g.rules.map(([k, rows]) => (
            <div key={k} className="overflow-x-auto rounded-lg border">
              <div className="flex items-center gap-2 border-b bg-surface-2 px-3 py-1.5 text-sm font-semibold">
                {RULE_LABEL[k.split("|")[0] as RuleId]}{k.includes("|word-level") && <span className="text-xs font-normal text-muted-foreground">word-level (campaign negative phrase)</span>}
                <span className="text-xs font-normal text-muted-foreground">{rows.length}</span>
              </div>
              <table className="w-full text-sm">
                <tbody>{rows.map((p) => (
                  <tr key={p.id} className={cn("border-b align-top last:border-b-0", p.status === "approved" && "bg-pass-soft/40")}>
                    <td className="w-[28%] px-3 py-2">
                      <div className="font-medium">{p.entity.label}</div>
                      <div className="text-xs text-muted-foreground">{p.entity.type} · {p.campaign_name}{p.campaign_state && /paused/i.test(p.campaign_state) ? " (campaign paused)" : ""}</div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap"><span className="text-muted-foreground">{p.current_value}</span> → <b>{p.proposed_value}</b></td>
                    <td className="px-3 py-2">
                      <p>{p.reason}</p>
                      {p.effect && <p className="text-xs text-muted-foreground">{p.effect}</p>}
                    </td>
                    <td className="px-3 py-2"><span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", CONF_CLS[p.confidence])} title="Low under 10 clicks, medium 10–29, high from 30 clicks or 3 orders">{p.confidence}</span></td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {p.status === "approved" ? (
                        <span className="inline-flex items-center gap-1"><span className="text-xs font-semibold text-pass">Approved</span><Button size="xs" variant="ghost" disabled={!!busy} onClick={() => act([p.id], "reopen")}><Undo2Icon /> Undo</Button></span>
                      ) : (
                        <span className="inline-flex gap-1">
                          <Button size="xs" disabled={!!busy} onClick={() => act([p.id], "approve")}><CheckIcon /> Approve</Button>
                          <Button size="xs" variant="ghost" disabled={!!busy} onClick={() => act([p.id], "skip")} title="Not raised again for 30 days"><XIcon /> Skip</Button>
                          <Button size="xs" variant="ghost" disabled={!!busy} onClick={() => act([p.id], "snooze")} title="Not raised again for 14 days"><ClockIcon /> Snooze 14d</Button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

/** The n-grams wasting most, and what Rules 9 and 10 make of them. */
function NgramCard({ d }: { d: NgramData }) {
  const waste = [...d.rows].filter((r) => r.waste > 0).sort((a, b) => b.waste - a.waste).slice(0, 6);
  const fired = d.rows.filter((r) => r.trigger);
  return (
    <section className="panel space-y-2 p-3 text-sm">
      <div className="flex items-baseline gap-2">
        <h2 className="font-semibold">N-grams</h2>
        <span className="text-xs text-muted-foreground">{fired.length ? `${fired.length} gram${fired.length === 1 ? "" : "s"} fire Rule 9 or 10: ${fired.map((r) => `"${r.gram}" (${r.trigger})`).join(", ")}` : "No gram fires Rule 9 (negative) or Rule 10 (winner) on this data"}</span>
        <Link href="/ads/ngrams" className="ml-auto text-xs font-medium text-brand hover:underline">All n-grams →</Link>
      </div>
      <div className="flex flex-wrap gap-2">{waste.map((r) => (
        <span key={r.asin + r.gram} className="rounded-md bg-surface-2 px-2 py-1 text-xs" title={`${r.clicks} clicks, £${r.cost.toFixed(2)} spent, ${r.orders} orders, in ${r.terms} terms (${r.convertingTerms} with an order)`}>
          <b>{r.gram}</b> · £{r.waste.toFixed(2)} wasted of £{r.cost.toFixed(2)} · {r.terms} terms{r.convertingTerms ? `, ${r.convertingTerms} converting` : ""}
        </span>
      ))}</div>
    </section>
  );
}
