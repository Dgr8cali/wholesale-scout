"use client";

import { CheckIcon, ClipboardCopyIcon, DownloadIcon, LoaderIcon, RotateCcwIcon, SparklesIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useDialogs } from "@/components/Dialogs";
import { SortTh, useSortable } from "@/components/SortableTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  BACKEND_BYTES, BULLET_LIMIT, DESCRIPTION_LIMIT, DIFFERENTIATION_LIMIT, bytes, complianceFlags, copyAll, flatFileRow, keywordCoverage, ruleIssues,
  type CoverageRow, type ListingDraft, type ListingField,
} from "@/lib/pl/listing";
import { listingChecks, needsProof, requiredThemes, ruleContext } from "@/lib/pl/listingRules";
import type { ListingInputs, ListingSettings } from "@/lib/server/plListing";
import { api } from "@/lib/ui/client";
import { cn } from "@/lib/utils";

interface Version { id: string; version: number; source: string; outputs: ListingDraft; created_at: string }
interface View { inputs: ListingInputs; settings: ListingSettings; versions: Version[]; latest: Version | null }
interface Call { cached: boolean; costGbp: number; tokens: { input: number; output: number; thinking?: number }; model: string; calls?: number }

const EMPTY: ListingDraft = { title: "", bullets: ["", "", "", "", ""], description: "", backend: "", differentiation: "" };
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** "123 / 200", red when over. */
function Counter({ n, max, unit = "chars" }: { n: number; max: number; unit?: string }) {
  return <span className={cn("num text-[11px]", n > max ? "font-semibold text-fail" : "text-muted-foreground")}>{n} / {max} {unit}</span>;
}

/**
 * Private label's Listing step: the title, five bullets, description, backend terms and the
 * differentiation angle, written by Claude on your click from Gate 4's themes and Gates 3/5's
 * search terms, checked live (Amazon's style rules, compliance, keyword coverage), every
 * generation and edit kept as a version.
 */
export function ListingSection({ candidateId }: { candidateId: string }) {
  const [view, setView] = useState<View | null>(null);
  const [draft, setDraft] = useState<ListingDraft>(EMPTY);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [settings, setSettings] = useState<ListingSettings | null>(null);
  const { confirm } = useDialogs();

  const load = useCallback(() => api<View>(`/api/pl/candidates/${candidateId}/listing`).then((v) => {
    setView(v); setSettings(v.settings);
    if (v.latest) setDraft(v.latest.outputs);
    setDirty(false);
  }).catch((e: Error) => toast.error(e.message)), [candidateId]);
  useEffect(() => { load(); }, [load]);
  // Arriving from the Launch checklist's link (#listing): the section renders after the candidate loads.
  const ready = !!view;
  useEffect(() => { if (ready && window.location.hash === "#listing") document.getElementById("listing")?.scrollIntoView({ behavior: "smooth" }); }, [ready]);

  const inputs = view?.inputs;
  const limit = settings?.titleLimit ?? inputs?.titleLimit ?? 200;
  const checks = useMemo(() => inputs ? {
    issues: ruleIssues(draft, { titleLimit: limit, leadTerm: inputs.leadTerm, themes: inputs.themes.slice(0, 6).map((t) => t.theme) }),
    compliance: complianceFlags(draft, { brands: inputs.brands, notes: inputs.notes, avoid: inputs.avoid }),
    coverage: keywordCoverage(draft, inputs.searchTerms),
    proof: needsProof(draft),
  } : null, [draft, inputs, limit]);
  const rc = useMemo(() => (inputs ? ruleContext({ ...inputs, titleLimit: limit }) : null), [inputs, limit]);
  const list = useMemo(() => (rc && checks ? listingChecks(draft, rc, checks.compliance.map((c) => c.term)) : []), [draft, rc, checks]);

  const run = async (what: string, f: () => Promise<{ call?: Call } | unknown>, ok?: string) => {
    setBusy(what);
    try {
      const r = (await f()) as { call?: Call };
      if (r?.call) toast.success(`${ok ?? "Written"}${r.call.cached ? " (from the cache: same inputs, no new call)" : ` · ${(r.call.calls ?? 1) > 1 ? `${r.call.calls} calls (draft + repair), ` : ""}£${r.call.costGbp.toFixed(3)}, ${r.call.tokens.input.toLocaleString("en-GB")} in / ${r.call.tokens.output.toLocaleString("en-GB")} out${r.call.tokens.thinking ? ` (${r.call.tokens.thinking.toLocaleString("en-GB")} of it thinking)` : ""}`}`);
      else if (ok) toast.success(ok);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const generate = async (force: boolean) => {
    if (dirty && !(await confirm({ title: "Write a new listing?", description: "Your unsaved edits will be replaced (the last saved version stays in Versions).", confirmLabel: "Write it" }))) return;
    await run(force ? "regenerate" : "generate", () => api(`/api/pl/candidates/${candidateId}/listing`, { method: "POST", json: { action: "generate", force } }));
  };
  const regen = (field: ListingField) => run(`field:${field}`, () => api(`/api/pl/candidates/${candidateId}/listing`, { method: "POST", json: { action: "regenerate", field, draft } }), `${field[0].toUpperCase()}${field.slice(1)} rewritten`);
  const save = () => run("save", () => api(`/api/pl/candidates/${candidateId}/listing`, { method: "POST", json: { action: "save", draft } }), "Saved as a new version");
  const restore = (v: number) => run(`restore:${v}`, () => api(`/api/pl/candidates/${candidateId}/listing`, { method: "POST", json: { action: "restore", version: v } }), `Version ${v} restored`);
  const saveSettings = (patch: Partial<ListingSettings>) => api<{ settings: ListingSettings }>(`/api/pl/candidates/${candidateId}/listing`, { method: "POST", json: { action: "settings", settings: patch } })
    .then((r) => { setSettings(r.settings); load(); }).catch((e: Error) => toast.error(e.message));
  const set = (patch: Partial<ListingDraft>) => { setDraft((d) => ({ ...d, ...patch })); setDirty(true); };
  const copy = async () => { try { await navigator.clipboard.writeText(copyAll(draft)); toast.success("Listing copied"); } catch { toast.error("Couldn't copy"); } };
  const exportFlat = () => {
    const url = URL.createObjectURL(new Blob([flatFileRow(draft)], { type: "text/tab-separated-values" }));
    const a = document.createElement("a");
    a.href = url; a.download = `listing-${(inputs?.product ?? "candidate").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  if (!view || !inputs || !settings || !checks) return <section className="panel p-4" id="listing"><p className="text-sm text-muted-foreground">Loading the listing…</p></section>;
  const has = !!view.latest || dirty;
  const issuesFor = (field: ListingField | "bullet", index?: number) => checks.issues.filter((i) => i.field === field && (index == null || i.index === index));
  const flagsFor = (field: ListingField, index?: number) => checks.compliance.filter((f) => f.field === field && (index == null || f.index === index));
  const notes = (field: ListingField | "bullet", index?: number) => {
    const is = issuesFor(field, index), fs = field === "bullet" ? flagsFor("bullets", index) : flagsFor(field as ListingField);
    // Each "needs proof" note once, under its own field: a bullet's under that bullet, none under the bullets as a whole.
    const ps = field === "bullets" ? [] : checks.proof.filter((p) => (field === "bullet" ? p.field === "bullets" && p.index === index : p.field === field));
    if (!is.length && !fs.length && !ps.length) return null;
    return (
      <ul className="space-y-0.5 text-[11.5px]">
        {is.map((i, k) => <li key={`i${k}`} className={i.level === "error" ? "text-fail" : "text-warn"}>{i.message}</li>)}
        {fs.map((f, k) => <li key={`f${k}`} className="text-fail">&ldquo;{f.term}&rdquo;: {f.why}. Try {f.suggestion}.</li>)}
        {ps.map((p, k) => (
          <li key={`p${k}`} className="text-muted-foreground">
            <mark className="rounded bg-warn-soft px-0.5 text-foreground">{p.sentence}</mark> <span className="text-warn">Needs proof (&ldquo;{p.phrase}&rdquo;): verify with samples before publishing.</span>
          </li>
        ))}
      </ul>
    );
  };
  const regenButton = (field: ListingField) => (
    <Button size="xs" variant="ghost" disabled={!!busy || !view.latest} onClick={() => regen(field)} title="Rewrite only this (a model call)">
      {busy === `field:${field}` ? <LoaderIcon className="animate-spin" /> : <RotateCcwIcon />} Regenerate
    </Button>
  );

  return (
    <section className="panel space-y-4 p-4" id="listing">
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto max-w-3xl">
          <h2 className="font-heading text-base font-bold">Listing</h2>
          <p className="text-sm text-muted-foreground">The title, five bullets, description, backend search terms and the differentiation angle, written by Claude on your click from Gate 4&apos;s complaint themes and the search terms of Gates 3 and 5. Checked as you edit: Amazon&apos;s style rules, compliance, and how much of the search volume it covers. Every generation and edit is a version.</p>
        </div>
        <Button size="sm" disabled={!!busy || !inputs.brand} title={inputs.brand ? undefined : "Set the brand name first"} onClick={() => generate(!!view.latest)}>
          {busy === "generate" || busy === "regenerate" ? <LoaderIcon className="animate-spin" /> : <SparklesIcon />} {view.latest ? "Regenerate all" : "Write the listing"}
        </Button>
      </div>

      <div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1"><span className="field-label">Brand name (required)</span>
          <Input defaultValue={settings.brand} placeholder="The title starts with it" aria-invalid={!settings.brand.trim()} onBlur={(e) => e.target.value !== settings.brand && saveSettings({ brand: e.target.value })} /></label>
        <label className="space-y-1"><span className="field-label">Brand voice</span>
          <Input defaultValue={settings.brandVoice} onBlur={(e) => e.target.value !== settings.brandVoice && saveSettings({ brandVoice: e.target.value })} /></label>
        <label className="space-y-1"><span className="field-label">Pack size</span>
          <Input defaultValue={settings.packSize ?? ""} placeholder="e.g. 200 wipes" onBlur={(e) => e.target.value !== (settings.packSize ?? "") && saveSettings({ packSize: e.target.value })} /></label>
        <label className="space-y-1"><span className="field-label">Title limit (characters)</span>
          <Input className="num" type="number" defaultValue={settings.titleLimit} onBlur={(e) => Number(e.target.value) !== settings.titleLimit && saveSettings({ titleLimit: Number(e.target.value) })} /></label>
        <label className="space-y-1 sm:col-span-2"><span className="field-label">Key specs (one fact per line)</span>
          <Textarea rows={5} className="text-xs" defaultValue={settings.specs} placeholder={"70% isopropyl alcohol\nwipe 12 × 15 cm\n200 individually wrapped sachets"} onBlur={(e) => e.target.value !== settings.specs && saveSettings({ specs: e.target.value })} /></label>
        <div className="space-y-3 sm:col-span-2">
          <label className="block space-y-1"><span className="field-label">Suitable for (comma list; the first three go in the title)</span>
            <Input defaultValue={settings.suitableFor} onBlur={(e) => e.target.value !== settings.suitableFor && saveSettings({ suitableFor: e.target.value })} /></label>
          <label className="block space-y-1"><span className="field-label">Not for (comma list)</span>
            <Input defaultValue={settings.notFor} onBlur={(e) => e.target.value !== settings.notFor && saveSettings({ notFor: e.target.value })} /></label>
          <label className="block space-y-1"><span className="field-label">Claims to avoid (added to the compliance list)</span>
            <Input defaultValue={settings.avoid} onBlur={(e) => e.target.value !== settings.avoid && saveSettings({ avoid: e.target.value })} /></label>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Written from: {inputs.themes.length} complaint theme{inputs.themes.length === 1 ? "" : "s"}{inputs.chosenTheme ? ` (Gate 4's pick: “${inputs.chosenTheme}”)` : ""}{inputs.summary.length ? ", the review summary" : ""} · {inputs.searchTerms.length} search term{inputs.searchTerms.length === 1 ? "" : "s"}{inputs.leadTerm ? ` (lead: “${inputs.leadTerm}”)` : ""} · {inputs.bankTerms.length} keyword-bank term{inputs.bankTerms.length === 1 ? "" : "s"} · {inputs.brands.length} competitor brands kept out.
        {rc && requiredThemes(rc).length > 0 && <> The bullets must answer: {requiredThemes(rc).map((t) => `“${t}”`).join(", ")}.</>}
        {!inputs.themes.length && !inputs.searchTerms.length && <span className="text-warn"> Mine reviews in Gate 4 or attach an Opportunity Explorer capture first.</span>}
        {!inputs.brand && <span className="text-warn"> Set the brand name to write the listing.</span>}
      </p>

      {has && (
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2"><span className="field-label">Title</span><Counter n={draft.title.length} max={limit} /><span className="ml-auto">{regenButton("title")}</span></div>
            <Input value={draft.title} onChange={(e) => set({ title: e.target.value })} />
            {notes("title")}
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2"><span className="field-label">Bullets</span><span className="ml-auto">{regenButton("bullets")}</span></div>
            {draft.bullets.map((b, i) => (
              <div key={i} className="space-y-0.5">
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">Bullet {i + 1} <Counter n={b.length} max={BULLET_LIMIT} /></div>
                <Textarea rows={2} className="text-sm" value={b} onChange={(e) => set({ bullets: draft.bullets.map((x, j) => (j === i ? e.target.value : x)) })} />
                {notes("bullet", i)}
              </div>
            ))}
            {notes("bullets")}
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2"><span className="field-label">Description</span><Counter n={draft.description.length} max={DESCRIPTION_LIMIT} /><span className="ml-auto">{regenButton("description")}</span></div>
            <Textarea rows={5} className="text-sm" value={draft.description} onChange={(e) => set({ description: e.target.value })} />
            {notes("description")}
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2"><span className="field-label">Backend search terms</span><Counter n={bytes(draft.backend)} max={BACKEND_BYTES} unit="bytes" /><span className="ml-auto">{regenButton("backend")}</span></div>
            <Textarea rows={2} className="font-mono text-xs" value={draft.backend} onChange={(e) => set({ backend: e.target.value })} />
            {notes("backend")}
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2"><span className="field-label">Differentiation angle</span><Counter n={draft.differentiation.length} max={DIFFERENTIATION_LIMIT} /><span className="ml-auto">{regenButton("differentiation")}</span></div>
            <Textarea rows={3} className="text-sm" value={draft.differentiation} onChange={(e) => set({ differentiation: e.target.value })} />
            {notes("differentiation")}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={!!busy || !dirty} onClick={save}>{busy === "save" && <LoaderIcon className="animate-spin" />} Save as a version</Button>
            {dirty && <span className="text-xs text-muted-foreground">Unsaved edits</span>}
            <Button size="sm" variant="outline" onClick={copy}><ClipboardCopyIcon /> Copy all</Button>
            <Button size="sm" variant="outline" onClick={exportFlat} title="Seller Central flat file: item_name, bullet_point1–5, product_description, generic_keywords"><DownloadIcon /> Flat-file row</Button>
          </div>

          <div className="rounded-lg border p-3">
            <p className="mb-1 text-sm"><b>Checks</b> <span className={cn("num", list.every((c) => c.pass) ? "text-pass" : "text-warn")}>{list.filter((c) => c.pass).length} of {list.length} passed</span>
              <span className="text-xs text-muted-foreground"> · after each generation, anything failing goes back for one repair call</span></p>
            <ul className="grid gap-x-4 gap-y-0.5 text-xs md:grid-cols-2">{list.map((c) => (
              <li key={c.id} className="flex items-start gap-1.5">
                {c.pass ? <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-pass" /> : <XIcon className="mt-0.5 size-3.5 shrink-0 text-fail" />}
                <span>{c.label}{c.detail && <span className="text-fail">: {c.detail}</span>}</span>
              </li>
            ))}</ul>
          </div>

          {checks.compliance.length > 0 && (
            <div className="rounded-lg border border-fail/40 bg-fail-soft/40 p-3 text-sm">
              <p className="mb-1 font-semibold text-fail">Compliance: {checks.compliance.length} to fix</p>
              <ul className="space-y-0.5 text-xs">{checks.compliance.map((f, k) => (
                <li key={k}><b>{f.field}{f.index != null ? ` ${f.index + 1}` : ""}</b>: &ldquo;{f.term}&rdquo;. {f.why}. Suggested: {f.suggestion}.</li>
              ))}</ul>
            </div>
          )}

          <CoverageTable rows={checks.coverage.rows} pct={checks.coverage.pct} />
        </div>
      )}

      {view.versions.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">Versions ({view.versions.length})</summary>
          <ul className="mt-1 space-y-0.5">{view.versions.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-2">
              <b className="num">v{v.version}</b> <span className="text-muted-foreground">{v.source} · {when(v.created_at)}</span>
              <span className="truncate text-muted-foreground">{v.outputs.title.slice(0, 70)}</span>
              {v.version !== view.latest?.version && <button type="button" className="text-brand hover:underline" disabled={!!busy} onClick={() => restore(v.version)}>Restore</button>}
            </li>
          ))}</ul>
        </details>
      )}
    </section>
  );
}

/** Each search term: in the title, the bullets, the backend; coverage weighted by search volume. */
function CoverageTable({ rows, pct }: { rows: CoverageRow[]; pct: number | null }) {
  const t = useSortable("pl.listingCoverage", rows, {
    term: { value: (r) => r.term, kind: "text" },
    volume: { value: (r) => r.volume, kind: "number" },
    conversion: { value: (r) => r.conversion, kind: "number" },
    title: { value: (r) => (r.inTitle ? 1 : 0), kind: "number" },
    bullets: { value: (r) => (r.inBullets ? 1 : 0), kind: "number" },
    backend: { value: (r) => (r.inBackend ? 1 : 0), kind: "number" },
  }, { key: "volume", dir: "desc" });
  if (!rows.length) return <p className="text-xs text-muted-foreground">No search terms to check coverage against: attach an Opportunity Explorer capture (Gate 3).</p>;
  const tick = (b: boolean) => <span className={b ? "text-pass" : "text-muted-foreground"}>{b ? "✓" : "—"}</span>;
  return (
    <div className="space-y-1">
      <p className="text-sm"><b>Keyword coverage</b> <span className={cn("num font-semibold", (pct ?? 0) >= 80 ? "text-pass" : (pct ?? 0) >= 50 ? "text-warn" : "text-fail")}>{pct ?? "—"}%</span> <span className="text-xs text-muted-foreground">of the search volume, in the title, bullets or backend terms</span></p>
      <div className="max-h-80 overflow-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead><tr className="border-b text-left text-[11px] tracking-wide text-muted-foreground uppercase">
            <SortTh {...t.th("term")} className="px-2 py-1.5">Search term</SortTh>
            <SortTh {...t.th("volume")} numeric className="px-2 py-1.5 text-right">Volume / mo</SortTh>
            <SortTh {...t.th("conversion")} numeric className="px-2 py-1.5 text-right">Conversion</SortTh>
            <SortTh {...t.th("title")} numeric className="px-2 py-1.5 text-center">Title</SortTh>
            <SortTh {...t.th("bullets")} numeric className="px-2 py-1.5 text-center">Bullets</SortTh>
            <SortTh {...t.th("backend")} numeric className="px-2 py-1.5 text-center">Backend</SortTh>
          </tr></thead>
          <tbody>{t.rows.map((r) => (
            <tr key={r.term} className={cn("border-b last:border-0", !r.covered && "bg-warn-soft/30")}>
              <td className="px-2 py-1">{r.term}</td>
              <td className="num px-2 py-1 text-right">{r.volume?.toLocaleString("en-GB") ?? "—"}</td>
              <td className="num px-2 py-1 text-right">{r.conversion != null ? `${r.conversion}%` : "—"}</td>
              <td className="px-2 py-1 text-center">{tick(r.inTitle)}</td>
              <td className="px-2 py-1 text-center">{tick(r.inBullets)}</td>
              <td className="px-2 py-1 text-center">{tick(r.inBackend)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
