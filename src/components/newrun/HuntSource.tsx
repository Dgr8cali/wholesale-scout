"use client";

import { CrosshairIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { InfoTip, SectionTitle } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { finderSelection, finderTokens, HUNT_RESULTS, huntName, type HuntShape } from "@/lib/hunt";
import { categoryEntry } from "@/lib/screening/categories";
import { api } from "@/lib/ui/client";
import { TextButton } from "@/components/ui/text-button";
import { FormSkeleton } from "@/components/ui/skeletons";

interface Start {
  profile: string; shape: HuntShape; rankByCategory: Record<string, number>;
  categories: { id: number; name: string; products: number | null }[]; tokensLeft: number | null; keepa: boolean;
}

function Num({ label, value, onChange, step, hint }: { label: string; value: number; onChange: (n: number) => void; step?: number; hint?: string }) {
  return (
    <label className="space-y-1.5">
      <span className="field-label">{label}</span>
      <Input className="num" type="number" min={0} step={step ?? 1} value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))} />
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

/** New run → Hunt: Keepa Product Finder matches for a profile, screened as a run with no cost. */
export function HuntSource() {
  const router = useRouter();
  const [start, setStart] = useState<Start | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shape, setShape] = useState<HuntShape | null>(null);
  const [busy, setBusy] = useState<"hunt" | "cats" | null>(null);

  useEffect(() => {
    api<Start>("/api/hunt").then((s) => { setStart(s); setShape(s.shape); }).catch((e: Error) => setError(e.message));
  }, []);
  const set = (p: Partial<HuntShape>) => setShape((s) => s && { ...s, ...p });
  const selection = useMemo(() => (shape ? finderSelection(shape) : null), [shape]);

  if (error) return <ErrorState title="Couldn't load Hunt" message={error} />;
  if (!start || !shape) return <FormSkeleton fields={8} />;

  // The category's own rank ceiling from the profile, else the profile-wide one.
  const profileRank = start.shape.maxRank;
  const rankFor = (name: string | null) => categoryEntry(start.rankByCategory, name)?.max ?? profileRank;
  const finder = finderTokens(shape.results);
  const short = start.tokensLeft != null && start.tokensLeft < finder;

  async function loadCategories() {
    setBusy("cats");
    try {
      const r = await api<{ categories: Start["categories"]; tokensUsed: number }>("/api/hunt/categories", { method: "POST" });
      setStart((s) => s && { ...s, categories: r.categories });
      toast.success(`${r.categories.length} categories${r.tokensUsed ? ` (${r.tokensUsed} token${r.tokensUsed === 1 ? "" : "s"})` : ""}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function hunt() {
    setBusy("hunt");
    try {
      const r = await api<{ runId: string | null; total: number; taken: number; tokensUsed: number }>("/api/hunt", { method: "POST", json: { shape } });
      if (!r.runId) {
        toast.info(`Nothing matched (${r.tokensUsed} tokens). Loosen the shape: a wider price band, more sellers or a higher rank.`);
        return;
      }
      // Keepa counts matches up to 10,000.
      toast.success(`${r.taken.toLocaleString("en-GB")} of ${r.total.toLocaleString("en-GB")}${r.total >= 10_000 ? "+" : ""} matches are being screened`, { description: `The finder used ${r.tokensUsed} tokens.` });
      router.push(`/runs/${r.runId}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <section className="panel space-y-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-56 flex-1 space-y-1.5">
            <span className="field-label">Category</span>
            <NativeSelect className="w-full" value={shape.category ? String(shape.category.id) : ""}
              onChange={(e) => {
                const c = start.categories.find((x) => String(x.id) === e.target.value) ?? null;
                set({ category: c ? { id: c.id, name: c.name } : null, maxRank: rankFor(c?.name ?? null) });
              }}>
              <NativeSelectOption value="">All categories</NativeSelectOption>
              {start.categories.map((c) => <NativeSelectOption key={c.id} value={String(c.id)}>{c.name}</NativeSelectOption>)}
            </NativeSelect>
          </label>
          {!start.categories.length && (
            <Button variant="secondary" onClick={loadCategories} disabled={(!!busy && busy !== "cats") || !start.keepa} loading={busy === "cats"}>
              Load categories (1 token)
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Num label="Min price (£)" value={shape.priceMin} step={0.5} onChange={(n) => set({ priceMin: n })} />
          <Num label="Max price (£)" value={shape.priceMax} step={0.5} onChange={(n) => set({ priceMax: n })} />
          <Num label="Min sellers" value={shape.sellersMin} onChange={(n) => set({ sellersMin: n })} hint="new offers" />
          <Num label="Max sellers" value={shape.sellersMax} onChange={(n) => set({ sellersMax: n })} hint="new offers" />
          <Num label="Max 90-day rank" value={shape.maxRank} step={1000} onChange={(n) => set({ maxRank: n })}
            hint={shape.category && categoryEntry(start.rankByCategory, shape.category.name) ? `${shape.category.name}'s ceiling` : "the profile's ceiling"} />
          <label className="space-y-1.5">
            <span className="field-label">Results</span>
            <NativeSelect className="w-full" value={String(shape.results)} onChange={(e) => set({ results: Number(e.target.value) })}>
              {HUNT_RESULTS.map((n) => <NativeSelectOption key={n} value={String(n)}>{n}</NativeSelectOption>)}
            </NativeSelect>
            <span className="block text-xs text-muted-foreground">best-ranked first</span>
          </label>
          <label className="col-span-2 flex items-center gap-2 self-center text-sm">
            <Switch checked={shape.noAmazon} onCheckedChange={(v) => set({ noAmazon: v })} /> No Amazon offer
          </label>
        </div>
        <div className="flex items-center gap-1">
          <TextButton className="text-meta font-medium" onClick={() => setShape({ ...start.shape, category: shape.category, maxRank: rankFor(shape.category?.name ?? null) })}>
            Reset to {start.profile}
          </TextButton>
          <InfoTip label="About sellers">
            <p>Sellers here are Keepa&apos;s count of new offers (FBA and merchant); the run&apos;s Competition gate then checks FBA sellers.</p>
          </InfoTip>
        </div>
      </section>

      <section className="panel space-y-3 p-4" aria-label="Cost">
        <SectionTitle title="Cost before you run it" />
        <ul className="space-y-1 text-sm">
          <li><b className="num">{finder}</b> tokens for the Product Finder (10, plus 1 per 100 results).</li>
          <li>
            Then screening the matches: up to <b className="num">{shape.results}</b> more for their history (1 each; history under the profile&apos;s max age is free),
            and 3 each for the Buy Box data of those that pass everything else.
          </li>
          <li className={short ? "font-medium text-danger" : "text-muted-foreground"}>
            Keepa balance: {start.tokensLeft == null ? "unknown" : `${start.tokensLeft.toLocaleString("en-GB")} tokens`}{short ? ": not enough for the finder yet" : ""}.
          </li>
        </ul>
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">Keepa query</summary>
          <pre className="num mt-1 overflow-x-auto rounded-lg bg-subtle p-2">{JSON.stringify(selection, null, 2)}</pre>
        </details>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={hunt} disabled={(!!busy && busy !== "hunt") || !start.keepa || short} loading={busy === "hunt"}>
            {busy === "hunt" ? "Hunting" : <><CrosshairIcon /> Hunt</>}
          </Button>
          <span className="text-xs text-muted-foreground">{huntName(shape)}</span>
        </div>
        {!start.keepa && <p className="text-xs text-danger">Keepa isn&apos;t set up: set KEEPA_API_KEY.</p>}
      </section>
    </div>
  );
}
