"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SETTINGS_DEF, type Settings } from "@/lib/pl/gatekeeper";
import { api } from "@/lib/ui/client";

/** Gatekeeper's thresholds and cost assumptions for Private label (shared by every candidate). */
export function PlSettingsTab() {
  const [s, setS] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fill = (x: Settings) => setS(Object.fromEntries(Object.entries(x).map(([k, v]) => [k, String(v)])));
  useEffect(() => {
    api<{ settings: Settings }>("/api/pl/settings").then((r) => fill(r.settings)).catch((e: Error) => setError(e.message));
  }, []);
  if (error) return <ErrorState title="Couldn't load the private-label settings" message={error} />;
  if (!s) return <Skeleton className="h-64 rounded-lg" />;
  const bad = SETTINGS_DEF.filter((d) => s[d.k] === "" || !Number.isFinite(Number(s[d.k]))).map((d) => d.label);
  const save = async () => {
    setSaving(true);
    try {
      fill((await api<{ settings: Settings }>("/api/pl/settings", { method: "PUT", json: Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Number(v)])) })).settings);
      toast.success("Saved: every candidate is scored with these now");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="panel space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="section-label">Private label</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">The budget, cost assumptions and Gate 6 floors used for every Private label candidate. Fees come from the rate card under Fees. Peak rates (October–December) apply automatically by date, as in screening.</p>
        </div>
        <Button variant="outline" onClick={save} disabled={saving || bad.length > 0}>Save</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SETTINGS_DEF.map((d) => (
          <label key={d.k} className="space-y-1.5">
            <span className="field-label">{d.label} ({d.unit})</span>
            <Input className="num" type="number" step="any" value={s[d.k]} disabled={d.k === "vat"} onChange={(e) => setS({ ...s, [d.k]: e.target.value })} />
            <span className="block text-2xs text-muted-foreground">{d.k === "vat" ? <>Set in <a className="text-brand underline" href="/settings?tab=business">Settings → Business</a>, with VAT registration</> : `Default ${d.d}`}</span>
          </label>
        ))}
      </div>
      {bad.length > 0 && <p className="text-sm text-fail">Needs a number: {bad.join(", ")}</p>}
      <BrandTermsEditor />
      <OffNicheEditor />
      <RfqTemplateEditor />
    </section>
  );
}

/** Niche Import's BIG_BRAND list: a search term that is or contains one of these flags its niche. */
function BrandTermsEditor() {
  const [text, setText] = useState<string | null>(null);
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<{ terms: string[] }>("/api/pl/niche-brands").then((r) => { setText(r.terms.join("\n")); setSaved(r.terms.join("\n")); }).catch(() => {}); }, []);
  if (text == null) return null;
  const save = async (reset = false) => {
    setBusy(true);
    try {
      const r = await api<{ terms: string[]; reflagged: number }>("/api/pl/niche-brands", { method: "PUT", json: { terms: reset ? null : text } });
      setText(r.terms.join("\n")); setSaved(r.terms.join("\n"));
      toast.success(`Brand list saved (${r.terms.length}); ${r.reflagged} niche${r.reflagged === 1 ? "" : "s"} re-flagged`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2 border-t pt-4" id="brand-terms">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Niche Import: brand terms</h3>
          <p className="max-w-3xl text-sm text-muted-foreground">A niche whose customer need or search terms is or contains one of these (a whole word or phrase) gets the <b>BIG_BRAND</b> flag: shoppers search for the brand, not the product. One a line. Saving re-flags every imported niche.</p>
        </div>
        <span className="flex gap-1.5">
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => save(true)}>Reset to defaults</Button>
          <Button variant="outline" size="sm" disabled={busy || text === saved} onClick={() => save()}>Save brands</Button>
        </span>
      </div>
      <textarea className="min-h-40 w-full max-w-xl rounded-md border bg-transparent px-2 py-1.5 font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} />
    </div>
  );
}

/** The incumbent check's off-niche words: a title with one of these isn't counted (a toy rod isn't a fishing rod). */
function OffNicheEditor() {
  const [text, setText] = useState<string | null>(null);
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<{ words: string[] }>("/api/pl/niche-off-words").then((r) => { setText(r.words.join("\n")); setSaved(r.words.join("\n")); }).catch(() => {}); }, []);
  if (text == null) return null;
  const save = async (reset = false) => {
    setBusy(true);
    try {
      const r = await api<{ words: string[] }>("/api/pl/niche-off-words", { method: "PUT", json: { words: reset ? null : text } });
      setText(r.words.join("\n")); setSaved(r.words.join("\n"));
      toast.success(`Off-niche words saved (${r.words.length})`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2 border-t pt-4" id="off-niche-words">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Niche Import: off-niche words</h3>
          <p className="max-w-3xl text-sm text-muted-foreground">The incumbent check leaves out a product whose title has one of these (a whole word or phrase): toys, kids&rsquo; and pet products, cards, gifts, parts and spares. A word the search term itself uses doesn&rsquo;t count, pet words don&rsquo;t count for a pet niche, and an accessory for any of the niche&rsquo;s terms (&ldquo;for&rdquo;, &ldquo;fits&rdquo; or &ldquo;compatible with&rdquo; just before one) is always left out. One a line. The next check uses them; rerun a niche to apply.</p>
        </div>
        <span className="flex gap-1.5">
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => save(true)}>Reset to defaults</Button>
          <Button variant="outline" size="sm" disabled={busy || text === saved} onClick={() => save()}>Save words</Button>
        </span>
      </div>
      <textarea className="min-h-40 w-full max-w-xl rounded-md border bg-transparent px-2 py-1.5 font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} />
    </div>
  );
}

/** Supplier Scout's RFQ: the template Copy RFQ fills from the candidate. */
function RfqTemplateEditor() {
  const [text, setText] = useState<string | null>(null);
  const [saved, setSaved] = useState("");
  const [vars, setVars] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<{ template: string; placeholders: Record<string, string> }>("/api/pl/rfq-template").then((r) => { setText(r.template); setSaved(r.template); setVars(r.placeholders); }).catch(() => {}); }, []);
  if (text == null) return null;
  const save = async (reset = false) => {
    setBusy(true);
    try {
      const r = await api<{ template: string }>("/api/pl/rfq-template", { method: "PUT", json: { template: reset ? null : text } });
      setText(r.template); setSaved(r.template);
      toast.success(reset ? "RFQ template back to the default" : "RFQ template saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2 border-t pt-4" id="rfq-template">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Supplier Scout: RFQ template</h3>
          <p className="max-w-3xl text-sm text-muted-foreground">What <b>Copy RFQ</b> on a candidate puts on the clipboard. Placeholders are filled from the candidate; a line with an empty one (no six words yet, no spec) is left out.</p>
          <p className="max-w-3xl text-xs text-muted-foreground">{Object.entries(vars).map(([k, v]) => <span key={k} className="mr-3 inline-block"><code>{`{{${k}}}`}</code> {v}</span>)}</p>
        </div>
        <span className="flex gap-1.5">
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => save(true)}>Reset to default</Button>
          <Button variant="outline" size="sm" disabled={busy || text === saved} onClick={() => save()}>Save template</Button>
        </span>
      </div>
      <textarea className="min-h-72 w-full max-w-3xl rounded-md border bg-transparent px-2 py-1.5 font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} />
    </div>
  );
}
