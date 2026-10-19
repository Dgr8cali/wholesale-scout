"use client";

import { CheckIcon, ClockIcon, DownloadIcon, LightbulbIcon, Undo2Icon, XIcon } from "lucide-react";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { ExportsTab } from "@/components/ads/ExportsTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTab } from "@/lib/ui/useTab";
import { PageHeader } from "@/components/ui/page-header";
import { StatusChip, type Tone } from "@/components/ui/status-chip";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { RULE_IDS, RULE_LABEL, type Confidence, type RuleId } from "@/lib/ads/rules";
import { ProductPicker, useAdsProduct } from "@/components/ads/ProductPicker";
import { api } from "@/lib/ui/client";
import type { NgramData } from "../ngrams/page";

interface Row {
  id: string; rule: RuleId; asin: string | null; campaign: string | null; campaign_name: string | null; campaign_state: string | null;
  entity: { type: string; label: string; keywordId: string | null; targetId: string | null; adGroupId: string | null; campaignId: string | null };
  current_value: string | null; proposed_value: string | null; reason: string; confidence: Confidence; effect: string | null; grp: string | null;
  clicks: number; orders: number; status: "open" | "approved";
}
interface Data { proposals: Row[]; notes: Partial<Record<RuleId, string[]>>; held: { skipped: number; snoozed: number }; batchesAwaitingUpload: number }

const CONF_TONE: Record<Confidence, Tone> = { high: "good", medium: "warn", low: "neutral" };
const CONF_RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

/** Ads → Proposals: what the rules suggest, to approve, skip or snooze, and export as a bulk sheet. */
export default function AdsProposalsPage() {
  return <Suspense><AdsProposals /></Suspense>;
}

const TABS = ["review", "exports"] as const;
type Tab = (typeof TABS)[number];

function AdsProposals() {
  // ?asin= (the product picker) is the To review tab's, but survives a trip to Exports.
  const [tab, setTab] = useTab(TABS, ["asin"]);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rule, setRule] = useState<"" | RuleId>("");
  const [conf, setConf] = useState<"" | Confidence>("");
  const [campaign, setCampaign] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const productIds = useMemo(() => [...new Set((data?.proposals ?? []).map((p) => p.asin).filter((a): a is string => !!a))].sort(), [data]);
  const [pick, setPick] = useAdsProduct(productIds, { ready: !!data });

  const [grams, setGrams] = useState<NgramData | null>(null);
  const load = useCallback(() => api<Data>("/api/ads/proposals").then(setData).catch((e: Error) => setError(e.message)), []);
  useEffect(() => { load(); api<NgramData>("/api/ads/ngrams").then(setGrams).catch(() => {}); }, [load]);

  const shown = useMemo(() => (data?.proposals ?? []).filter((p) => (!pick || p.asin === pick) && (!rule || p.rule === rule) && (!conf || p.confidence === conf) && (!campaign || p.campaign === campaign)), [data, pick, rule, conf, campaign]);
  // Product, then the rules' order, then the most confident first.
  const rows = useMemo(() => [...shown].sort((a, b) => (a.asin ?? "").localeCompare(b.asin ?? "") || RULE_IDS.indexOf(a.rule) - RULE_IDS.indexOf(b.rule) || CONF_RANK[b.confidence] - CONF_RANK[a.confidence]), [shown]);

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
      setTab("exports");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const campaigns = [...new Map(data.proposals.filter((p) => p.campaign).map((p) => [p.campaign!, p.campaign_name ?? ""])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const notes = Object.entries(data.notes) as [RuleId, string[]][];

  const columns: DataColumn<Row>[] = [
    {
      id: "entity", header: "Entity", mobile: "title", sortValue: (p) => p.entity.label, className: "min-w-[12rem]",
      cell: (p) => (
        <div className="min-w-0">
          <div className="font-medium">{p.entity.label}</div>
          <div className="text-meta text-muted-foreground">{p.entity.type} · {p.campaign_name}{p.campaign_state && /paused/i.test(p.campaign_state) ? " (campaign paused)" : ""}{p.asin && <> · <span className="num">{p.asin}</span></>}</div>
        </div>
      ),
    },
    { id: "rule", header: "Rule", sortValue: (p) => RULE_IDS.indexOf(p.rule), cell: (p) => <span className="whitespace-nowrap">{RULE_LABEL[p.rule]}{p.grp === "word-level" && <span className="block text-meta text-muted-foreground">word-level</span>}</span> },
    { id: "change", header: "Change", mobile: 1, sortValue: (p) => p.proposed_value, cell: (p) => <span className="whitespace-nowrap"><span className="text-muted-foreground">{p.current_value}</span> → <b>{p.proposed_value}</b></span> },
    { id: "reason", header: "Reason", sortValue: (p) => p.reason, className: "min-w-[18rem]", cell: (p) => <><p>{p.reason}</p>{p.effect && <p className="text-meta text-muted-foreground">{p.effect}</p>}</> },
    { id: "confidence", header: "Confidence", mobile: 2, sortValue: (p) => CONF_RANK[p.confidence], cell: (p) => <StatusChip tone={CONF_TONE[p.confidence]} title="Low under 10 clicks, medium 10–29, high from 30 clicks or 3 orders">{p.confidence}</StatusChip> },
    {
      id: "act", header: <span className="sr-only">Actions</span>, mobile: 3, className: "text-right whitespace-nowrap",
      cell: (p) => p.status === "approved" ? (
        <span className="inline-flex items-center gap-1"><StatusChip tone="good">Approved</StatusChip><Button size="sm" variant="ghost" disabled={!!busy} onClick={() => act([p.id], "reopen")}><Undo2Icon /> Undo</Button></span>
      ) : (
        <span className="inline-flex gap-1">
          <Button size="sm" variant="secondary" loading={busy === p.id} disabled={!!busy} onClick={() => act([p.id], "approve")}><CheckIcon /> Approve</Button>
          <Button size="icon-sm" variant="ghost" disabled={!!busy} onClick={() => act([p.id], "skip")} title="Skip: not raised again for 30 days" aria-label="Skip (30 days)"><XIcon /></Button>
          <Button size="icon-sm" variant="ghost" disabled={!!busy} onClick={() => act([p.id], "snooze")} title="Snooze: not raised again for 14 days" aria-label="Snooze 14 days"><ClockIcon /></Button>
        </span>
      ),
    },
  ];
  const held = data.held.skipped + data.held.snoozed;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Proposals"
        crumbs={[{ label: "Ads", href: "/ads/dashboard" }, { label: "Proposals" }]}
        subtitle={tab === "review" ? "What your rules suggest. Approve what you agree with, then export the bulk sheet." : "Every bulk sheet: download it, mark it uploaded, revert or discard it."}
        info={<>
          <p>Proposals come from your <Link className="text-primary underline" href="/ads/rules">rules</Link>, run on the imported data. Approve what you agree with, then export the bulk sheet and upload it in Amazon Ads (Campaign manager → Bulk operations).</p>
          <p>Nothing changes in Amazon Ads until you upload it. Skip keeps a proposal away for 30 days, Snooze for 14. Confidence: low under 10 clicks, medium 10–29, high from 30 clicks or 3 orders.</p>
        </>}
        actions={<>
          <Button onClick={exportSheet} disabled={!approved.length} loading={busy === "export"} title={approved.length ? undefined : "Approve a proposal first"}><DownloadIcon /> Export bulk sheet ({approved.length})</Button>
        </>}
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-6">
        <TabsList aria-label="Proposals">
          <TabsTrigger value="review" className="px-3"><LightbulbIcon /> To review{data.proposals.some((p) => p.status === "open") && <span className="num text-muted-foreground"> {data.proposals.filter((p) => p.status === "open").length}</span>}</TabsTrigger>
          <TabsTrigger value="exports" className="px-3"><DownloadIcon /> Exports{data.batchesAwaitingUpload ? <span className="text-warn-ink"> <span className="num">{data.batchesAwaitingUpload}</span> to upload</span> : null}</TabsTrigger>
        </TabsList>
        <TabsContent value="exports"><ExportsTab /></TabsContent>
        <TabsContent value="review" className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        {(productIds.length > 1 || (!!pick && !productIds.includes(pick))) && <ProductPicker products={productIds.map((asin) => ({ asin }))} value={pick} onChange={setPick} />}
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
        <label className="min-w-0 space-y-1"><span className="field-label">Campaign</span>
          <NativeSelect value={campaign} onChange={(e) => setCampaign(e.target.value)} className="max-w-[min(20rem,calc(100vw-2rem))]">
            <NativeSelectOption value="">All campaigns</NativeSelectOption>
            {campaigns.map(([id, name]) => <NativeSelectOption key={id} value={id}>{name}</NativeSelectOption>)}
          </NativeSelect></label>
        <Button variant="secondary" className="sm:ml-auto" disabled={!highOpen.length} loading={busy === "approve"} onClick={() => act(highOpen.map((p) => p.id), "approve")}>
          <CheckIcon /> Approve all high-confidence ({highOpen.length})
        </Button>
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(p) => p.id}
        storageKey="ads.proposals"
        caption="Proposals"
        rowClassName={(p) => (p.status === "approved" ? "bg-success-soft/40" : undefined)}
        empty={data.proposals.length
          ? { icon: <LightbulbIcon />, title: "No proposals match the filters", description: "Clear a filter to see the rest.", action: <Button variant="secondary" onClick={() => { setRule(""); setConf(""); setCampaign(""); setPick(""); }}>Clear filters</Button> }
          : { icon: <LightbulbIcon />, title: "No proposals", description: `Nothing for the rules to change in the data imported.${held ? ` ${data.held.skipped} skipped and ${data.held.snoozed} snoozed are held back.` : ""}`, action: <Button asChild><Link href="/ads/dashboard?import=1">Import a newer bulk export</Link></Button> }}
      />

      {grams && grams.rows.length > 0 && <NgramCard d={grams} />}

      {notes.length > 0 && (
        <details className="panel px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium">What the rules couldn&apos;t check ({notes.reduce((a, [, n]) => a + n.length, 0)})</summary>
          <ul className="mt-2 space-y-1 text-muted-foreground">{notes.flatMap(([r, ns]) => ns.map((n) => <li key={r + n}><b className="text-foreground">{RULE_LABEL[r]}:</b> {n}</li>))}</ul>
        </details>
      )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** The n-grams wasting most, and what Rules 9 and 10 make of them. */
function NgramCard({ d }: { d: NgramData }) {
  const waste = [...d.rows].filter((r) => r.waste > 0).sort((a, b) => b.waste - a.waste).slice(0, 6);
  const fired = d.rows.filter((r) => r.trigger);
  return (
    <section className="panel space-y-3 p-4 text-sm">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="font-semibold">N-grams</h2>
        <span className="text-xs text-muted-foreground">{fired.length ? `${fired.length} gram${fired.length === 1 ? "" : "s"} fire Rule 9 or 10: ${fired.map((r) => `"${r.gram}" (${r.trigger})`).join(", ")}` : "No gram fires Rule 9 (negative) or Rule 10 (winner) on this data"}</span>
        <Link href="/ads/ngrams" className="ml-auto text-xs font-medium whitespace-nowrap text-primary hover:underline">All n-grams →</Link>
      </div>
      <div className="flex flex-wrap gap-2">{waste.map((r) => (
        <span key={r.asin + r.gram} className="rounded-full bg-subtle px-3 py-1 text-xs" title={`${r.clicks} clicks, £${r.cost.toFixed(2)} spent, ${r.orders} orders, in ${r.terms} terms (${r.convertingTerms} with an order)`}>
          <b>{r.gram}</b> · £{r.waste.toFixed(2)} wasted of £{r.cost.toFixed(2)} · {r.terms} terms{r.convertingTerms ? `, ${r.convertingTerms} converting` : ""}
        </span>
      ))}</div>
    </section>
  );
}
