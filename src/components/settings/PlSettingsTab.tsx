"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { InfoTip, SectionTitle } from "@/components/ui/info-tip";
import { toast } from "sonner";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SETTINGS_DEF, type Settings } from "@/lib/pl/gatekeeper";
import { api } from "@/lib/ui/client";
import { useDirty } from "@/lib/ui/useDirty";
import { FormSkeleton } from "@/components/ui/skeletons";

/** Gatekeeper's thresholds and cost assumptions for Private label (shared by every candidate). */
export function PlSettingsTab() {
  const [s, setS] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { dirty, settle } = useDirty(s);
  const fill = (x: Settings) => {
    const y = Object.fromEntries(Object.entries(x).map(([k, v]) => [k, String(v)]));
    setS(y);
    settle(y);
  };
  useEffect(() => {
    api<{ settings: Settings }>("/api/pl/settings").then((r) => fill(r.settings)).catch((e: Error) => setError(e.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load once, on open
  }, []);
  if (error) return <ErrorState title="Couldn't load the private-label settings" message={error} />;
  if (!s) return <FormSkeleton fields={8} />;
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
          <SectionTitle title={<>Private label</>}>The budget, cost assumptions and Gate 6 floors used for every Private label candidate. Fees come from the rate card under Fees. Peak rates (October–December) apply automatically by date, as in screening.</SectionTitle>
        </div>
        <Button variant="secondary" onClick={save} disabled={!dirty || bad.length > 0} loading={saving}>Save</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SETTINGS_DEF.map((d) => (
          <label key={d.k} className="space-y-1.5">
            <span className="field-label">{d.label} ({d.unit})</span>
            <Input className="num" type="number" step="any" value={s[d.k]} disabled={d.k === "vat"} aria-invalid={bad.includes(d.label)} onChange={(e) => setS({ ...s, [d.k]: e.target.value })} />
            {bad.includes(d.label)
              ? <span className="block text-xs text-danger">Enter a number (the default is {d.d})</span>
              : <span className="block text-xs text-muted-foreground">{d.k === "vat" ? <>Set in <Link className="link" href="/settings?tab=business">Settings → Business</Link>, with VAT registration</> : `Default ${d.d}`}</span>}
          </label>
        ))}
      </div>
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
    <div className="space-y-2 border-t border-divider pt-4" id="brand-terms">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-1"><h3 className="text-sm font-semibold">Niche Import: brand terms</h3><InfoTip label="More about Niche Import: brand terms">A niche whose customer need or search terms is or contains one of these (a whole word or phrase) gets the <b>BIG_BRAND</b> flag: shoppers search for the brand, not the product. One a line. Saving re-flags every imported niche.</InfoTip></div>
        </div>
        <span className="flex gap-1.5">
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => save(true)}>Reset to defaults</Button>
          <Button variant="secondary" size="sm" disabled={busy || text === saved} onClick={() => save()}>Save brands</Button>
        </span>
      </div>
      <Textarea aria-label="Niche Import: brand terms, one a line" className="min-h-40 max-w-xl font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} />
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
    <div className="space-y-2 border-t border-divider pt-4" id="off-niche-words">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-1"><h3 className="text-sm font-semibold">Niche Import: off-niche words</h3><InfoTip label="More about Niche Import: off-niche words">The incumbent check leaves out a product whose title has one of these (a whole word or phrase): toys, kids&rsquo; and pet products, cards, gifts, parts and spares. A word the search term itself uses doesn&rsquo;t count, pet words don&rsquo;t count for a pet niche, and an accessory for any of the niche&rsquo;s terms (&ldquo;for&rdquo;, &ldquo;fits&rdquo; or &ldquo;compatible with&rdquo; just before one) is always left out. One a line. The next check uses them; rerun a niche to apply.</InfoTip></div>
        </div>
        <span className="flex gap-1.5">
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => save(true)}>Reset to defaults</Button>
          <Button variant="secondary" size="sm" disabled={busy || text === saved} onClick={() => save()}>Save words</Button>
        </span>
      </div>
      <Textarea aria-label="Niche Import: off-niche words, one a line" className="min-h-40 max-w-xl font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} />
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
    <div className="space-y-2 border-t border-divider pt-4" id="rfq-template">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-1"><h3 className="text-sm font-semibold">Supplier Scout: RFQ template</h3><InfoTip label="More about Supplier Scout: RFQ template">What <b>Copy RFQ</b> on a candidate puts on the clipboard. Placeholders are filled from the candidate; a line with an empty one (no six words yet, no spec) is left out.</InfoTip></div>
          <p className="max-w-3xl text-xs text-muted-foreground">{Object.entries(vars).map(([k, v]) => <span key={k} className="mr-3 inline-block"><code>{`{{${k}}}`}</code> {v}</span>)}</p>
        </div>
        <span className="flex gap-1.5">
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => save(true)}>Reset to default</Button>
          <Button variant="secondary" size="sm" disabled={busy || text === saved} onClick={() => save()}>Save template</Button>
        </span>
      </div>
      <Textarea aria-label="Supplier Scout: RFQ template" className="min-h-72 max-w-3xl font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} />
    </div>
  );
}
