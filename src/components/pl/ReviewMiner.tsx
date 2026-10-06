"use client";

import { ExternalLinkIcon, LoaderIcon, RefreshCwIcon, SparklesIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CostLine, DataSent, Uncited, type Run } from "@/components/ads/AiPanels";
import { SortTh, useSortable } from "@/components/SortableTable";
import { Button } from "@/components/ui/button";
import { reviewBoxes } from "@/lib/pl/reviewBoxes";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { PlAsin } from "@/lib/pl/fill";
import { mineThemes, reviewsOf, sixWordsDraft, splitReviews, type ReviewSummary, type SynonymGroup, type Theme } from "@/lib/pl/reviews";
import { api } from "@/lib/ui/client";
import { cn } from "@/lib/utils";
import type { FieldMap } from "./types";

type Mark = "chosen" | "not fixable" | "ignore";
interface Data { dumps: { asin: string; text: string; pasted_at: string; captured?: { total: number; inDump: number; at: string | null } | null; removed_at?: string | null; kept_separate?: boolean }[]; marks: Record<string, Mark>; synonyms: SynonymGroup[]; summary: Run<ReviewSummary> | null }

const criticalUrl = (asin: string) => `https://www.amazon.co.uk/product-reviews/${asin}/?filterByStar=critical&sortBy=recent&reviewerType=all_reviews`;

/**
 * Gate 4: paste each top listing's 1–3★ reviews; the themes are mined here, in the browser (no API),
 * and the theme you pick fills the gate's share and draft six words. Claude only on a click.
 */
export function ReviewMiner({ candidateId, asins, product, fields, onSave, onAsinsChanged }: {
  candidateId: string; asins: PlAsin[]; product: string; fields: FieldMap;
  onSave: (k: string, v: string, delay?: number) => void;
  /** An ASIN was added to the candidate from here: reload it. */
  onAsinsChanged?: () => void;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [all, setAll] = useState("");
  const [showIgnored, setShowIgnored] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  // Reloaded when the candidate's ASINs change (added, removed): their reviews' labels follow.
  const asinKey = asins.map((a) => a.asin).join(",");
  useEffect(() => {
    api<Data>(`/api/pl/candidates/${candidateId}/reviews`).then((d) => {
      setData(d);
      setDrafts(Object.fromEntries(d.dumps.map((x) => [x.asin, x.text])));
      const on = new Set(asinKey.split(","));
      for (const x of d.dumps.filter((y) => !on.has(y.asin) && !y.removed_at && !y.kept_separate)) {
        toast(`Reviews received for ${x.asin}, which isn't on this candidate — add it?`, { duration: 10_000, description: "Add it to the page-one ASINs, or keep its reviews separate (its box stays in Gate 4)." });
      }
    }).catch((e: Error) => toast.error(e.message));
  }, [candidateId, asinKey]);

  const reviews = useMemo(() => (data ? reviewsOf(data.dumps) : []), [data]);
  const mined = useMemo(() => (data ? mineThemes(reviews, data.synonyms) : { total: 0, themes: [] as Theme[] }), [data, reviews]);

  if (!data) return <p className="text-xs text-muted-foreground">Loading the reviews…</p>;

  const take = (d: Data) => { setData(d); setDrafts((x) => ({ ...x, ...Object.fromEntries(d.dumps.map((y) => [y.asin, y.text])) })); };
  const saveOne = async (asin: string) => {
    const text = drafts[asin] ?? "";
    if (text === (data.dumps.find((x) => x.asin === asin)?.text ?? "")) return;
    try {
      take(await api<Data>(`/api/pl/candidates/${candidateId}/reviews`, { method: "PUT", json: { asin, text } }));
      toast.success(text.trim() ? `${asin}: ${splitReviews(asin, text).length} reviews saved` : `${asin}: cleared`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const saveAll = async () => {
    setBusy("all");
    try {
      const r = await api<Data & { asins: string[]; ignoredChars: number }>(`/api/pl/candidates/${candidateId}/reviews`, { method: "PUT", json: { all } });
      take(r);
      setAll("");
      toast.success(`Saved reviews for ${r.asins.join(", ")}${r.ignoredChars ? ` (text before the first "ASIN:" line ignored)` : ""}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const mark = async (theme: string, m: Mark | null) => {
    try {
      take(await api<Data>(`/api/pl/candidates/${candidateId}/reviews`, { method: "PATCH", json: { theme, mark: m } }));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  /** Use a theme for Gate 4: its share and a draft six words; then you answer "fixable?". */
  const choose = async (t: Theme) => {
    await mark(t.theme, "chosen");
    onSave("complaintPct", String(Math.round(t.pct)), 0);
    onSave("sixWordsText", sixWordsDraft(t.theme, product), 0);
    toast.success(`Gate 4: ${Math.round(t.pct)}% of negative reviews, and a draft six words. Now answer: can a factory fix it?`);
  };
  const chosen = mined.themes.find((t) => data.marks[t.theme] === "chosen") ?? null;
  const pasted = new Set(data.dumps.map((d) => d.asin));
  const boxes = reviewBoxes(asins, data.dumps);
  const offAction = async (asin: string, action: "add-asin" | "keep-separate") => {
    setBusy(`${action}:${asin}`);
    try {
      take(await api<Data>(`/api/pl/candidates/${candidateId}/reviews`, { method: "POST", json: { action, asin } }));
      if (action === "add-asin") { toast.success(`${asin} added to the candidate: Refresh from Keepa to fill it in`); onAsinsChanged?.(); }
      else toast.success(`${asin}'s reviews kept separate`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const rows = mined.themes.filter((t) => showIgnored || data.marks[t.theme] !== "ignore");
  const ignored = mined.themes.filter((t) => data.marks[t.theme] === "ignore").length;

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div>
        <h3 className="text-sm font-semibold">Mine the reviews</h3>
        <p className="max-w-[75ch] text-xs text-muted-foreground">
          Open each listing&apos;s critical reviews, select the page&apos;s text (Ctrl+A, Ctrl+C) and paste it below; more pages can follow in the same box. Or, with the extension (0.5.2+), click through the review pages and press <b>Send reviews to Private label</b>: they land here on their own. The reviews are split and the complaint phrases counted here, in your browser: nothing is sent anywhere.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {boxes.map((a) => {
          const text = drafts[a.asin] ?? "";
          const n = text.trim() ? splitReviews(a.asin, text).length : 0;
          const cap = data.dumps.find((d) => d.asin === a.asin)?.captured;
          return (
            <label key={a.asin} className="block space-y-1">
              <span className="flex flex-wrap items-center gap-2 text-xs">
                <span className="num font-medium">{a.asin}</span>
                {a.brand && <span className="text-muted-foreground">{a.brand}</span>}
                {a.state === "removed" && <span className="rounded-full bg-empty-soft px-1.5 py-px text-[10px] text-ink-2" title="This ASIN is no longer on the candidate; its reviews are kept and still mined">removed from candidate</span>}
                {a.state === "separate" && <span className="rounded-full bg-empty-soft px-1.5 py-px text-[10px] text-ink-2" title="Not on the candidate; its reviews are kept and still mined">kept separate</span>}
                <a className="inline-flex items-center gap-1 text-brand hover:underline" target="_blank" rel="noreferrer" href={criticalUrl(a.asin)}>1–3★ reviews <ExternalLinkIcon className="size-3" /></a>
                {cap && <span className="rounded-full bg-brand-soft px-1.5 py-px text-[10px] text-brand" title={`Sent by the extension from Amazon's review pages${cap.at ? `, last ${new Date(cap.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}. ${cap.total - cap.inDump} at 4–5★ kept out of the miner. Editing the text here makes it your paste.`}>from the extension: {cap.total} ({cap.inDump} at 1–3★)</span>}
                <span className="ml-auto text-muted-foreground">{n ? `${n} review${n === 1 ? "" : "s"}${pasted.has(a.asin) ? "" : " (not saved)"}` : "none yet"}</span>
              </span>
              {a.state === "pending" && (
                <span className="flex flex-wrap items-center gap-2 rounded-md bg-warn-soft px-2 py-1 text-xs text-warn">
                  Reviews received for {a.asin}, which isn&apos;t on this candidate — add it?
                  <Button size="xs" variant="outline" disabled={!!busy} onClick={(e) => { e.preventDefault(); offAction(a.asin, "add-asin"); }}>{busy === `add-asin:${a.asin}` && <LoaderIcon className="animate-spin" />} Add</Button>
                  <Button size="xs" variant="ghost" disabled={!!busy} onClick={(e) => { e.preventDefault(); offAction(a.asin, "keep-separate"); }}>Keep separate</Button>
                </span>
              )}
              <Textarea rows={4} className="text-xs" placeholder="Paste the critical reviews page here" value={text}
                onChange={(e) => setDrafts((d) => ({ ...d, [a.asin]: e.target.value }))} onBlur={() => saveOne(a.asin)} />
            </label>
          );
        })}
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Paste all: several listings in one box</summary>
        <div className="mt-2 space-y-2">
          <p className="text-muted-foreground">Start each listing&apos;s reviews with a line <code>ASIN: B0…</code>. Each listing&apos;s paste replaces what was saved for it.</p>
          <Textarea rows={6} className="text-xs" placeholder={"ASIN: B0XXXXXXXX\n…reviews…\n\nASIN: B0YYYYYYYY\n…reviews…"} value={all} onChange={(e) => setAll(e.target.value)} />
          <Button size="sm" variant="outline" disabled={!all.trim() || busy === "all"} onClick={saveAll}>{busy === "all" && <LoaderIcon className="animate-spin" />} Split and save</Button>
        </div>
      </details>

      {mined.total > 0 && (
        <>
          <p className="text-xs text-muted-foreground"><b className="text-foreground">{mined.total}</b> negative reviews across {new Set(reviews.map((r) => r.asin)).size} listing{new Set(reviews.map((r) => r.asin)).size === 1 ? "" : "s"}. A theme counts each review once.</p>
          {chosen && <ChosenTheme theme={chosen} fields={fields} onSave={onSave} onNotFixable={() => mark(chosen.theme, "not fixable")} />}
          <ThemesTable themes={rows} marks={data.marks} onChoose={choose} onMark={mark} />
          {ignored > 0 && <button type="button" className="text-xs text-brand hover:underline" onClick={() => setShowIgnored((s) => !s)}>{showIgnored ? "Hide" : "Show"} {ignored} ignored theme{ignored === 1 ? "" : "s"}</button>}
          <Summary candidateId={candidateId} initial={data.summary} />
        </>
      )}
      <Synonyms groups={data.synonyms} onSaved={(synonyms) => setData((d) => d && { ...d, synonyms })} />
    </div>
  );
}

function ThemesTable({ themes, marks, onChoose, onMark }: { themes: Theme[]; marks: Record<string, Mark>; onChoose: (t: Theme) => void; onMark: (theme: string, m: Mark | null) => void }) {
  const t = useSortable("pl.reviewThemes", themes, {
    theme: { value: (x) => x.theme, kind: "text" },
    reviews: { value: (x) => x.reviews, kind: "number" },
    pct: { value: (x) => x.pct, kind: "number" },
    asins: { value: (x) => x.asins.length, kind: "number" },
  });
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left text-[11px] tracking-wide text-muted-foreground uppercase">
          <SortTh {...t.th("theme")} className="px-2 py-1.5">Theme</SortTh>
          <SortTh {...t.th("reviews")} numeric className="px-2 py-1.5 text-right">Reviews</SortTh>
          <SortTh {...t.th("pct")} numeric className="px-2 py-1.5 text-right">% of negative</SortTh>
          <SortTh {...t.th("asins")} numeric className="px-2 py-1.5">Listings</SortTh>
          <th className="px-2 py-1.5">Examples</th><th className="px-2 py-1.5" />
        </tr></thead>
        <tbody>{t.rows.map((x) => {
          const m = marks[x.theme];
          return (
            <tr key={x.theme} className={cn("border-b align-top last:border-b-0", m === "chosen" && "bg-brand-soft/40", (m === "not fixable" || m === "ignore") && "text-muted-foreground")}>
              <td className="px-2 py-1.5">
                <b className={cn(m === "ignore" && "line-through")}>{x.theme}</b>
                {x.kind === "group" && <span className="ml-1 text-[10px] text-muted-foreground uppercase" title="Any of the synonym group's words">group</span>}
                {m && m !== "ignore" && <span className={cn("ml-1 rounded-full px-1.5 py-px text-[10px] font-semibold", m === "chosen" ? "bg-brand text-white" : "bg-empty-soft text-ink-2")}>{m === "chosen" ? "Gate 4" : m}</span>}
              </td>
              <td className="num px-2 py-1.5 text-right">{x.reviews}</td>
              <td className="num px-2 py-1.5 text-right">{x.pct.toFixed(1)}%</td>
              <td className="num px-2 py-1.5 text-xs">{x.asins.join(", ")}</td>
              <td className="max-w-md px-2 py-1.5 text-xs">{x.examples.map((e, i) => <p key={i} className="truncate" title={e}>“{e}”</p>)}</td>
              <td className="px-2 py-1.5 whitespace-nowrap">
                {m === "chosen" ? null : <Button size="xs" variant="outline" onClick={() => onChoose(x)}>Use for Gate 4</Button>}
                {m ? <Button size="xs" variant="ghost" onClick={() => onMark(x.theme, null)}>{m === "ignore" ? "Unignore" : "Clear"}</Button> : (
                  <>
                    <Button size="xs" variant="ghost" onClick={() => onMark(x.theme, "not fixable")}>Not fixable</Button>
                    <Button size="xs" variant="ghost" onClick={() => onMark(x.theme, "ignore")}>Ignore</Button>
                  </>
                )}
              </td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}

/** The theme picked for Gate 4: answer "fixable?", and the fields it filled. */
function ChosenTheme({ theme, fields, onSave, onNotFixable }: { theme: Theme; fields: FieldMap; onSave: (k: string, v: string, delay?: number) => void; onNotFixable: () => void }) {
  const fixable = fields.fixable?.value;
  return (
    <div className="space-y-1.5 rounded-lg bg-surface-2 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span>Gate 4 uses <b>“{theme.theme}”</b>: {theme.pct.toFixed(1)}% of negative reviews, across {theme.asins.length} listing{theme.asins.length === 1 ? "" : "s"}. Can a factory fix it cheaply?</span>
        <Button size="xs" variant={fixable === "yes" ? "default" : "outline"} onClick={() => onSave("fixable", "yes", 0)}>Yes</Button>
        <Button size="xs" variant={fixable === "no" ? "default" : "outline"} onClick={() => { onSave("fixable", "no", 0); onNotFixable(); }}>No</Button>
      </div>
      <p className="text-xs text-muted-foreground">Filled in above: share {fields.complaintPct?.value ?? "—"}%, six words “{fields.sixWordsText?.value ?? "—"}” (a draft: edit it). Answering No marks the theme not fixable; pick another.</p>
    </div>
  );
}

/** "Ask Claude to summarise": only on a click; the cost shows. */
function Summary({ candidateId, initial }: { candidateId: string; initial: Run<ReviewSummary> | null }) {
  const [run, setRun] = useState<Run<ReviewSummary> | null>(initial && { ...initial, cached: true });
  const [busy, setBusy] = useState(false);
  const go = async (force: boolean) => {
    setBusy(true);
    try {
      setRun(await api<Run<ReviewSummary>>(`/api/pl/candidates/${candidateId}/reviews/summary`, { method: "POST", json: { force } }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <div className="flex flex-wrap items-center gap-2">
        <SparklesIcon className="size-4 text-brand" />
        <span className="text-sm font-semibold">Ask Claude to summarise</span>
        <span className="text-xs text-muted-foreground">The top three fixable complaints, one sentence each, from the reviews and themes above. Calls the API only when you click.</span>
        <span className="ml-auto">
          {run
            ? <Button size="xs" variant="ghost" disabled={busy} onClick={() => go(true)}>{busy ? <LoaderIcon className="animate-spin" /> : <RefreshCwIcon />} Re-run</Button>
            : <Button size="xs" disabled={busy} onClick={() => go(false)}>{busy ? <LoaderIcon className="animate-spin" /> : <SparklesIcon />} Summarise</Button>}
        </span>
      </div>
      {run && (
        <div className="space-y-1.5 text-sm">
          <ol className="list-decimal space-y-1 pl-5">{run.result.complaints.map((c, i) => <li key={i}>{c.sentence}{c.theme && <span className="ml-1 text-xs text-muted-foreground">({c.theme})</span>}</li>)}</ol>
          <Uncited list={run.uncited} />
          <CostLine run={run} what="summary" />
        </div>
      )}
      <DataSent url={`/api/pl/candidates/${candidateId}/reviews/summary`} />
    </div>
  );
}

/** The synonym list (shared by every candidate): each group's words count as one. */
function Synonyms({ groups, onSaved }: { groups: SynonymGroup[]; onSaved: (g: SynonymGroup[]) => void }) {
  const [draft, setDraft] = useState(() => groups.map((g) => ({ theme: g.theme, canon: g.canon, terms: g.terms.join(", ") })));
  const save = async (reset = false) => {
    try {
      const r = await api<{ synonyms: SynonymGroup[] }>("/api/pl/review-synonyms", { method: "PUT", json: { synonyms: reset ? null : draft.filter((g) => g.theme.trim()).map((g) => ({ theme: g.theme, canon: g.canon || g.theme, terms: g.terms.split(",") })) } });
      setDraft(r.synonyms.map((g) => ({ theme: g.theme, canon: g.canon, terms: g.terms.join(", ") })));
      onSaved(r.synonyms);
      toast.success(reset ? "Synonyms reset to the defaults" : "Synonyms saved");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const set = (i: number, k: "theme" | "canon" | "terms", v: string) => setDraft((d) => d.map((g, j) => (j === i ? { ...g, [k]: v } : g)));
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Synonyms ({groups.length} groups, shared by every candidate)</summary>
      <div className="mt-2 space-y-2">
        <p className="text-muted-foreground">Each group&apos;s terms count as one theme, and become its word inside phrases (“tiny compartments” reads as “small compartments”).</p>
        <div className="grid grid-cols-[minmax(0,9rem)_minmax(0,7rem)_minmax(0,1fr)] gap-1.5">
          <span className="field-label">Theme</span><span className="field-label">Word in phrases</span><span className="field-label">Terms (comma separated)</span>
          {draft.map((g, i) => (
            <div key={i} className="contents">
              <Input className="h-7 text-xs" value={g.theme} onChange={(e) => set(i, "theme", e.target.value)} />
              <Input className="h-7 text-xs" value={g.canon} onChange={(e) => set(i, "canon", e.target.value)} />
              <Input className="h-7 text-xs" value={g.terms} onChange={(e) => set(i, "terms", e.target.value)} />
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Button size="xs" variant="outline" onClick={() => setDraft((d) => [...d, { theme: "", canon: "", terms: "" }])}>Add a group</Button>
          <Button size="xs" onClick={() => save()}>Save</Button>
          <Button size="xs" variant="ghost" onClick={() => save(true)}>Reset to defaults</Button>
        </div>
      </div>
    </details>
  );
}
