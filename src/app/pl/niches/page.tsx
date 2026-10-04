"use client";

import { ChevronRightIcon, LoaderIcon, SearchIcon, UploadIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { usePageCrumbs } from "@/components/Crumbs";
import { useDialogs } from "@/components/Dialogs";
import { SortTh, useSortable } from "@/components/SortableTable";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_HIDDEN_FLAGS, FLAG_LABEL, NICHE_FLAGS, type NicheFlag } from "@/lib/pl/nicheScore";
import type { NicheRow } from "@/lib/server/plNiches";
import { api } from "@/lib/ui/client";
import { cn } from "@/lib/utils";

interface Imp { id: string; category: string; imported_at: string; row_count: number; filename: string | null; unmapped: string[]; duplicates: number }
interface Data { imports: Imp[]; niches: NicheRow[] }
interface Preview {
  headerLine: number; mapped: Record<string, string | null>; unmapped: string[]; warnings: string[]; rows: number; niches: number; duplicates: number; replaces: number;
  sample: (NicheRow & { aliases: string[] })[];
}
interface Incumbents { term: string; found: number; shape: string; tokensUsed: number; reused: number; checkedAt: string; incumbents: { asin: string; title: string | null; brand: string | null; reviews: number | null; price: number | null }[] }

const pct = (g: number | null | undefined, dp = 1) => (g == null ? "—" : `${g >= 0 ? "+" : ""}${(g * 100).toLocaleString("en-GB", { maximumFractionDigits: dp, minimumFractionDigits: dp })}%`);
const gbp = (v: number | null | undefined) => (v == null ? "—" : `£${v.toFixed(2)}`);
const n0 = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString("en-GB"));
const SHAPE_CLS = { open: "bg-pass-soft text-pass", contested: "bg-warn-soft text-warn", dominated: "bg-fail-soft text-fail" } as const;
const FLAG_CLS: Partial<Record<NicheFlag, string>> = { SPIKE: "bg-fail-soft text-fail", BIG_BRAND: "bg-fail-soft text-fail", REGULATED: "bg-warn-soft text-warn", ELECTRICAL: "bg-warn-soft text-warn", HEAVY_BULKY: "bg-warn-soft text-warn" };
const PRICE_BANDS: [string, string, (p: number | null) => boolean][] = [
  ["", "Any price", () => true], ["core", "£15–40", (p) => p != null && p >= 15 && p <= 40], ["mid", "£10–60", (p) => p != null && p >= 10 && p <= 60],
  ["low", "Under £10", (p) => p != null && p < 10], ["high", "Over £60", (p) => p != null && p > 60],
];
const scoreTone = (s: number | null) => (s == null ? "" : s >= 60 ? "text-pass font-semibold" : s >= 40 ? "text-warn" : "text-muted-foreground");

/**
 * Private label → Niches: Opportunity Explorer category downloads, every niche scored from its own
 * figures (no Keepa) and flagged; shortlist, check incumbents (Keepa, one at a time) and make
 * candidates.
 */
export default function NichesPage() {
  usePageCrumbs([{ label: "Private label", href: "/pl/candidates" }, { label: "Niches" }]);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => { api<Data>("/api/pl/niches").then(setData).catch((e: Error) => setError(e.message)); }, []);
  useEffect(() => { load(); }, [load]);
  if (error) return <ErrorState title="Couldn't load the niches" message={error} onRetry={load} />;
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
      {data.niches.length > 0 && <NicheTable data={data} onChanged={load} />}
    </div>
  );
}

function ImportCard({ imports, onImported }: { imports: Imp[]; onImported: () => void }) {
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [category, setCategory] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const recent = [...new Set(imports.map((i) => i.category))];
  const read = async (f: File | undefined) => {
    if (!f) return;
    const text = await f.text();
    setFile({ name: f.name, text });
    setPreview(null);
    if (!category) {
      // "diy-tools.csv" → "DIY Tools" as a first guess; you can change it.
      const guess = f.name.replace(/\.csv$/i, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      setCategory(recent.find((r) => r.toLowerCase().replace(/[^a-z]/g, "") === guess.toLowerCase().replace(/[^a-z]/g, "")) ?? guess);
    }
  };
  const run = async (action: "preview" | "import") => {
    if (!file) return;
    setBusy(true);
    try {
      if (action === "preview") setPreview(await api<Preview>("/api/pl/niches", { method: "POST", json: { action, text: file.text, category } }));
      else {
        const r = await api<{ niches: number; duplicates: number; preserved: number; replaced: boolean }>("/api/pl/niches", { method: "POST", json: { action, text: file.text, category, filename: file.name } });
        toast.success(`${category}: ${r.niches} niches imported${r.duplicates ? `, ${r.duplicates} duplicates merged` : ""}${r.replaced ? `; the previous import replaced, ${r.preserved} kept their status and notes` : ""}`);
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
        <label className="space-y-1"><span className="field-label">Category</span>
          <Input className="w-56" list="niche-categories" value={category} onChange={(e) => { setCategory(e.target.value); setPreview(null); }} placeholder="e.g. DIY & Tools" />
          <datalist id="niche-categories">{recent.map((c) => <option key={c} value={c} />)}</datalist></label>
        <Button variant="outline" disabled={!file || !category.trim() || busy} onClick={() => run("preview")}>{busy && !preview && <LoaderIcon className="animate-spin" />} Preview</Button>
        {preview && <Button disabled={busy} onClick={() => run("import")}>{busy && <LoaderIcon className="animate-spin" />} Import {preview.niches} niches</Button>}
      </div>
      {imports.length > 0 && <p className="text-xs text-muted-foreground">Imported: {imports.map((i) => `${i.category} (${i.row_count}, ${new Date(i.imported_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })})`).join(" · ")}. Importing a category again replaces it; niches keep their status, notes and shape.</p>}
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

function NicheTable({ data, onChanged }: { data: Data; onChanged: () => void }) {
  const [f, setF] = useState({ category: "", minScore: "", price: "", status: "active", q: "" });
  const [hide, setHide] = useState<Set<NicheFlag>>(new Set(DEFAULT_HIDDEN_FLAGS));
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(200);
  const cats = [...new Set(data.niches.map((n) => n.category ?? ""))].filter(Boolean).sort();
  const q = f.q.trim().toLowerCase();
  const inScope = useMemo(() => data.niches.filter((n) => !f.category || n.category === f.category), [data.niches, f.category]);
  const hiddenByFlags = inScope.filter((n) => n.flags.some((x) => hide.has(x as NicheFlag))).length;
  const rows = useMemo(() => {
    const priceOk = PRICE_BANDS.find((b) => b[0] === f.price)?.[2] ?? (() => true);
    return inScope.filter((n) =>
    !n.flags.some((x) => hide.has(x as NicheFlag)) && (!f.minScore || (n.score ?? 0) >= Number(f.minScore)) && priceOk(n.avg_price)
    && (f.status === "all" || (f.status === "active" ? n.status !== "dismissed" : n.status === f.status))
    && (!q || n.customer_need.toLowerCase().includes(q) || n.search_terms.some((t) => t.toLowerCase().includes(q)) || (n.extra.aliases ?? []).some((a) => a.toLowerCase().includes(q))));
  }, [inScope, hide, f.minScore, f.price, f.status, q]);
  const s = useSortable("pl.niches", rows, {
    need: { value: (n) => n.customer_need }, terms: { value: (n) => n.search_terms[0] ?? "" }, score: { value: (n) => n.score, kind: "number" },
    sv: { value: (n) => n.sv_360, kind: "number" }, g180: { value: (n) => n.growth_180, kind: "number" }, g90: { value: (n) => n.growth_90, kind: "number" },
    price: { value: (n) => n.avg_price, kind: "number" }, range: { value: (n) => n.max_price, kind: "number" }, clicked: { value: (n) => n.top_clicked_products, kind: "number" },
    units: { value: (n) => n.units_per_product_mid, kind: "number" }, returns: { value: (n) => n.return_rate, kind: "number" },
    flags: { value: (n) => n.flags.length, kind: "number" }, shape: { value: (n) => (n.shape ? ["open", "contested", "dominated"].indexOf(n.shape) : null), kind: "number" }, status: { value: (n) => n.status },
  }, { key: "score", dir: "desc" });
  const shown = s.rows.slice(0, limit);
  const allShown = shown.length > 0 && shown.every((n) => sel.has(n.id));
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
  const all = data.niches;
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  return (
    <section className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          ["Niches imported", all.length],
          ["Scoring 60+", all.filter((n) => (n.score ?? 0) >= 60).length],
          ["Hidden by flags", hiddenByFlags],
          ["Shortlisted", all.filter((n) => n.status === "shortlisted").length],
          ["Incumbents checked", all.filter((n) => n.shape).length],
        ].map(([l, v]) => <div key={l} className="rounded-lg bg-surface-2 px-3 py-2"><div className="text-[10.5px] tracking-wide text-muted-foreground uppercase">{l}</div><div className="num text-lg font-semibold">{Number(v).toLocaleString("en-GB")}</div></div>)}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1"><span className="field-label">Category</span>
          <NativeSelect value={f.category} onChange={(e) => set({ category: e.target.value })}>
            <NativeSelectOption value="">All</NativeSelectOption>{cats.map((c) => <NativeSelectOption key={c} value={c}>{c}</NativeSelectOption>)}
          </NativeSelect></label>
        <label className="space-y-1"><span className="field-label">Min score</span><Input className="num h-9 w-20" type="number" min={0} max={100} value={f.minScore} onChange={(e) => set({ minScore: e.target.value })} /></label>
        <label className="space-y-1"><span className="field-label">Price</span>
          <NativeSelect value={f.price} onChange={(e) => set({ price: e.target.value })}>{PRICE_BANDS.map(([k, l]) => <NativeSelectOption key={k} value={k}>{l}</NativeSelectOption>)}</NativeSelect></label>
        <label className="space-y-1"><span className="field-label">Status</span>
          <NativeSelect value={f.status} onChange={(e) => set({ status: e.target.value })}>
            <NativeSelectOption value="active">Not dismissed</NativeSelectOption><NativeSelectOption value="all">All</NativeSelectOption>
            {["new", "shortlisted", "dismissed", "candidate"].map((x) => <NativeSelectOption key={x} value={x}>{x[0].toUpperCase() + x.slice(1)}</NativeSelectOption>)}
          </NativeSelect></label>
        <div className="relative"><SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-9 w-56 pl-8" placeholder="Search needs and terms" value={f.q} onChange={(e) => set({ q: e.target.value })} /></div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-muted-foreground">Hide flagged:</span>
        {NICHE_FLAGS.map((x) => (
          <button key={x} type="button" aria-pressed={hide.has(x)} onClick={() => setHide((h) => { const y = new Set(h); if (y.has(x)) y.delete(x); else y.add(x); return y; })}
            className={cn("rounded-full border px-2 py-0.5", hide.has(x) ? "border-ink-2 bg-ink-2 text-white" : "text-muted-foreground hover:text-foreground")}>{FLAG_LABEL[x]}</button>
        ))}
        <button type="button" className="ml-1 text-brand hover:underline" onClick={() => setHide(new Set(DEFAULT_HIDDEN_FLAGS))}>defaults</button>
        <span className="ml-auto text-muted-foreground">{rows.length.toLocaleString("en-GB")} shown</span>
      </div>
      {sel.size > 0 && (
        <div className="flex items-center gap-2 text-sm"><span>{sel.size} selected</span>
          <Button size="sm" onClick={() => bulk("shortlisted")}>Shortlist</Button><Button size="sm" variant="outline" onClick={() => bulk("dismissed")}>Dismiss</Button>
          <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => setSel(new Set())}>Clear</button></div>
      )}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-[11px] tracking-wide text-muted-foreground uppercase">
            <th className="w-8 px-2 py-1.5"><input type="checkbox" aria-label="Select all shown" checked={allShown} onChange={() => setSel(allShown ? new Set() : new Set(shown.map((n) => n.id)))} /></th>
            <SortTh {...s.th("need")} className="px-2 py-1.5">Customer need</SortTh>
            <SortTh {...s.th("terms")} className="px-2 py-1.5">Search terms</SortTh>
            <SortTh {...s.th("score")} numeric className="px-2 py-1.5 text-right">Score</SortTh>
            <SortTh {...s.th("sv")} numeric className="px-2 py-1.5 text-right">SV 360d</SortTh>
            <SortTh {...s.th("g180")} numeric className="px-2 py-1.5 text-right">Growth 180d</SortTh>
            <SortTh {...s.th("g90")} numeric className="px-2 py-1.5 text-right">Growth 90d</SortTh>
            <SortTh {...s.th("price")} numeric className="px-2 py-1.5 text-right">Avg price</SortTh>
            <SortTh {...s.th("range")} numeric className="px-2 py-1.5 text-right">Min–max</SortTh>
            <SortTh {...s.th("clicked")} numeric className="px-2 py-1.5 text-right" title="Products sharing the clicks: more = less dominated">Top-clicked</SortTh>
            <SortTh {...s.th("units")} numeric className="px-2 py-1.5 text-right" title="Units a product a year: the midpoint of the average product's range">Units/product/yr</SortTh>
            <SortTh {...s.th("returns")} numeric className="px-2 py-1.5 text-right">Returns</SortTh>
            <SortTh {...s.th("flags")} className="px-2 py-1.5">Flags</SortTh>
            <SortTh {...s.th("shape")} className="px-2 py-1.5">Shape</SortTh>
            <SortTh {...s.th("status")} className="px-2 py-1.5">Status</SortTh>
          </tr></thead>
          <tbody>{shown.map((n) => (
            <Fragment key={n.id}>
              <tr className={cn("border-b align-top", sel.has(n.id) && "bg-brand-soft/30", n.status === "dismissed" && "opacity-60")}>
                <td className="px-2 py-1.5"><input type="checkbox" aria-label="Select" checked={sel.has(n.id)} onChange={() => toggle(n.id)} /></td>
                <td className="px-2 py-1.5">
                  <button type="button" className="flex items-start gap-1 text-left font-medium hover:text-brand" onClick={() => setOpen(open === n.id ? null : n.id)}>
                    <ChevronRightIcon className={cn("mt-0.5 size-3.5 flex-none transition-transform", open === n.id && "rotate-90")} />{n.customer_need}
                  </button>
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
                <td className="num px-2 py-1.5 text-right">{n0(n.units_per_product_mid)}</td>
                <td className="num px-2 py-1.5 text-right">{pct(n.return_rate, 2).replace("+", "")}</td>
                <td className="px-2 py-1.5"><span className="flex flex-wrap gap-1">{n.flags.map((x) => <span key={x} className={cn("rounded-full px-1.5 py-px text-[10px] font-semibold uppercase", FLAG_CLS[x as NicheFlag] ?? "bg-empty-soft text-ink-2")}>{FLAG_LABEL[x as NicheFlag] ?? x}</span>)}</span></td>
                <td className="px-2 py-1.5">{n.shape ? <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", SHAPE_CLS[n.shape])}>{n.shape}</span> : <span className="text-xs text-muted-foreground">—</span>}</td>
                <td className="px-2 py-1.5 text-xs">{n.status === "candidate" && n.candidate_id ? <Link className="text-brand underline" href={`/pl/candidates?c=${n.candidate_id}`}>candidate</Link> : n.status}</td>
              </tr>
              {open === n.id && <tr className="border-b bg-surface-2/50"><td /><td colSpan={14} className="px-2 py-3"><NicheDetail n={n} onChanged={onChanged} /></td></tr>}
            </Fragment>
          ))}</tbody>
        </table>
      </div>
      {s.rows.length > limit && <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + 300)}>Show more ({(s.rows.length - limit).toLocaleString("en-GB")} left)</Button>}
    </section>
  );
}

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
  const check = () => act("check", async () => {
    const plan = await api<{ term: string; estimate: number; balance: number | null; reserve: number; fits: boolean; blocked: string | null }>(`/api/pl/niches/${n.id}`);
    if (plan.blocked) throw new Error(plan.blocked);
    if (!(await confirm({ title: `Check incumbents for "${plan.term}"?`, description: `Up to ${plan.estimate} Keepa tokens (one Product Finder page, then up to 10 best sellers detailed for their reviews; ASINs detailed in the last 7 days are reused). Balance ${plan.balance ?? "?"}, ${plan.reserve} kept in reserve${plan.fits ? "" : ": not enough now, wait for the refill"}.`, confirmLabel: plan.fits ? "Run the check" : "Close" }))) return;
    if (!plan.fits) return;
    const r = await api<Incumbents>(`/api/pl/niches/${n.id}`, { method: "POST", json: { action: "check" } });
    toast.success(`"${r.term}": ${r.shape} (${r.tokensUsed} token${r.tokensUsed === 1 ? "" : "s"})`);
  });
  const candidate = () => act("candidate", async () => {
    const r = await api<{ candidateId: string; existed: boolean; category?: string }>(`/api/pl/niches/${n.id}`, { method: "POST", json: { action: "candidate" } });
    toast.success(r.existed ? "Already a candidate" : `Candidate created${r.category ? ` (fee category ${r.category})` : ""}`);
    router.push(`/pl/candidates?c=${r.candidateId}`);
  });
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
      <div className="space-y-2">
        <p className="text-xs font-semibold">Score {n.score} of 100</p>
        {bd && <table className="w-full text-xs"><tbody>{Object.entries(bd).map(([k, c]) => (
          <tr key={k} title={c.note}><td className="py-0.5 pr-2 capitalize">{k}</td><td className="num pr-2 text-right">{c.points} / {c.max}</td><td className="text-muted-foreground">{c.note}</td></tr>
        ))}</tbody></table>}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {n.status !== "shortlisted" && n.status !== "candidate" && <Button size="xs" disabled={!!busy} onClick={() => status("shortlisted")}>Shortlist</Button>}
          {n.status !== "dismissed" && n.status !== "candidate" && <Button size="xs" variant="outline" disabled={!!busy} onClick={() => status("dismissed")}>Dismiss</Button>}
          {(n.status === "shortlisted" || n.status === "dismissed") && <Button size="xs" variant="ghost" disabled={!!busy} onClick={() => status("new")}>Reset</Button>}
          <Button size="xs" variant="outline" disabled={!!busy} onClick={check}>{busy === "check" && <LoaderIcon className="animate-spin" />} Check incumbents (Keepa)</Button>
          {n.candidate_id ? <Button size="xs" variant="outline" asChild><Link href={`/pl/candidates?c=${n.candidate_id}`}>Open candidate</Link></Button>
            : <Button size="xs" variant="outline" disabled={!!busy} onClick={candidate}>{busy === "candidate" && <LoaderIcon className="animate-spin" />} Create candidate</Button>}
        </div>
      </div>
      <div className="space-y-2">
        <label className="block space-y-1"><span className="field-label">Notes</span>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (n.notes ?? "") && act("notes", () => api(`/api/pl/niches/${n.id}`, { method: "PATCH", json: { notes } }))} /></label>
        {inc ? (
          <div className="text-xs">
            <p><b>Incumbents for &ldquo;{inc.term}&rdquo;</b>: <span className={cn("rounded-full px-1.5 py-px font-semibold", SHAPE_CLS[inc.shape as keyof typeof SHAPE_CLS])}>{inc.shape}</span> · {inc.found.toLocaleString("en-GB")} products match · {inc.tokensUsed} tokens{inc.reused ? `, ${inc.reused} reused` : ""} · {new Date(inc.checkedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</p>
            <ul className="mt-1 space-y-0.5">{inc.incumbents.map((x) => (
              <li key={x.asin}><a className="num text-brand hover:underline" href={`https://www.amazon.co.uk/dp/${x.asin}`} target="_blank" rel="noreferrer">{x.asin}</a> <span className="num">{x.reviews?.toLocaleString("en-GB") ?? "?"} reviews</span> · {gbp(x.price)} · <span className="text-muted-foreground">{(x.title ?? "").slice(0, 80)}</span></li>
            ))}</ul>
            <p className="mt-1 text-muted-foreground">Open: nobody over 1,000 reviews. Contested: one. Dominated: two or more, or one over 5,000.</p>
          </div>
        ) : <p className="text-xs text-muted-foreground">No incumbent check yet: it looks at the best sellers for &ldquo;{n.search_terms[0] ?? n.customer_need}&rdquo; and their review counts (Keepa, up to ~31 tokens).</p>}
      </div>
    </div>
  );
}
