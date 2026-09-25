"use client";

import { RotateCcwIcon, ScanSearchIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { usePageCrumbs } from "@/components/Crumbs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { parseCheckInput } from "@/lib/check/parse";
import type { VerdictCard as Card } from "@/lib/server/check";
import { api, when } from "@/lib/ui/client";

interface Recent {
  id: string;
  name: string;
  status: string;
  startedAt: string;
  rows: number;
  input: string;
  supplier: string;
  codes: string[];
  summary: { pass: number; warn: number; fail: number; pending: number; score: number | null } | null;
}

interface Profile { id: string; name: string; is_default?: boolean }

const PLACEHOLDER = `B003AVM7XE
B0C62XSQS9, 4.73
https://www.amazon.co.uk/dp/B0F2HKZMPT  12.50
3337875597197  £6.20`;

export default function CheckPage() {
  usePageCrumbs([{ label: "Check ASINs" }]);
  const router = useRouter();
  const [text, setText] = useState("");
  const [supplier, setSupplier] = useState("");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfileId] = useState("");
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<Recent[] | null>(null);

  const loadRecent = useCallback(() => {
    api<{ checks: Recent[] }>("/api/check").then((r) => setRecent(r.checks)).catch(() => setRecent([]));
  }, []);
  useEffect(() => {
    loadRecent();
    api<{ profiles: Profile[] }>("/api/profiles").then((r) => {
      setProfiles(r.profiles);
      setProfileId(r.profiles.find((p) => p.is_default)?.id ?? r.profiles[0]?.id ?? "");
    }).catch(() => {});
  }, [loadRecent]);

  const parsed = useMemo(() => parseCheckInput(text), [text]);
  const asins = parsed.lines.filter((l) => l.kind === "asin").length;
  const withCost = parsed.lines.filter((l) => l.landedGbp != null).length;

  async function check(input = text, sup = supplier) {
    setBusy(true);
    try {
      const r = await api<{ runId: string; lines: number; errors: string[]; card: Card | null }>("/api/check", {
        method: "POST",
        json: { text: input, supplier: sup || null, profileId: profileId || null },
      });
      if (r.errors.length) toast.warning(`Skipped: ${r.errors.join("; ")}`);
      // One item: its card is shown on its run, above the row; several: the run.
      router.push(`/runs/${r.runId}`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="page-title">Check ASINs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste ASINs, EANs or Amazon links, one per line, each with a landed cost if you have one. They&apos;re screened like an upload
          (gates, fees, Keepa, gating) and land in Runs. With no cost you still get everything else, and the most it can cost landed.
        </p>
      </div>

      <form className="panel space-y-4 p-4" onSubmit={(e) => { e.preventDefault(); check(); }}>
        <div className="space-y-1.5">
          <Label htmlFor="check-input">ASINs, EANs or links, with an optional landed cost</Label>
          <Textarea id="check-input" rows={6} className="font-mono text-sm" placeholder={PLACEHOLDER} value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && parsed.lines.length && !busy) check(); }} />
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {parsed.lines.length
              ? `${parsed.lines.length} to check: ${asins} ASIN${asins === 1 ? "" : "s"}, ${parsed.lines.length - asins} EAN${parsed.lines.length - asins === 1 ? "" : "s"}; ${withCost} with a cost.`
              : "Landed cost = what one unit costs you delivered to Amazon, all in. \"ASIN, cost\" or \"ASIN cost\" per line."}
            {parsed.errors.length > 0 && <span className="text-warn"> {parsed.errors.join("; ")}</span>}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="check-supplier">Supplier</Label>
            <Input id="check-supplier" placeholder="Manual" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="check-profile">Profile</Label>
            <NativeSelect id="check-profile" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
              {profiles.map((p) => <NativeSelectOption key={p.id} value={p.id}>{p.name}{p.is_default ? " (default)" : ""}</NativeSelectOption>)}
            </NativeSelect>
          </div>
          <div className="flex items-end">
            <Button type="submit" className="w-full" disabled={busy || !parsed.lines.length}>
              <ScanSearchIcon /> {busy ? (parsed.lines.length === 1 ? "Checking… a few seconds" : "Starting…") : `Check ${parsed.lines.length || ""}`.trim()}
            </Button>
          </div>
        </div>
      </form>

      <section className="space-y-2">
        <h2 className="section-label">Recent checks</h2>
        {recent == null ? <p className="text-sm text-muted-foreground">Loading…</p> : !recent.length ? (
          <p className="text-sm text-muted-foreground">Your last 20 checks will be here to re-run.</p>
        ) : (
          <ul className="panel divide-y">
            {recent.map((c) => {
              const s = c.summary;
              const one = c.rows === 1 && s;
              const v = one ? (s.pass ? "pass" : s.warn ? "warn" : s.fail ? "fail" : null) : null;
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <Link href={`/runs/${c.id}`} className="block truncate text-sm font-medium underline-offset-2 hover:underline">{c.codes.join(", ")}</Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {when(c.startedAt)} · {c.supplier}
                      {c.input.includes(",") || /\s\d/.test(c.input) ? " · with cost" : ""}
                    </p>
                  </div>
                  {s?.pending ? <Badge variant="muted">Screening</Badge>
                    : v ? <Badge variant={v} className="uppercase">{v}{s?.score != null ? ` · ${Math.round(s.score)}` : ""}</Badge>
                    : s ? <span className="num text-xs text-muted-foreground">{s.pass} pass · {s.warn} warn · {s.fail} fail</span> : null}
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => { setText(c.input); setSupplier(c.supplier === "Manual" ? "" : c.supplier); check(c.input, c.supplier === "Manual" ? "" : c.supplier); }}
                    title="Check again with fresh data">
                    <RotateCcwIcon /> Re-run
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
