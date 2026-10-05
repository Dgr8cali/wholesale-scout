"use client";

import { ChevronRightIcon, LoaderIcon, SearchIcon, UploadIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { usePageCrumbs } from "@/components/Crumbs";
import { useDialogs } from "@/components/Dialogs";
import { SortTh, useServerSort } from "@/components/SortableTable";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
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
  incumbents: { asin: string; title: string | null; brand: string | null; reviews: number | null; price: number | null; monthlySold?: number | null; rank?: number | null; category?: string | null; matchedTerm?: string | null; matchedHow?: "phrase" | "words" | null }[];
}

const pct = (g: number | null | undefined, dp = 1) => (g == null ? "—" : `${g >= 0 ? "+" : ""}${(g * 100).toLocaleString("en-GB", { maximumFractionDigits: dp, minimumFractionDigits: dp })}%`);
const gbp = (v: number | null | undefined) => (v == null ? "—" : `£${v.toFixed(2)}`);
const n0 = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString("en-GB"));
const SHAPE_CLS = { open: "bg-pass-soft text-pass", contested: "bg-warn-soft text-warn", dominated: "bg-fail-soft text-fail" } as const;
const SIGNAL_CLS: Record<TermSignal, string> = { BUYING: "bg-pass-soft text-pass", BROWSE_ONLY: "bg-fail-soft text-fail" };
/** The BUYING / BROWSE-ONLY chip from a niche's best search-term conversion. */
function SignalChip({ s }: { s: TermSignal | null | undefined }) {
  return s ? <span className={cn("rounded-full px-1.5 py-px text-[10px] font-semibold whitespace-nowrap uppercase", SIGNAL_CLS[s])}>{TERM_SIGNAL_LABEL[s]}</span> : null;
}
const FLAG_CLS: Partial<Record<NicheFlag, string>> = { SPIKE: "bg-fail-soft text-fail", BIG_BRAND: "bg-fail-soft text-fail", REGULATED: "bg-warn-soft text-warn", ELECTRICAL: "bg-warn-soft text-warn", HEAVY_BULKY: "bg-warn-soft text-warn" };
const PRICE_BANDS: [string, string][] = [["", "Any price"], ["core", "£15–40"], ["mid", "£10–60"], ["low", "Under £10"], ["high", "Over £60"]];
const SORT_KEYS = ["need", "terms", "score", "sv", "g180", "g90", "price", "range", "clicked", "units", "returns", "flags", "shape", "status"];
const NUMERIC_SORTS = ["score", "sv", "g180", "g90", "price", "range", "clicked", "units", "returns", "flags"];
const PAGE_SIZES = [50, 100, 200, 500];
const OTHER = "__other";
const scoreTone = (s: number | null) => (s == null ? "" : s >= 60 ? "text-pass font-semibold" : s >= 40 ? "text-warn" : "text-muted-foreground");

/**
 * Private label → Niches: Opportunity Explorer category downloads, every niche scored from its own
 * figures (no Keepa) and flagged; shortlist, check incumbents (Keepa, one at a time) and make
 * candidates.
 */
export default function NichesPage() {
  usePageCrumbs([{ label: "Private label", href: "/pl/candidates" }, { label: "Niches" }]);
  const [f, setF] = useState<Filters>({ category: "", minScore: "", price: "", status: "active", q: "" });
  const [hide, setHide] = useState<Set<NicheFlag>>(new Set(DEFAULT_HIDDEN_FLAGS));
  const sorting = useServerSort("pl.niches", SORT_KEYS, NUMERIC_SORTS, { key: "score", dir: "desc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
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
  if (!data) return <Skeleton className="h-96 rounded-lg" />;
  return (
    <div className="space-y-5">
      <div className="max-w-3xl">
        <h1 className="page-title">Niches</h1>
        <p className="text-sm text-muted-foreground">
          Opportunity Explorer category downloads, every niche scored 0–100 from its own figures (demand, growth, price, fragmentation, units a product) and flagged. No Keepa tokens until you ask for an incumbent check.
          See <Link className="underline" href="/help/howto/pl-importing-niches">Private label: importing Opportunity Explorer niches</Link>.
        </p>
      </div>
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
      <h2 className="text-sm font-semibold">Import a category</h2>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm hover:bg-surface-2"
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); read(e.dataTransfer.files[0]); }}>
          <UploadIcon className="size-4" /> {file ? file.name : "Drop the Opportunity Explorer CSV, or choose it"}
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => read(e.target.files?.[0])} />
        </label>
        <label className="space-y-1"><span className="field-label">Opportunity Explorer category</span>
          <NativeSelect className="w-64" value={pick} onChange={(e) => { setPick(e.target.value); setPreview(null); }}>
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
          <span className="pb-2 text-xs text-muted-foreground" title="The rate card category a candidate created from these niches uses for its referral fee">
            Fee category: <b className="text-foreground">{listedFee ?? preview?.feeCategory}</b>
          </span>
        )}
        {pick === OTHER && !preview && other.trim() && <span className="pb-2 text-xs text-muted-foreground">Fee category: shown with the preview</span>}
        <Button variant="outline" disabled={!file || !category.trim() || busy} onClick={() => run("preview")}>{busy && !preview && <LoaderIcon className="animate-spin" />} Preview</Button>
        {preview && <Button disabled={busy} onClick={() => run("import")}>{busy && <LoaderIcon className="animate-spin" />} Import {preview.niches} niches</Button>}
      </div>
      {imports.length > 0 && <p className="text-xs text-muted-foreground">Imported: {imports.map((i) => `${i.category} (${i.row_count}, ${new Date(i.imported_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}; fees as ${i.feeCategory})`).join(" · ")}. Importing a category again replaces it; niches keep their status, notes and shape.</p>}
      {preview && (
        <div className="space-y-2 rounded-lg bg-surface-2 p-3 text-sm">
          <p>Header on line {preview.headerLine}: <b>{preview.rows}</b> rows read, <b>{preview.niches}</b> niches{preview.duplicates ? ` (${preview.duplicates} duplicates merged as aliases)` : ""}.{preview.replaces ? ` Replaces ${preview.replaces} niches already imported for "${category}".` : ""}</p>
          <details className="text-xs">
            <summary className="cursor-pointer">Columns: {Object.values(preview.mapped).filter(Boolean).length} mapped{preview.unmapped.length ? `, ${preview.unmapped.length} not recognised` : ""}</summary>
            <ul className="mt-1 grid gap-x-4 sm:grid-cols-2">{Object.entries(preview.mapped).map(([k, v]) => <li key={k}><span className="font-mono">{k}</span> ← {v ?? <span className="text-fail">not found</span>}</li>)}</ul>
          </details>
          {preview.unmapped.length > 0 && <p className="text-xs text-warn">Not recognised (kept in each row&apos;s raw data): {preview.unmapped.join(", ")}</p>}
          {preview.warnings.map((w) => <p key={w} className="text-xs text-warn">{w}</p>)}
          <div className="overflow-x-auto"><table className="w-full text-xs">
            <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-2">Customer need</th><th className="pr-2">Search terms</th><th className="pr-2 text-right">Score</th><th className="pr-2 text-right">SV 360d</th><th className="pr-2 text-right">Growth 180d</th><th className="pr-2 text-right">Avg price</th><th className="pr-2 text-right">Units/product</th><th>Flags</th></tr></thead>
            <tbody>{preview.sample.map((n) => (
              <tr key={n.customer_need} className="border-t"><td className="py-1 pr-2">{n.customer_need}{n.aliases.length ? <span className="text-muted-foreground"> (+{n.aliases.join(", ")})</span> : null}</td><td className="pr-2">{n.search_terms.join(", ")}</td>
                <td className="num pr-2 text-right">{n.score}</td><td className="num pr-2 text-right">{n0(n.sv_360)}</td><td className="num pr-2 text-right">{pct(n.growth_180)}</td><td className="num pr-2 text-right">{gbp(n.avg_price)}</td><td className="num pr-2 text-right">{n0(n.units_per_product_mid)}</td><td>{n.flags.join(", ")}</td></tr>
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
  const pager = (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">Showing <b className="num text-foreground">{first.toLocaleString("en-GB")}–{last.toLocaleString("en-GB")}</b> of <b className="num text-foreground">{data.total.toLocaleString("en-GB")}</b>{loading && " …"}</span>
      <span className="ml-auto flex items-center gap-1.5">
        <Button size="xs" variant="outline" disabled={page <= 1} onClick={() => setPage(1)}>First</Button>
        <Button size="xs" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
        <span className="num text-xs">Page {page} of {pages}</span>
        <Button size="xs" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
        <Button size="xs" variant="outline" disabled={page >= pages} onClick={() => setPage(pages)}>Last</Button>
        <NativeSelect className="h-7 text-xs" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} aria-label="Rows a page">
          {PAGE_SIZES.map((n) => <NativeSelectOption key={n} value={n}>{n} a page</NativeSelectOption>)}
        </NativeSelect>
      </span>
    </div>
  );
  return (
    <section className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" title={f.category ? `Over every niche in ${f.category}` : "Over every niche imported"}>
        {[
          ["Niches imported", data.stats.total],
          ["Scoring 60+", data.stats.scoring60],
          ["Hidden by flags", data.stats.hiddenByFlags],
          ["Shortlisted", data.stats.shortlisted],
          ["Incumbents checked", data.stats.checked],
        ].map(([l, v]) => <div key={l} className="rounded-lg bg-surface-2 px-3 py-2"><div className="text-[10.5px] tracking-wide text-muted-foreground uppercase">{l}</div><div className="num text-lg font-semibold">{Number(v).toLocaleString("en-GB")}</div></div>)}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1"><span className="field-label">Category</span>
          <NativeSelect value={f.category} onChange={(e) => change({ category: e.target.value })}>
            <NativeSelectOption value="">All</NativeSelectOption>{cats.map((c) => <NativeSelectOption key={c} value={c}>{c}</NativeSelectOption>)}
          </NativeSelect></label>
        <label className="space-y-1"><span className="field-label">Min score</span><Input className="num h-9 w-20" type="number" min={0} max={100} value={f.minScore} onChange={(e) => change({ minScore: e.target.value })} /></label>
        <label className="space-y-1"><span className="field-label">Price</span>
          <NativeSelect value={f.price} onChange={(e) => change({ price: e.target.value })}>{PRICE_BANDS.map(([k, l]) => <NativeSelectOption key={k} value={k}>{l}</NativeSelectOption>)}</NativeSelect></label>
        <label className="space-y-1"><span className="field-label">Status</span>
          <NativeSelect value={f.status} onChange={(e) => change({ status: e.target.value })}>
            <NativeSelectOption value="active">Not dismissed</NativeSelectOption><NativeSelectOption value="all">All</NativeSelectOption>
            {["new", "shortlisted", "dismissed", "candidate"].map((x) => <NativeSelectOption key={x} value={x}>{x[0].toUpperCase() + x.slice(1)}</NativeSelectOption>)}
          </NativeSelect></label>
        <div className="relative"><SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-9 w-56 pl-8" placeholder="Search needs and terms" value={f.q} onChange={(e) => change({ q: e.target.value })} /></div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-muted-foreground">Hide flagged:</span>
        {NICHE_FLAGS.map((x) => (
          <button key={x} type="button" aria-pressed={hide.has(x)} onClick={() => { const y = new Set(hide); if (y.has(x)) y.delete(x); else y.add(x); setHide(y); }}
            className={cn("rounded-full border px-2 py-0.5", hide.has(x) ? "border-ink-2 bg-ink-2 text-white" : "text-muted-foreground hover:text-foreground")}>{FLAG_LABEL[x]}</button>
        ))}
        <button type="button" className="ml-1 text-brand hover:underline" onClick={() => setHide(new Set(DEFAULT_HIDDEN_FLAGS))}>defaults</button>
      </div>
      {sel.size > 0 && (
        <div className="flex items-center gap-2 text-sm"><span>{sel.size} selected</span>
          <Button size="sm" onClick={() => bulk("shortlisted")}>Shortlist</Button><Button size="sm" variant="outline" onClick={() => bulk("dismissed")}>Dismiss</Button>
          <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => setSel(new Set())}>Clear</button></div>
      )}
      {pager}
      <div className={cn("overflow-x-auto rounded-lg border", loading && "opacity-70")}>
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-[11px] tracking-wide text-muted-foreground uppercase">
            <th className="w-8 px-2 py-1.5"><input type="checkbox" aria-label="Select all on this page" checked={allShown} onChange={() => setSel(allShown ? new Set() : new Set(rows.map((n) => n.id)))} /></th>
            <SortTh {...s.th("need")} className="px-2 py-1.5">Customer need</SortTh>
            <SortTh {...s.th("terms")} className="px-2 py-1.5">Search terms</SortTh>
            <SortTh {...s.th("score")} numeric className="px-2 py-1.5 text-right">Score</SortTh>
            <SortTh {...s.th("sv")} numeric className="px-2 py-1.5 text-right">SV 360d</SortTh>
            <SortTh {...s.th("g180")} numeric className="px-2 py-1.5 text-right">Growth 180d</SortTh>
            <SortTh {...s.th("g90")} numeric className="px-2 py-1.5 text-right">Growth 90d</SortTh>
            <SortTh {...s.th("price")} numeric className="px-2 py-1.5 text-right">Avg price</SortTh>
            <SortTh {...s.th("range")} numeric className="px-2 py-1.5 text-right">Min–max</SortTh>
            <SortTh {...s.th("clicked")} numeric className="px-2 py-1.5 text-right" title="Products sharing the clicks: more = less dominated">Top-clicked</SortTh>
            <SortTh {...s.th("conv")} numeric className="px-2 py-1.5 text-right" title="The best 360-day conversion among its search terms, from an Opportunity Explorer capture (the extension's Send to Private label). Buying: a term at 4%+; browse-only: none at 2.5%+">Best term conv.</SortTh>
            <SortTh {...s.th("units")} numeric className="px-2 py-1.5 text-right" title="Units a product a year: the midpoint of the average product's range">Units/product/yr</SortTh>
            <SortTh {...s.th("returns")} numeric className="px-2 py-1.5 text-right">Returns</SortTh>
            <SortTh {...s.th("flags")} className="px-2 py-1.5">Flags</SortTh>
            <SortTh {...s.th("shape")} className="px-2 py-1.5" title="Open, then contested, then dominated">Shape</SortTh>
            <SortTh {...s.th("status")} className="px-2 py-1.5">Status</SortTh>
          </tr></thead>
          <tbody>{rows.map((n) => (
            <Fragment key={n.id}>
              <tr className={cn("border-b align-top", sel.has(n.id) && "bg-brand-soft/30", n.status === "dismissed" && "opacity-60")}>
                <td className="px-2 py-1.5"><input type="checkbox" aria-label="Select" checked={sel.has(n.id)} onChange={() => toggle(n.id)} /></td>
                <td className="px-2 py-1.5">
                  <button type="button" className="flex items-start gap-1 text-left font-medium hover:text-brand" onClick={() => setOpen(open === n.id ? null : n.id)}>
                    <ChevronRightIcon className={cn("mt-0.5 size-3.5 flex-none transition-transform", open === n.id && "rotate-90")} />{n.customer_need}
                  </button>
                  {(n.categories?.length ?? 0) > 0 && (!f.category || n.categories.length > 1) && (
                    <span className="flex flex-wrap gap-1 pt-0.5 pl-4" title={n.categories.length > 1 ? "In each of these categories' downloads: one niche" : undefined}>
                      {n.categories.map((c) => <span key={c} className={cn("rounded-full px-1.5 py-px text-[10px]", c === f.category ? "bg-brand-soft text-brand" : "bg-surface-2 text-muted-foreground")}>{c}</span>)}
                    </span>
                  )}
                  {(n.extra.aliases?.length ?? 0) > 0 && <span className="block pl-4 text-2xs text-muted-foreground">also: {n.extra.aliases!.join(", ")}</span>}
                  {n.notes && <span className="block pl-4 text-2xs text-muted-foreground italic">{n.notes.slice(0, 80)}</span>}
                </td>
                <td className="max-w-56 px-2 py-1.5 text-xs text-muted-foreground">{n.search_terms.join(" · ")}</td>
                <td className={cn("num px-2 py-1.5 text-right", scoreTone(n.score))}>{n.score ?? "—"}</td>
                <td className="num px-2 py-1.5 text-right">{n0(n.sv_360)}</td>
                <td className={cn("num px-2 py-1.5 text-right", (n.growth_180 ?? 0) < 0 && "text-fail")}>{pct(n.growth_180)}</td>
                <td className={cn("num px-2 py-1.5 text-right", (n.growth_90 ?? 0) < 0 && "text-fail")}>{pct(n.growth_90)}</td>
                <td className="num px-2 py-1.5 text-right">{gbp(n.avg_price)}</td>
                <td className="num px-2 py-1.5 text-right text-xs text-muted-foreground whitespace-nowrap">{gbp(n.min_price)}–{gbp(n.max_price)}</td>
                <td className="num px-2 py-1.5 text-right">{n.top_clicked_products ?? "—"}</td>
                <td className="px-2 py-1.5 text-right">{n.best_term_conversion != null
                  ? <span className="inline-flex flex-col items-end gap-0.5" title={termSignalText(n.best_term_conversion)}><span className="num">{n.best_term_conversion}%</span><SignalChip s={n.term_signal} /></span>
                  : <span className="text-xs text-muted-foreground" title="Not sent from Opportunity Explorer yet">—</span>}</td>
                <td className="num px-2 py-1.5 text-right">{n0(n.units_per_product_mid)}</td>
                <td className="num px-2 py-1.5 text-right">{pct(n.return_rate, 2).replace("+", "")}</td>
                <td className="px-2 py-1.5"><span className="flex flex-wrap gap-1">{n.flags.map((x) => <span key={x} className={cn("rounded-full px-1.5 py-px text-[10px] font-semibold uppercase", FLAG_CLS[x as NicheFlag] ?? "bg-empty-soft text-ink-2")}>{FLAG_LABEL[x as NicheFlag] ?? x}</span>)}</span></td>
                <td className="px-2 py-1.5">{n.shape ? <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", SHAPE_CLS[n.shape])}>{n.shape}</span> : <span className="text-xs text-muted-foreground">—</span>}</td>
                <td className="px-2 py-1.5 text-xs">{n.status === "candidate" && n.candidate_id ? <Link className="text-brand underline" href={`/pl/candidates?c=${n.candidate_id}`}>candidate</Link> : n.status}</td>
              </tr>
              {open === n.id && <tr className="border-b bg-surface-2/50"><td /><td colSpan={15} className="px-2 py-3"><NicheDetail n={n} onChanged={onChanged} /></td></tr>}
            </Fragment>
          ))}</tbody>
        </table>
        {!rows.length && <p className="p-4 text-sm text-muted-foreground">No niche matches these filters.</p>}
      </div>
      {data.total > pageSize && pager}
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
    const plan = await api<{ term: string; terms: string[]; finderTerms: string[]; categories: string[]; estimate: number; fallback: number; balance: number | null; reserve: number; fits: boolean; blocked: string | null; reusing: boolean }>(`/api/pl/niches/${n.id}${rerun ? "?rerun=1" : ""}`);
    if (plan.blocked) throw new Error(plan.blocked);
    const where = plan.categories.length ? ` in ${plan.categories.join(", ")}` : " (no Keepa category for this niche: all of Amazon)";
    const q = (t: string[]) => t.map((x) => `"${x}"`).join(", ");
    const how = plan.reusing ? `the last check's products again (no Product Finder call), re-detailing only those not detailed in the last 7 days` : `${plan.finderTerms.length} Product Finder page${plan.finderTerms.length === 1 ? "" : "s"} (${q(plan.finderTerms)})${where}, then the top 25 detailed (ASINs detailed in the last 7 days are reused)`;
    if (!(await confirm({ title: `${rerun ? "Rerun" : "Check"} incumbents for "${plan.term}"?`, description: `Up to ${plan.estimate} Keepa tokens: ${how}.${plan.fallback ? ` If fewer than 5 products turn up in ${plan.categories.join(", ")}, the same search runs on all of Amazon (+${plan.fallback} tokens).` : ""} Only titles with one of ${q(plan.terms)} as a phrase and none of the off-niche words count; the 10 best sellers among them decide the shape. Balance ${plan.balance ?? "?"}, ${plan.reserve} kept in reserve${plan.fits ? "" : ": not enough now, wait for the refill"}.`, confirmLabel: plan.fits ? "Run the check" : "Close" }))) return;
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
    <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
      <div className="space-y-2">
        <p className="text-xs font-semibold">Score {n.score} of 100</p>
        {bd && <table className="w-full text-xs"><tbody>{Object.entries(bd).map(([k, c]) => (
          <tr key={k} title={c.note}><td className="py-0.5 pr-2 capitalize">{k}</td><td className="num pr-2 text-right">{c.points} / {c.max}</td><td className="text-muted-foreground">{c.note}</td></tr>
        ))}
          <tr title="From an Opportunity Explorer capture; not part of the 0–100 score" className="border-t">
            <td className="py-0.5 pr-2">Term conversion</td>
            <td className="pr-2 text-right"><SignalChip s={n.term_signal} />{n.best_term_conversion != null && !n.term_signal && <span className="num">{n.best_term_conversion}%</span>}</td>
            <td className="text-muted-foreground">{n.best_term_conversion != null ? termSignalText(n.best_term_conversion, bestTerm(n)) : "Send the niche from Opportunity Explorer (the extension) to read its search terms' conversion"}</td>
          </tr>
        </tbody></table>}
        {n.extra.poe && <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Search terms from Opportunity Explorer ({n.extra.poe.terms.length}, {new Date(n.extra.poe.capturedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })})</summary>
          <table className="mt-1"><tbody>{[...n.extra.poe.terms].sort((a, b) => (b.conversion ?? -1) - (a.conversion ?? -1)).map((t) => (
            <tr key={t.term}><td className="pr-2">{t.term}</td><td className="num pr-2 text-right">{t.conversion != null ? `${t.conversion}%` : "—"}</td><td className="num text-right text-muted-foreground">{t.volume != null ? `${t.volume.toLocaleString("en-GB")}/mo` : ""}</td></tr>
          ))}</tbody></table></details>}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {n.status !== "shortlisted" && n.status !== "candidate" && <Button size="xs" disabled={!!busy} onClick={() => status("shortlisted")}>Shortlist</Button>}
          {n.status !== "dismissed" && n.status !== "candidate" && <Button size="xs" variant="outline" disabled={!!busy} onClick={() => status("dismissed")}>Dismiss</Button>}
          {(n.status === "shortlisted" || n.status === "dismissed") && <Button size="xs" variant="ghost" disabled={!!busy} onClick={() => status("new")}>Reset</Button>}
          {inc?.candidates?.length ? <Button size="xs" variant="outline" disabled={!!busy} onClick={() => check(true)} title="Reuses the last check's products and the 7-day snapshots">{busy === "rerun" && <LoaderIcon className="animate-spin" />} Rerun check</Button>
            : <Button size="xs" variant="outline" disabled={!!busy} onClick={() => check(false)}>{busy === "check" && <LoaderIcon className="animate-spin" />} Check incumbents (Keepa)</Button>}
          {n.candidate_id ? <Button size="xs" variant="outline" asChild><Link href={`/pl/candidates?c=${n.candidate_id}`}>Open candidate</Link></Button>
            : <Button size="xs" variant="outline" disabled={!!busy} onClick={candidate}>{busy === "candidate" && <LoaderIcon className="animate-spin" />} Create candidate</Button>}
        </div>
      </div>
      <div className="space-y-2">
        <label className="block space-y-1"><span className="field-label">Notes</span>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (n.notes ?? "") && act("notes", () => api(`/api/pl/niches/${n.id}`, { method: "PATCH", json: { notes } }))} /></label>
        {inc ? (
          <div className="text-xs">
            <p><b>Incumbents for {(inc.terms ?? [inc.term]).map((t) => `“${t}”`).join(", ")}</b>{inc.rootCategories?.length ? ` in ${inc.rootCategories.join(", ")}` : ""}: {inc.shape ? <span className={cn("rounded-full px-1.5 py-px font-semibold", SHAPE_CLS[inc.shape as keyof typeof SHAPE_CLS])}>{inc.shape}</span> : <span className="text-muted-foreground">no on-niche sellers</span>} · {inc.found.toLocaleString("en-GB")} products match{inc.onNiche != null ? `, ${inc.onNiche} on-niche of ${inc.candidates?.length ?? "?"} detailed` : ""} · {inc.tokensUsed} tokens{inc.reused ? `, ${inc.reused} reused` : ""}{inc.reusedFinder ? " (rerun)" : ""} · {new Date(inc.checkedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</p>
            {inc.outside && <p className="mt-0.5"><span className="rounded-full bg-warn-soft px-1.5 py-px text-[10px] font-semibold text-warn uppercase" title="Fewer than 5 products in the niche's categories: the same search ran on all of Amazon, with the same off-niche rules">found outside {inc.rootCategories?.length ? inc.rootCategories.join(", ") : "its category"}</span></p>}
            {(inc.onNicheCategories?.length ?? 0) > 0 && <p className="mt-1 flex flex-wrap items-center gap-1"><span className="text-muted-foreground">On-niche products filed under:</span>
              {inc.onNicheCategories!.map((c) => <span key={c.name} className={cn("rounded-full px-1.5 py-px text-[10px]", inc.rootCategories?.includes(c.name) ? "bg-brand-soft text-brand" : "bg-surface-2 text-ink-2")}>{c.name} · {c.count}</span>)}</p>}
            {inc.onNiche == null && <p className="text-amber-700 dark:text-amber-400">An old check (any word, all of Amazon): rerun it.</p>}
            <table className="mt-1 text-xs"><tbody>{inc.incumbents.map((x) => (
              <tr key={x.asin} className="align-top">
                <td className="pr-2"><a className="num text-brand hover:underline" href={`https://www.amazon.co.uk/dp/${x.asin}`} target="_blank" rel="noreferrer">{x.asin}</a></td>
                <td className="num pr-2 text-right">{x.reviews?.toLocaleString("en-GB") ?? "?"} reviews</td>
                <td className="num pr-2 text-right">{x.monthlySold != null ? `${x.monthlySold.toLocaleString("en-GB")}+/mo` : x.rank != null ? `#${x.rank.toLocaleString("en-GB")}` : "—"}</td>
                <td className="num pr-2 text-right">{gbp(x.price)}</td>
                <td className="pr-2 text-muted-foreground">{x.category ?? ""}</td>
                <td className="whitespace-nowrap pr-2">{x.matchedTerm && <span className={cn("rounded-full px-1.5 py-px", x.matchedHow === "words" ? "border border-dashed" : "bg-muted")} title={x.matchedHow === "words" ? "Its title has every word of this search term within 4 words, in another order" : "Its title has this search term as a phrase"}>{x.matchedTerm}{x.matchedHow === "words" ? " (any order)" : ""}</span>}</td>
                <td className="pr-2 text-muted-foreground">{(x.title ?? "").slice(0, 80)}</td>
                <td className="whitespace-nowrap"><button type="button" disabled={!!busy} className="text-[11px] text-muted-foreground hover:text-fail hover:underline disabled:opacity-50" title="Leave this product out of the shape, now and on every rerun" onClick={() => markOut(x.asin, true)}>Not on-niche</button></td>
              </tr>
            ))}</tbody></table>
            {!!inc.excludedCount && <details className="mt-1"><summary className="cursor-pointer text-muted-foreground">{inc.excludedCount} off-niche left out{(() => { const m = inc.excluded?.filter((x) => x.why === "marked not on-niche by you").length ?? 0; return m ? ` (${m} marked by you)` : ""; })()}</summary>
              <ul className="mt-0.5 space-y-0.5">{inc.excluded?.map((x) => <li key={x.asin}><span className="num">{x.asin}</span> · <i>{x.why}</i> · <span className="text-muted-foreground">{(x.title ?? "").slice(0, 70)}</span>
                {x.why === "marked not on-niche by you" && <> · <button type="button" disabled={!!busy} className="text-brand hover:underline disabled:opacity-50" onClick={() => markOut(x.asin, false)}>Undo</button></>}</li>)}</ul></details>}
            <p className="mt-1 text-muted-foreground">Open: nobody over 1,000 reviews. Contested: one. Dominated: two or more, or one over 5,000.</p>
          </div>
        ) : <p className="text-xs text-muted-foreground">No incumbent check yet: it looks at the best sellers for {(n.search_terms.length ? n.search_terms : [n.customer_need]).map((t) => `“${t}”`).join(", ")} in the niche&rsquo;s category, titles matching any of them and on-niche only, and their review counts (Keepa, up to ~83 tokens).</p>}
      </div>
    </div>
  );
}
