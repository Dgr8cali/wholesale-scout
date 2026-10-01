"use client";

import { LoaderIcon, PlusIcon, TagIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { usePageCrumbs } from "@/components/Crumbs";
import { Dot } from "@/components/pl/bits";
import { valuesOf, type CandidateRow, type ListResponse } from "@/components/pl/types";
import { Workspace } from "@/components/pl/Workspace";
import { EmptyState, ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { evaluate, referralOptions } from "@/lib/pl/gatekeeper";
import { api } from "@/lib/ui/client";
import { ago } from "@/lib/ui/when";
import { cn } from "@/lib/utils";

export default function PrivateLabelPage() {
  return <Suspense><PrivateLabel /></Suspense>;
}

/** Private label: Gatekeeper's eight gates, scorecard and verdict for products you might launch. */
function PrivateLabel() {
  usePageCrumbs([{ label: "Private label" }]);
  const router = useRouter();
  const params = useSearchParams();
  const [list, setList] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const selected = params.get("c");

  const load = useCallback(() => api<ListResponse>("/api/pl/candidates").then(setList).catch((e: Error) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const select = useCallback((id: string | null) => router.replace(id ? `/private-label?c=${id}` : "/private-label", { scroll: false }), [router]);

  useEffect(() => {
    if (list && !selected && list.candidates.length) select(list.candidates[0].id);
  }, [list, selected, select]);

  const scored = useMemo(() => (list ? list.candidates.map((c) => ({ c, ev: evaluate(valuesOf(c.fields), c.category, list.settings, list.card) })) : []), [list]);

  if (error) return <ErrorState title="Couldn't load Private label" message={error} onRetry={load} />;
  if (!list) return <div className="grid gap-5 lg:grid-cols-[260px_1fr]"><Skeleton className="h-80 rounded-xl" /><Skeleton className="h-[70vh] rounded-xl" /></div>;

  const patchRow = (id: string, p: Partial<CandidateRow>) => setList((l) => l && { ...l, candidates: l.candidates.map((c) => (c.id === id ? { ...c, ...p } : c)) });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Private label</h1>
        <p className="text-sm text-muted-foreground">Should ~£1,000 launch your own product into this niche? A candidate must clear every gate <em>and</em> score well; a good score never overrides a failed gate.</p>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[260px_1fr]">
        <aside className="flex flex-col gap-3.5 lg:sticky lg:top-[calc(var(--app-header,56px)+12px)]">
          <div className="panel p-3">
            <h2 className="mb-2 text-sm font-bold">Candidates</h2>
            {!scored.length ? (
              <p className="rounded-lg bg-surface-2 px-3 py-2.5 text-xs text-muted-foreground">No candidates yet. Add one to start scoring.</p>
            ) : (
              <div className="flex max-h-[60vh] flex-col gap-1 overflow-auto">
                {scored.map(({ c, ev }) => (
                  <button key={c.id} type="button" onClick={() => select(c.id)}
                    className={cn("flex w-full flex-col gap-0.5 rounded-lg border border-transparent px-2.5 py-2 text-left hover:bg-surface-2", c.id === selected && "border-brand bg-brand-soft hover:bg-brand-soft")}>
                    <span className="flex items-center gap-2">
                      <Dot status={ev.v.cls} />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium" title={ev.v.title}>{c.name}</span>
                      <span className="num text-xs text-muted-foreground">{ev.sc.answered === 10 ? ev.sc.total : `${ev.sc.answered}/10`}</span>
                    </span>
                    <span className="flex items-center gap-2 pl-4 text-[11px] text-muted-foreground">
                      <span className="rounded border px-1 tracking-wide uppercase">{c.status}</span>
                      <span className="truncate">{c.refreshed_at ? `Keepa ${ago(c.refreshed_at)}` : "not fetched"}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            <Button className="mt-2 w-full" onClick={() => setAdding(true)}><PlusIcon /> New candidate</Button>
          </div>
          <div className="panel p-3 text-xs text-muted-foreground">
            <h2 className="mb-1.5 text-sm font-bold text-foreground">Thresholds</h2>
            Budget {list.settings.budget.toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 })}, min multiple {list.settings.minMultiple}×, steady margin {list.settings.minSteadyMargin}%, {list.settings.q4 >= 1 ? "Q4" : "standard"} rates.{" "}
            <Link className="font-medium text-brand hover:underline" href="/settings?tab=pl">Change in Settings</Link>
            <p className="mt-2">Rate card: {list.card.name}.</p>
          </div>
        </aside>
        <main className="min-w-0">
          {selected && list.candidates.some((c) => c.id === selected) ? (
            <Workspace key={selected} id={selected} settings={list.settings} card={list.card}
              onChanged={(id, p) => patchRow(id, p as Partial<CandidateRow>)}
              onDeleted={(id) => { setList((l) => l && { ...l, candidates: l.candidates.filter((c) => c.id !== id) }); select(null); }} />
          ) : (
            <EmptyState icon={<TagIcon />} title="Score a product against the eight gates"
              action={<Button onClick={() => setAdding(true)}><PlusIcon /> New candidate</Button>}>
              Add a candidate with up to ten page-one ASINs. Keepa fills the market and history gates; the extension fills Opportunity Explorer&apos;s; you type the rest. Each gate ticks pass, warn or fail as you go, and the scorecard totals to a verdict.
            </EmptyState>
          )}
        </main>
      </div>
      <NewCandidate open={adding} onOpenChange={setAdding} list={list} onCreated={async (id) => { await load(); select(id); }} />
    </div>
  );
}

function NewCandidate({ open, onOpenChange, list, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; list: ListResponse; onCreated: (id: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [niche, setNiche] = useState("");
  const [category, setCategory] = useState("Home Products");
  const [asins, setAsins] = useState("");
  const [busy, setBusy] = useState(false);
  const count = new Set(asins.toUpperCase().split(/[\s,;]+/).filter((a) => /^[A-Z0-9]{10}$/.test(a))).size;
  const save = async () => {
    setBusy(true);
    try {
      const r = await api<{ candidate: { id: string }; refresh: { tokensUsed: number; fetched: string[]; missing: string[] } | null }>("/api/pl/candidates", { method: "POST", json: { name, niche_keyword: niche, category, asins } });
      if (r.refresh) toast.success(`Keepa: ${r.refresh.fetched.length} fetched, ${r.refresh.tokensUsed} tokens.${r.refresh.missing.length ? ` Not found on amazon.co.uk: ${r.refresh.missing.join(", ")}.` : ""}`);
      await onCreated(r.candidate.id);
      onOpenChange(false);
      setName(""); setNiche(""); setAsins("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New candidate</DialogTitle>
          <DialogDescription>Keepa is fetched on save: about 3 tokens for the reference listing (with its Buy Box history) and 1–2 for each other ASIN. Snapshots under 7 days old are reused.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <label className="space-y-1.5"><span className="field-label">Name</span><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Working name" autoFocus /></label>
          <label className="space-y-1.5"><span className="field-label">Niche keyword</span><Input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="e.g. bamboo cutlery tray" />
            <span className="block text-2xs text-muted-foreground">As Opportunity Explorer titles the niche: a capture with this title attaches by itself.</span></label>
          <label className="space-y-1.5"><span className="field-label">Referral category</span>
            <NativeSelect className="w-full" value={category} onChange={(e) => setCategory(e.target.value)}>
              {referralOptions(list.card).map((o) => <NativeSelectOption key={o.name} value={o.name}>{o.name} — {o.rates}</NativeSelectOption>)}
            </NativeSelect></label>
          <label className="space-y-1.5"><span className="field-label">Page-one ASINs ({Math.min(count, 10)}/10)</span>
            <Textarea className="num h-32 text-xs" value={asins} onChange={(e) => setAsins(e.target.value)} placeholder={"One per line or comma-separated.\nThe first is the reference listing."} /></label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy || !name.trim()}>{busy && <LoaderIcon className="animate-spin" />}{count ? "Save and fetch Keepa" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
