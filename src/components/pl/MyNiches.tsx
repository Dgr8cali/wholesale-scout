"use client";

import { ChevronLeftIcon, ChevronRightIcon, ListIcon, SearchIcon } from "lucide-react";
import { FileDrop } from "@/components/ui/file-drop";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useDialogs } from "@/components/Dialogs";
import { SortTh, useServerSort } from "@/components/SortableTable";
import { EmptyState, ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { InfoTip, SectionTitle } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Kpi } from "@/components/ui/kpi";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip, type Tone } from "@/components/ui/status-chip";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_HIDDEN_FLAGS, FLAG_LABEL, NICHE_FLAGS, type NicheFlag } from "@/lib/pl/nicheScore";
import { matchPoeCategory, POE_CATEGORIES } from "@/lib/pl/poeCategories";
import { TERM_SIGNAL_LABEL, termSignalText, type TermSignal } from "@/lib/pl/termConversion";
import type { NicheRow } from "@/lib/server/plNiches";
import { api } from "@/lib/ui/client";
import { cn } from "@/lib/utils";

interface Imp { id: string; category: string; imported_at: string; row_count: number; filename: string | null; unmapped: string[]; duplicates: number; poeCategory: string | null; feeCategory: string }
interface Stats { total: number; scoring60: number; hiddenByFlags: number; shortlisted: number; checked: number }
/** One page from the server: the rows, how many match, the strip's counts over every niche in scope, and the imports. */
interface Data { rows: NicheRow[]; total: number; page: number; pageSize: number; stats: Stats; imports: Imp[] }
interface Filters { category: string; minScore: string; price: string; status: string; q: string }
interface Preview {
  headerLine: number; mapped: Record<string, string | null>; unmapped: string[]; warnings: string[]; rows: number; niches: number; duplicates: number; replaces: number; feeCategory: string;
  sample: (NicheRow & { aliases: string[] })[];
}
interface Incumbents {
  term: string; terms?: string[]; finderTerms?: string[] | null; found: number; shape: string | null; tokensUsed: number; reused: number; checkedAt: string; rootCategories?: string[];
  outside?: boolean; onNicheCategories?: { name: string; count: number }[];
  onNiche?: number; excludedCount?: number; excluded?: { asin: string; title: string | null; why: string }[]; candidates?: string[]; finderAt?: string; reusedFinder?: boolean;
  incumbents: { asin: string; title: string | null; brand: string | null; reviews: number | null; price: number | null; monthlySold?: number | null; rank?: number | null; category?: string | null; matchedTerm?: string | null; matchedHow?: "phrase" | "words" | "poe" | null; poe?: { term: string; rank: number } | null }[];
  poeTop?: number;
}

const pct = (g: number | null | undefined, dp = 1) => (g == null ? "—" : `${g >= 0 ? "+" : ""}${(g * 100).toLocaleString("en-GB", { maximumFractionDigits: dp, minimumFractionDigits: dp })}%`);
const gbp = (v: number | null | undefined) => (v == null ? "—" : `£${v.toFixed(2)}`);
const n0 = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString("en-GB"));
const SHAPE_TONE: Record<string, Tone> = { open: "good", contested: "warn", dominated: "bad" };
/** A niche's incumbent shape (open / contested / dominated) as a chip. */
function ShapeChip({ shape }: { shape: string }) {
  return <StatusChip tone={SHAPE_TONE[shape] ?? "neutral"}>{shape[0].toUpperCase() + shape.slice(1)}</StatusChip>;
}
const SIGNAL_TONE: Record<TermSignal, Tone> = { BUYING: "good", BROWSE_ONLY: "bad" };
/** The Buying / Browse-only chip from a niche's best search-term conversion. */
function SignalChip({ s }: { s: TermSignal | null | undefined }) {
  return s ? <StatusChip tone={SIGNAL_TONE[s]}>{TERM_SIGNAL_LABEL[s]}</StatusChip> : null;
}
const FLAG_TONE: Partial<Record<NicheFlag, Tone>> = { SPIKE: "bad", BIG_BRAND: "bad", REGULATED: "warn", ELECTRICAL: "warn", HEAVY_BULKY: "warn" };
const PRICE_BANDS: [string, string][] = [["", "Any price"], ["core", "£15–40"], ["mid", "£10–60"], ["low", "Under £10"], ["high", "Over £60"]];
const SORT_KEYS = ["need", "terms", "score", "sv", "g180", "g90", "price", "range", "clicked", "units", "returns", "flags", "shape", "status"];
const NUMERIC_SORTS = ["score", "sv", "g180", "g90", "price", "range", "clicked", "units", "returns", "flags"];
const PAGE_SIZES = [25, 50, 100, 200, 500];
const OTHER = "__other";
const scoreTone = (s: number | null) => (s == null ? "" : s >= 60 ? "text-success font-semibold" : s >= 40 ? "text-warn-ink" : "text-muted-foreground");
// The header cell, as the shared DataTable draws it.
const TH = "sticky top-0 z-10 border-b border-border bg-card px-3 py-2.5 text-left text-xs font-semibold tracking-[0.06em] whitespace-nowrap text-muted-foreground uppercase";
const TD = "px-3 py-2.5 align-top";

/**
 * Private label → Niches → My niches: Opportunity Explorer category downloads, every niche scored from its own
 * figures (no Keepa) and flagged; shortlist, check incumbents (Keepa, one at a time) and make
 * candidates.
 */
export function MyNiches() {
  const [f, setF] = useState<Filters>({ category: "", minScore: "", price: "", status: "active", q: "" });
  const [hide, setHide] = useState<Set<NicheFlag>>(new Set(DEFAULT_HIDDEN_FLAGS));
  const sorting = useServerSort("pl.niches", SORT_KEYS, NUMERIC_SORTS, { key: "score", dir: "desc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The query whose page is on screen: while it differs from the one asked for, a page is loading.
  const [shownQuery, setShownQuery] = useState<string | null>(null);
  // The search waits for a pause in typing.
  const [q, setQ] = useState("");
  useEffect(() => { const t = setTimeout(() => setQ(f.q), 300); return () => clearTimeout(t); }, [f.q]);
  const query = useMemo(() => new URLSearchParams({
    ...(f.category ? { category: f.category } : {}), ...(f.minScore ? { minScore: f.minScore } : {}), ...(f.price ? { price: f.price } : {}),
    status: f.status, ...(q.trim() ? { q: q.trim() } : {}), hide: [...hide].join(","),
    sort: sorting.sort.key, dir: sorting.sort.dir, page: String(page), pageSize: String(pageSize),
  }).toString(), [f.category, f.minScore, f.price, f.status, q, hide, sorting.sort, page, pageSize]);
  const load = useCallback(() => {
    api<Data>(`/api/pl/niches?${query}`).then((d) => { setData(d); setError(null); setShownQuery(query); }).catch((e: Error) => { setError(e.message); setShownQuery(query); });
  }, [query]);
  const loading = shownQuery !== query;
  useEffect(() => { load(); }, [load]);
  // Any change but the page itself goes back to page 1.
  const change = (p: Partial<Filters>) => { setF((x) => ({ ...x, ...p })); setPage(1); };
  if (error && !data) return <ErrorState title="Couldn't load the niches" message={error} onRetry={load} />;
  if (!data) return <Skeleton className="h-96 rounded-xl" />;
  return (
    <div className="space-y-5">
      <ImportCard imports={data.imports} onImported={load} />
      {data.stats.total > 0 || data.imports.length > 0 ? (
        <NicheTable data={data} loading={loading} f={f} change={change} hide={hide}
          setHide={(h) => { setHide(h); setPage(1); }} sorting={{ th: (k: string) => ({ ...sorting.th(k), onSort: (key: string) => { sorting.toggle(key); setPage(1); } }) }}
          page={page} setPage={setPage} pageSize={pageSize} setPageSize={(n) => { setPageSize(n); setPage(1); }} onChanged={load} />
      ) : null}
    </div>
  );
}

function ImportCard({ imports, onImported }: { imports: Imp[]; onImported: () => void }) {
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  // One of Opportunity Explorer's categories, or "Other…" with your own name.
  const [pick, setPick] = useState("");
  const [other, setOther] = useState("");
  const category = pick === OTHER ? other.trim() : pick;
  const listedFee = POE_CATEGORIES.find((c) => c.name === pick)?.fee ?? null;
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const recent = [...new Set(imports.map((i) => i.category))];
  const read = async (f: File | undefined) => {
    if (!f) return;
    const text = await f.text();
    setFile({ name: f.name, text });
    setPreview(null);
    if (!category) {
      // "diy-tools.csv" → DIY & Tools as a first guess; you can change it.
      const guess = f.name.replace(/\.csv$/i, "").replace(/[-_]+/g, " ");
      const poe = matchPoeCategory(guess) ?? matchPoeCategory(recent.find((r) => r.toLowerCase().replace(/[^a-z]/g, "") === guess.toLowerCase().replace(/[^a-z]/g, "")));
      if (poe) setPick(poe);
    }
  };
  const run = async (action: "preview" | "import") => {
    if (!file) return;
    setBusy(true);
    try {
      if (action === "preview") setPreview(await api<Preview>("/api/pl/niches", { method: "POST", json: { action, text: file.text, category } }));
      else {
        const r = await api<{ niches: number; duplicates: number; preserved: number; replaced: boolean; mergedAcrossCategories?: number }>("/api/pl/niches", { method: "POST", json: { action, text: file.text, category, filename: file.name } });
        toast.success(`${category}: ${r.niches} niches imported${r.duplicates ? `, ${r.duplicates} duplicates merged` : ""}${r.mergedAcrossCategories ? `, ${r.mergedAcrossCategories} already imported under another category (one row, both categories)` : ""}${r.replaced ? `; the previous import replaced, ${r.preserved} kept their status and notes` : ""}`);
        setFile(null); setPreview(null);
        onImported();
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel space-y-3 p-4">
      <SectionTitle title="Import a category">
        <p>Download a category from Opportunity Explorer (Seller Central) as CSV and drop it here; Preview shows how its columns map before anything is saved. No Keepa tokens.</p>
        <p>Importing a category again replaces it; niches keep their status, notes and shape.</p>
        {imports.length > 0 && <p>Imported: {imports.map((i) => `${i.category} (${i.row_count}, ${new Date(i.imported_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}; fees as ${i.feeCategory})`).join(" · ")}.</p>}
      </SectionTitle>
      <div className="flex flex-wrap items-end gap-3">
        <FileDrop size="compact" onFiles={(f) => read(f[0])} accept=".csv,text/csv" title={file ? file.name : "Drop the Opportunity Explorer CSV, or choose it"} />
        <label className="space-y-1"><span className="field-label">Opportunity Explorer category</span>
          <NativeSelect className="w-full sm:w-64" value={pick} onChange={(e) => { setPick(e.target.value); setPreview(null); }}>
            <NativeSelectOption value="">Pick the category…</NativeSelectOption>
            {POE_CATEGORIES.map((c) => <NativeSelectOption key={c.name} value={c.name}>{c.name}</NativeSelectOption>)}
            <NativeSelectOption value={OTHER}>Other…</NativeSelectOption>
          </NativeSelect></label>
        {pick === OTHER && (
          <label className="space-y-1"><span className="field-label">Category name</span>
            <Input className="w-56" list="niche-categories" value={other} onChange={(e) => { setOther(e.target.value); setPreview(null); }} placeholder="e.g. Arts & Crafts" />
            <datalist id="niche-categories">{recent.filter((r) => !matchPoeCategory(r)).map((c) => <option key={c} value={c} />)}</datalist></label>
        )}
        {(listedFee || (pick === OTHER && preview)) && (
          <span className="pb-2.5 text-meta text-muted-foreground" title="The rate card category a candidate created from these niches uses for its referral fee">
            Fee category: <b className="font-medium text-foreground">{listedFee ?? preview?.feeCategory}</b>
          </span>
        )}
        {pick === OTHER && !preview && other.trim() && <span className="pb-2.5 text-meta text-muted-foreground">Fee category: shown with the preview</span>}
        <Button variant="secondary" disabled={!file || !category.trim() || busy} loading={busy && !preview} onClick={() => run("preview")}>Preview</Button>
        {preview && <Button disabled={busy} loading={busy} onClick={() => run("import")}>Import {preview.niches} niches</Button>}
      </div>
      {imports.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 text-meta text-muted-foreground"><span>Imported:</span>
          {[...new Set(imports.map((i) => i.category))].map((c) => <StatusChip key={c} tone="neutral" icon={false}>{c}</StatusChip>)}
        </p>
      )}
      {preview && (
        <div className="space-y-2 rounded-lg bg-subtle p-3 text-sm">
          <p>Header on line {preview.headerLine}: <b>{preview.rows}</b> rows read, <b>{preview.niches}</b> niches{preview.duplicates ? ` (${preview.duplicates} duplicates merged as aliases)` : ""}.{preview.replaces ? ` Replaces ${preview.replaces} niches already imported for "${category}".` : ""}</p>
          <details className="text-meta">
            <summary className="cursor-pointer">Columns: {Object.values(preview.mapped).filter(Boolean).length} mapped{preview.unmapped.length ? `, ${preview.unmapped.length} not recognised` : ""}</summary>
            <ul className="mt-1 grid gap-x-4 sm:grid-cols-2">{Object.entries(preview.mapped).map(([k, v]) => <li key={k}><span className="font-mono">{k}</span> ← {v ?? <span className="text-danger">not found</span>}</li>)}</ul>
          </details>
          {preview.unmapped.length > 0 && <p className="text-meta text-warn-ink">Not recognised (kept in each row&apos;s raw data): {preview.unmapped.join(", ")}</p>}
          {preview.warnings.map((w) => <p key={w} className="text-meta text-warn-ink">{w}</p>)}
          <div className="overflow-x-auto rounded-lg border border-border bg-card"><table className="w-full text-meta">
            <thead><tr>{["Customer need", "Search terms", "Score", "SV 360d", "Growth 180d", "Avg price", "Units/product", "Flags"].map((h, i) => <th key={h} className={cn(TH, "static", i >= 2 && i <= 6 && "text-right")}>{h}</th>)}</tr></thead>
            <tbody>{preview.sample.map((n) => (
              <tr key={n.customer_need} className="border-b border-divider last:border-b-0"><td className="px-3 py-2">{n.customer_need}{n.aliases.length ? <span className="text-muted-foreground"> (+{n.aliases.join(", ")})</span> : null}</td><td className="px-3 py-2">{n.search_terms.join(", ")}</td>
                <td className="num px-3 py-2 text-right">{n.score}</td><td className="num px-3 py-2 text-right">{n0(n.sv_360)}</td><td className="num px-3 py-2 text-right">{pct(n.growth_180)}</td><td className="num px-3 py-2 text-right">{gbp(n.avg_price)}</td><td className="num px-3 py-2 text-right">{n0(n.units_per_product_mid)}</td><td className="px-3 py-2">{n.flags.map((x) => FLAG_LABEL[x as NicheFlag] ?? x).join(", ")}</td></tr>
            ))}</tbody>
          </table></div>
        </div>
      )}
    </section>
  );
}

function NicheTable({ data, loading, f, change, hide, setHide, sorting, page, setPage, pageSize, setPageSize, onChanged }: {
  data: Data; loading: boolean; f: Filters; change: (p: Partial<Filters>) => void; hide: Set<NicheFlag>; setHide: (h: Set<NicheFlag>) => void;
  sorting: { th: (key: string) => { sortKey: string; sort: { key: string; dir: "asc" | "desc" } | null; onSort: (key: string) => void } };
  page: number; setPage: (n: number) => void; pageSize: number; setPageSize: (n: number) => void; onChanged: () => void;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const cats = [...new Set(data.imports.map((i) => i.category))].sort();
  const rows = data.rows;
  const allShown = rows.length > 0 && rows.every((n) => sel.has(n.id));
  const toggle = (id: string) => setSel((x) => { const y = new Set(x); if (y.has(id)) y.delete(id); else y.add(id); return y; });
  const bulk = async (status: "shortlisted" | "dismissed") => {
    try {
      await api("/api/pl/niches/bulk", { method: "POST", json: { ids: [...sel], status } });
      toast.success(`${sel.size} ${status}`);
      setSel(new Set());
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const s = sorting;
  const pages = Math.max(1, Math.ceil(data.total / pageSize));
  const first = data.total ? (page - 1) * pageSize + 1 : 0, last = Math.min(data.total, page * pageSize);
  // The pager under the table, as the shared DataTable draws it (the server pages this table).
  const pager = (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-2 text-meta text-muted-foreground">
      <span className="num">{first.toLocaleString("en-GB")}–{last.toLocaleString("en-GB")} of {data.total.toLocaleString("en-GB")}{loading && " …"}</span>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2"><span className="hidden sm:inline">Rows</span>
          <NativeSelect className="w-20 [&_select]:h-8" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} aria-label="Rows a page">
            {PAGE_SIZES.map((n) => <NativeSelectOption key={n} value={n}>{n}</NativeSelectOption>)}
          </NativeSelect>
        </label>
        <Button variant="ghost" size="sm" className="hidden sm:inline-flex" disabled={page <= 1} onClick={() => setPage(1)}>First</Button>
        <Button variant="ghost" size="icon-sm" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeftIcon /></Button>
        <span className="num">{page} / {pages}</span>
        <Button variant="ghost" size="icon-sm" aria-label="Next page" disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRightIcon /></Button>
        <Button variant="ghost" size="sm" className="hidden sm:inline-flex" disabled={page >= pages} onClick={() => setPage(pages)}>Last</Button>
      </div>
    </div>
  );
  const th = (key: string, label: string, opts: { numeric?: boolean; title?: string } = {}) => (
    <SortTh {...s.th(key)} numeric={opts.numeric} title={opts.title} className={cn(TH, opts.numeric && "text-right")}>{label}</SortTh>
  );
  return (
    <section className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5" title={f.category ? `Over every niche in ${f.category}` : "Over every niche imported"}>
        {([
          ["Niches imported", data.stats.total],
          ["Scoring 60+", data.stats.scoring60],
          ["Hidden by flags", data.stats.hiddenByFlags],
          ["Shortlisted", data.stats.shortlisted],
          ["Incumbents checked", data.stats.checked],
        ] as const).map(([l, v]) => <Kpi key={l} label={l} value={Number(v).toLocaleString("en-GB")} />)}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1"><span className="field-label">Category</span>
          <NativeSelect value={f.category} onChange={(e) => change({ category: e.target.value })}>
            <NativeSelectOption value="">All</NativeSelectOption>{cats.map((c) => <NativeSelectOption key={c} value={c}>{c}</NativeSelectOption>)}
          </NativeSelect></label>
        <label className="flex flex-col gap-1"><span className="field-label">Min score</span><Input className="num w-20" type="number" min={0} max={100} value={f.minScore} onChange={(e) => change({ minScore: e.target.value })} /></label>
        <label className="space-y-1"><span className="field-label">Price</span>
          <NativeSelect value={f.price} onChange={(e) => change({ price: e.target.value })}>{PRICE_BANDS.map(([k, l]) => <NativeSelectOption key={k} value={k}>{l}</NativeSelectOption>)}</NativeSelect></label>
        <label className="space-y-1"><span className="field-label">Status</span>
          <NativeSelect value={f.status} onChange={(e) => change({ status: e.target.value })}>
            <NativeSelectOption value="active">Not dismissed</NativeSelectOption><NativeSelectOption value="all">All</NativeSelectOption>
            {["new", "shortlisted", "dismissed", "candidate"].map((x) => <NativeSelectOption key={x} value={x}>{x[0].toUpperCase() + x.slice(1)}</NativeSelectOption>)}
          </NativeSelect></label>
        <div className="relative w-full sm:w-56"><SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="w-full pl-8" placeholder="Search needs and terms" aria-label="Search needs and terms" value={f.q} onChange={(e) => change({ q: e.target.value })} /></div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-meta text-muted-foreground">Hide flagged:</span>
        {NICHE_FLAGS.map((x) => (
          <button key={x} type="button" aria-pressed={hide.has(x)} onClick={() => { const y = new Set(hide); if (y.has(x)) y.delete(x); else y.add(x); setHide(y); }}
            className={cn("cursor-pointer rounded-full border px-2.5 py-1", hide.has(x) ? "border-primary bg-primary-soft font-medium text-primary-ink" : "border-border text-muted-foreground hover:bg-subtle hover:text-foreground")}>{FLAG_LABEL[x]}</button>
        ))}
        <Button variant="link" size="sm" className="ml-1 text-xs" onClick={() => setHide(new Set(DEFAULT_HIDDEN_FLAGS))}>Defaults</Button>
      </div>
      {sel.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm"><span className="num">{sel.size} selected</span>
          <Button size="sm" variant="secondary" onClick={() => bulk("shortlisted")}>Shortlist</Button><Button size="sm" variant="secondary" onClick={() => bulk("dismissed")}>Dismiss</Button>
          <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>Clear</Button></div>
      )}
      {!rows.length ? (
        <EmptyState icon={<ListIcon />} title="No niche matches these filters">Lower the min score, pick another category or show the flagged niches.</EmptyState>
      ) : (
        <div className={cn("panel overflow-hidden", loading && "opacity-70")}>
          <div className="max-h-[calc(100dvh-var(--app-header)-7rem)] overflow-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">My niches</caption>
              <thead><tr>
                <th className={cn(TH, "w-8")}><input type="checkbox" aria-label="Select all on this page" checked={allShown} onChange={() => setSel(allShown ? new Set() : new Set(rows.map((n) => n.id)))} /></th>
                {th("need", "Customer need")}
                {th("terms", "Search terms")}
                {th("score", "Score", { numeric: true })}
                {th("sv", "SV 360d", { numeric: true })}
                {th("g180", "Growth 180d", { numeric: true })}
                {th("g90", "Growth 90d", { numeric: true })}
                {th("price", "Avg price", { numeric: true })}
                {th("range", "Min–max", { numeric: true })}
                {th("clicked", "Top-clicked", { numeric: true, title: "Products sharing the clicks: more = less dominated" })}
                {th("conv", "Best term conv.", { numeric: true, title: "The best 360-day conversion among its search terms, from an Opportunity Explorer capture (the extension's Send to Private label). Buying: a term at 4%+; browse-only: none at 2.5%+" })}
                {th("units", "Units/product/yr", { numeric: true, title: "Units a product a year: the midpoint of the average product's range" })}
                {th("returns", "Returns", { numeric: true })}
                {th("flags", "Flags")}
                {th("shape", "Shape", { title: "Open, then contested, then dominated" })}
                {th("status", "Status")}
              </tr></thead>
              <tbody>{rows.map((n) => (
                <Fragment key={n.id}>
                  <tr className={cn("border-b border-divider hover:bg-subtle/60", sel.has(n.id) && "bg-primary-soft/40", n.status === "dismissed" && "opacity-60")}>
                    <td className={TD}><input type="checkbox" aria-label={`Select ${n.customer_need}`} checked={sel.has(n.id)} onChange={() => toggle(n.id)} /></td>
                    <td className={cn(TD, "min-w-48")}>
                      <button type="button" aria-expanded={open === n.id} className="flex cursor-pointer items-start gap-1 text-left font-medium hover:text-primary" onClick={() => setOpen(open === n.id ? null : n.id)}>
                        <ChevronRightIcon className={cn("mt-0.5 size-3.5 flex-none text-muted-foreground transition-transform", open === n.id && "rotate-90")} />{n.customer_need}
                      </button>
                      {(n.categories?.length ?? 0) > 0 && (!f.category || n.categories.length > 1) && (
                        <span className="flex flex-wrap gap-1 pt-1 pl-4" title={n.categories.length > 1 ? "In each of these categories' downloads: one niche" : undefined}>
                          {n.categories.map((c) => <span key={c} className={cn("rounded-full px-2 py-px text-xs", c === f.category ? "bg-primary-soft text-primary-ink" : "bg-subtle text-muted-foreground")}>{c}</span>)}
                        </span>
                      )}
                      {(n.extra.aliases?.length ?? 0) > 0 && <span className="block pl-4 text-xs text-muted-foreground">also: {n.extra.aliases!.join(", ")}</span>}
                      {n.notes && <span className="block pl-4 text-xs text-muted-foreground italic">{n.notes.slice(0, 80)}</span>}
                    </td>
                    <td className={cn(TD, "max-w-56 text-meta text-muted-foreground")}>{n.search_terms.join(" · ")}</td>
                    <td className={cn(TD, "num text-right", scoreTone(n.score))}>{n.score ?? "—"}</td>
                    <td className={cn(TD, "num text-right")}>{n0(n.sv_360)}</td>
                    <td className={cn(TD, "num text-right", (n.growth_180 ?? 0) < 0 && "text-danger")}>{pct(n.growth_180)}</td>
                    <td className={cn(TD, "num text-right", (n.growth_90 ?? 0) < 0 && "text-danger")}>{pct(n.growth_90)}</td>
                    <td className={cn(TD, "num text-right")}>{gbp(n.avg_price)}</td>
                    <td className={cn(TD, "num text-right text-meta whitespace-nowrap text-muted-foreground")}>{gbp(n.min_price)}–{gbp(n.max_price)}</td>
                    <td className={cn(TD, "num text-right")}>{n.top_clicked_products ?? "—"}</td>
                    <td className={cn(TD, "text-right")}>{n.best_term_conversion != null
                      ? <span className="inline-flex flex-col items-end gap-1" title={termSignalText(n.best_term_conversion)}><span className="num">{n.best_term_conversion}%</span><SignalChip s={n.term_signal} /></span>
                      : <span className="text-muted-foreground" title="Not sent from Opportunity Explorer yet">—</span>}</td>
                    <td className={cn(TD, "num text-right")}>{n0(n.units_per_product_mid)}</td>
                    <td className={cn(TD, "num text-right")}>{pct(n.return_rate, 2).replace("+", "")}</td>
                    <td className={TD}><span className="flex flex-wrap gap-1">{n.flags.map((x) => <StatusChip key={x} tone={FLAG_TONE[x as NicheFlag] ?? "neutral"} icon={false}>{FLAG_LABEL[x as NicheFlag] ?? x}</StatusChip>)}</span></td>
                    <td className={TD}>{n.shape ? <ShapeChip shape={n.shape} /> : <span className="text-muted-foreground">—</span>}</td>
                    <td className={cn(TD, "text-meta")}>{n.status === "candidate" && n.candidate_id ? <Link className="text-primary underline" href={`/pl/candidates?c=${n.candidate_id}`}>Candidate</Link> : n.status[0].toUpperCase() + n.status.slice(1)}</td>
                  </tr>
                  {open === n.id && <tr className="border-b border-divider bg-subtle/50"><td /><td colSpan={15} className="px-3 py-4"><NicheDetail n={n} onChanged={onChanged} /></td></tr>}
                </Fragment>
              ))}</tbody>
            </table>
          </div>
          {pager}
        </div>
      )}
    </section>
  );
}

/** The term converting best on a niche's capture. */
const bestTerm = (n: NicheRow) => n.extra.poe?.terms.reduce<{ term: string; conversion: number | null } | null>((a, t) => (t.conversion != null && (a?.conversion == null || t.conversion > a.conversion) ? t : a), null)?.term ?? null;

/** A niche opened: its score's parts, actions, notes, and the incumbent check. */
function NicheDetail({ n, onChanged }: { n: NicheRow; onChanged: () => void }) {
  const [notes, setNotes] = useState(n.notes ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const { confirm } = useDialogs();
  const router = useRouter();
  const bd = n.score_breakdown as Record<string, { points: number; max: number; input: number | null; note: string }> | null;
  const inc = n.extra.incumbents as Incumbents | undefined;
  const act = async (what: string, f: () => Promise<unknown>) => {
    setBusy(what);
    try { await f(); onChanged(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const status = (s: string) => act(s, async () => { await api(`/api/pl/niches/${n.id}`, { method: "PATCH", json: { status: s } }); toast.success(s === "new" ? "Reset" : `${s[0].toUpperCase()}${s.slice(1)}`); });
  const check = (rerun: boolean) => act(rerun ? "rerun" : "check", async () => {
    const plan = await api<{ term: string; terms: string[]; finderTerms: string[]; categories: string[]; estimate: number; fallback: number; pinned: number; balance: number | null; reserve: number; fits: boolean; blocked: string | null; reusing: boolean }>(`/api/pl/niches/${n.id}${rerun ? "?rerun=1" : ""}`);
    if (plan.blocked) throw new Error(plan.blocked);
    const where = plan.categories.length ? ` in ${plan.categories.join(", ")}` : " (no Keepa category for this niche: all of Amazon)";
    const q = (t: string[]) => t.map((x) => `"${x}"`).join(", ");
    const how = plan.reusing ? `the last check's products again (no Product Finder call), re-detailing only those not detailed in the last 7 days` : `${plan.finderTerms.length} Product Finder page${plan.finderTerms.length === 1 ? "" : "s"} (${q(plan.finderTerms)})${where}, then the top 25 detailed (ASINs detailed in the last 7 days are reused)`;
    const poe = plan.pinned ? ` Opportunity Explorer's ${plan.pinned} top-clicked product${plan.pinned === 1 ? "" : "s"} (#1–#3 for its captured search terms) are detailed first and counted on-niche.` : "";
    if (!(await confirm({ title: `${rerun ? "Rerun" : "Check"} incumbents for "${plan.term}"?`, description: `Up to ${plan.estimate} Keepa tokens: ${how}.${poe}${plan.fallback ? ` If fewer than 5 products turn up in ${plan.categories.join(", ")}, the same search runs on all of Amazon (+${plan.fallback} tokens).` : ""} Only titles with one of ${q(plan.terms)} as a phrase and none of the off-niche words count; the 10 best sellers among them decide the shape. Balance ${plan.balance ?? "?"}, ${plan.reserve} kept in reserve${plan.fits ? "" : ": not enough now, wait for the refill"}.`, confirmLabel: plan.fits ? "Run the check" : "Close" }))) return;
    if (!plan.fits) return;
    const r = await api<Incumbents>(`/api/pl/niches/${n.id}`, { method: "POST", json: { action: rerun ? "rerun" : "check" } });
    toast.success(`"${r.term}": ${r.shape ?? "no on-niche sellers"} (${r.tokensUsed} token${r.tokensUsed === 1 ? "" : "s"})`);
  });
  const markOut = (asin: string, out: boolean) => act(`mark-${asin}`, async () => {
    const r = await api<{ shape: string | null }>(`/api/pl/niches/${n.id}`, { method: "POST", json: { action: "not-on-niche", asin, out } });
    toast.success(`${out ? `${asin} marked not on-niche` : `${asin} counted again`}: ${r.shape ?? "no on-niche sellers"} (no Keepa tokens)`);
  });
  const candidate = () => act("candidate", async () => {
    const r = await api<{ candidateId: string; existed: boolean; category?: string; asins?: number; keyword?: string; keywordFrom?: string; sell?: number | null }>(`/api/pl/niches/${n.id}`, { method: "POST", json: { action: "candidate" } });
    toast.success(r.existed ? "Already a candidate" : `Candidate created${r.category ? ` (fee category ${r.category})` : ""}`, r.existed ? undefined : {
      description: [`Keyword "${r.keyword}" (${r.keywordFrom === "conversion" ? "best-converting term" : "first term"})`, r.asins ? `${r.asins} page-one ASINs from the incumbent check` : "no incumbent check: add the page-one ASINs", r.sell != null ? `sell price £${r.sell.toFixed(2)} (niche average)` : null].filter(Boolean).join(" · "),
    });
    router.push(`/pl/candidates?c=${r.candidateId}`);
  });
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_1fr]">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {n.status !== "shortlisted" && n.status !== "candidate" && <Button size="sm" variant="secondary" disabled={!!busy} loading={busy === "shortlisted"} onClick={() => status("shortlisted")}>Shortlist</Button>}
          {n.status !== "dismissed" && n.status !== "candidate" && <Button size="sm" variant="secondary" disabled={!!busy} loading={busy === "dismissed"} onClick={() => status("dismissed")}>Dismiss</Button>}
          {(n.status === "shortlisted" || n.status === "dismissed") && <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => status("new")}>Reset</Button>}
          {inc?.candidates?.length ? <Button size="sm" variant="secondary" disabled={!!busy} loading={busy === "rerun"} onClick={() => check(true)} title="Reuses the last check's products and the 7-day snapshots">Rerun check</Button>
            : <Button size="sm" variant="secondary" disabled={!!busy} loading={busy === "check"} onClick={() => check(false)}>Check incumbents (Keepa)</Button>}
          {n.candidate_id ? <Button size="sm" variant="secondary" asChild><Link href={`/pl/candidates?c=${n.candidate_id}`}>Open candidate</Link></Button>
            : <Button size="sm" variant="secondary" disabled={!!busy} loading={busy === "candidate"} onClick={candidate}>Create candidate</Button>}
        </div>
        <div className="space-y-1.5">
          <h3 className="section-label">Score <span className="num">{n.score}</span> of 100</h3>
          {bd && <dl className="divide-y divide-divider rounded-lg border border-border bg-card text-meta">{Object.entries(bd).map(([k, c]) => (
            <div key={k} title={c.note} className="grid grid-cols-[6.5rem_3.5rem_minmax(0,1fr)] gap-2 px-3 py-1.5"><dt className="capitalize">{k}</dt><dd className="num text-right">{c.points} / {c.max}</dd><dd className="text-muted-foreground">{c.note}</dd></div>
          ))}
            <div title="From an Opportunity Explorer capture; not part of the 0–100 score" className="grid grid-cols-[6.5rem_3.5rem_minmax(0,1fr)] gap-2 px-3 py-1.5">
              <dt>Term conversion</dt>
              <dd className="text-right"><SignalChip s={n.term_signal} />{n.best_term_conversion != null && !n.term_signal && <span className="num">{n.best_term_conversion}%</span>}</dd>
              <dd className="text-muted-foreground">{n.best_term_conversion != null ? termSignalText(n.best_term_conversion, bestTerm(n)) : "Send the niche from Opportunity Explorer (the extension) to read its search terms' conversion"}</dd>
            </div>
          </dl>}
        </div>
        {n.extra.poe && <details className="text-meta"><summary className="cursor-pointer text-muted-foreground">Search terms from Opportunity Explorer ({n.extra.poe.terms.length}, {new Date(n.extra.poe.capturedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })})</summary>
          <table className="mt-1"><tbody>{[...n.extra.poe.terms].sort((a, b) => (b.conversion ?? -1) - (a.conversion ?? -1)).map((t) => (
            <tr key={t.term}><td className="py-0.5 pr-3">{t.term}</td><td className="num pr-3 text-right">{t.conversion != null ? `${t.conversion}%` : "—"}</td><td className="num text-right text-muted-foreground">{t.volume != null ? `${t.volume.toLocaleString("en-GB")}/mo` : ""}</td></tr>
          ))}</tbody></table></details>}
      </div>
      <div className="min-w-0 space-y-3">
        <label className="block space-y-1"><span className="field-label">Notes</span>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (n.notes ?? "") && act("notes", () => api(`/api/pl/niches/${n.id}`, { method: "PATCH", json: { notes } }))} /></label>
        {inc ? (
          <div className="space-y-2 text-meta">
            <div className="flex items-center gap-1">
              <h3 className="section-label">Incumbents</h3>
              <InfoTip label="About the shape"><p>Open: nobody over 1,000 reviews. Contested: one. Dominated: two or more, or one over 5,000.</p></InfoTip>
            </div>
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1"><span>For {(inc.terms ?? [inc.term]).map((t) => `“${t}”`).join(", ")}{inc.rootCategories?.length ? ` in ${inc.rootCategories.join(", ")}` : ""}:</span> {inc.shape ? <ShapeChip shape={inc.shape} /> : <span className="text-muted-foreground">no on-niche sellers</span>}
              <span className="text-muted-foreground">{inc.found.toLocaleString("en-GB")} products match{inc.onNiche != null ? `, ${inc.onNiche} on-niche of ${inc.candidates?.length ?? "?"} detailed` : ""} · {inc.tokensUsed} tokens{inc.reused ? `, ${inc.reused} reused` : ""}{inc.reusedFinder ? " (rerun)" : ""} · {new Date(inc.checkedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span></p>
            {inc.outside && <p><StatusChip tone="warn" title="Fewer than 5 products in the niche's categories: the same search ran on all of Amazon, with the same off-niche rules">Found outside {inc.rootCategories?.length ? inc.rootCategories.join(", ") : "its category"}</StatusChip></p>}
            {(inc.onNicheCategories?.length ?? 0) > 0 && <p className="flex flex-wrap items-center gap-1"><span className="text-muted-foreground">On-niche products filed under:</span>
              {inc.onNicheCategories!.map((c) => <span key={c.name} className={cn("rounded-full px-2 py-px text-xs", inc.rootCategories?.includes(c.name) ? "bg-primary-soft text-primary-ink" : "bg-subtle text-muted-foreground")}>{c.name} · {c.count}</span>)}</p>}
            {inc.onNiche == null && <p className="text-warn-ink">An old check (any word, all of Amazon): rerun it.</p>}
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full text-meta"><tbody className="divide-y divide-divider">{inc.incumbents.map((x) => (
                <tr key={x.asin} className="align-top">
                  <td className="py-1.5 pr-3 pl-3"><a className="num text-primary hover:underline" href={`https://www.amazon.co.uk/dp/${x.asin}`} target="_blank" rel="noreferrer">{x.asin}</a></td>
                  <td className="num py-1.5 pr-3 text-right whitespace-nowrap">{x.reviews?.toLocaleString("en-GB") ?? "?"} reviews</td>
                  <td className="num py-1.5 pr-3 text-right whitespace-nowrap">{x.monthlySold != null ? `${x.monthlySold.toLocaleString("en-GB")}+/mo` : x.rank != null ? `#${x.rank.toLocaleString("en-GB")}` : "—"}</td>
                  <td className="num py-1.5 pr-3 text-right">{gbp(x.price)}</td>
                  <td className="py-1.5 pr-3 text-muted-foreground">{x.category ?? ""}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{x.poe ? <span className="rounded-full bg-primary-soft px-2 py-px text-xs font-medium text-primary-ink" title={`Opportunity Explorer's #${x.poe.rank} clicked product for “${x.poe.term}”: counted on-niche whatever its title says`}>POE top clicked #{x.poe.rank}</span>
                    : x.matchedTerm && <span className={cn("rounded-full px-2 py-px text-xs", x.matchedHow === "words" ? "border border-dashed border-border-strong" : "bg-subtle")} title={x.matchedHow === "words" ? "Its title has every word of this search term within 4 words, in another order" : "Its title has this search term as a phrase"}>{x.matchedTerm}{x.matchedHow === "words" ? " (any order)" : ""}</span>}</td>
                  <td className="min-w-48 py-1.5 pr-3 text-muted-foreground">{(x.title ?? "").slice(0, 80)}</td>
                  <td className="py-1 pr-2 text-right whitespace-nowrap"><Button size="xs" variant="ghost" disabled={!!busy} title="Leave this product out of the shape, now and on every rerun" onClick={() => markOut(x.asin, true)}>Not on-niche</Button></td>
                </tr>
              ))}</tbody></table>
            </div>
            {!!inc.excludedCount && <details><summary className="cursor-pointer text-muted-foreground">{inc.excludedCount} off-niche left out{(() => { const m = inc.excluded?.filter((x) => x.why === "marked not on-niche by you").length ?? 0; return m ? ` (${m} marked by you)` : ""; })()}</summary>
              <ul className="mt-1 space-y-1">{inc.excluded?.map((x) => <li key={x.asin}><span className="num">{x.asin}</span> · <i>{x.why}</i> · <span className="text-muted-foreground">{(x.title ?? "").slice(0, 70)}</span>
                {x.why === "marked not on-niche by you" && <> · <Button variant="link" size="sm" className="text-meta" disabled={!!busy} onClick={() => markOut(x.asin, false)}>Undo</Button></>}</li>)}</ul></details>}
          </div>
        ) : (
          <p className="flex items-center gap-1 text-meta text-muted-foreground">No incumbent check yet (Keepa, up to ~83 tokens).
            <InfoTip label="About the incumbent check"><p>It looks at the best sellers for {(n.search_terms.length ? n.search_terms : [n.customer_need]).map((t) => `“${t}”`).join(", ")} in the niche&rsquo;s category, titles matching any of them and on-niche only, and their review counts.</p><p>Open: nobody over 1,000 reviews. Contested: one. Dominated: two or more, or one over 5,000.</p></InfoTip>
          </p>
        )}
      </div>
    </div>
  );
}
