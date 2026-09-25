"use client";

import { PlusIcon, SearchIcon, ShieldAlertIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState } from "@/components/States";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { IP_LEVELS, parseIpCsv, type IpLevel, type IpRiskBrand } from "@/lib/ipRisk";
import { api } from "@/lib/ui/client";
import { cn } from "@/lib/utils";

type Entry = IpRiskBrand & { id: string };

const LEVEL_STYLE: Record<IpLevel, string> = { high: "text-fail", medium: "text-warn", low: "text-muted-foreground" };
const aliasText = (a: string[]) => a.join("; ");
const aliasList = (s: string) => s.split(/[;,|]/).map((x) => x.trim()).filter(Boolean);
const today = () => new Date().toISOString().slice(0, 10);

/** Settings → IP risk: brands known to file IP or counterfeit complaints, and a CSV importer. */
export function IpRiskTab() {
  const [list, setList] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [unverified, setUnverified] = useState(false);
  const [draft, setDraft] = useState({ brand: "", level: "medium" as IpLevel, aliases: "", note: "", source: "", reported_on: today() });
  const [csv, setCsv] = useState("");
  const [csvSource, setCsvSource] = useState("");

  const load = () => api<{ brands: Entry[] }>("/api/ip-risk").then((r) => setList(r.brands)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function save(e: Partial<Entry>, id?: string) {
    try {
      const { brand } = await api<{ brand: Entry }>("/api/ip-risk", { method: "POST", json: { ...e, id } });
      setList((l) => {
        const rest = (l ?? []).filter((x) => x.id !== brand.id);
        return [...rest, brand].sort((a, b) => a.brand.localeCompare(b.brand));
      });
      return true;
    } catch (err) {
      toast.error((err as Error).message);
      return false;
    }
  }
  const update = (x: Entry, patch: Partial<Entry>) => save({ ...x, ...patch }, x.id);
  async function remove(x: Entry) {
    try {
      await api(`/api/ip-risk?id=${x.id}`, { method: "DELETE" });
      setList((l) => l && l.filter((y) => y.id !== x.id));
    } catch (err) {
      toast.error((err as Error).message);
    }
  }
  async function add() {
    if (await save({ ...draft, aliases: aliasList(draft.aliases) })) {
      toast.success(`${draft.brand} added`);
      setDraft({ brand: "", level: "medium", aliases: "", note: "", source: "", reported_on: today() });
    }
  }
  const preview = useMemo(() => (csv.trim() ? parseIpCsv(csv, { source: csvSource || undefined }) : null), [csv, csvSource]);
  async function importCsv() {
    try {
      const r = await api<{ added: number; updated: number; errors: string[] }>("/api/ip-risk/import", { method: "POST", json: { csv, source: csvSource || undefined } });
      toast.success(`Imported: ${r.added} added, ${r.updated} updated${r.errors.length ? `; ${r.errors.length} lines skipped` : ""}`);
      setCsv("");
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const shown = useMemo(() => (list ?? []).filter((x) => {
    if (unverified && !/unverified/i.test(x.source ?? "")) return false;
    const n = q.trim().toLowerCase();
    return !n || x.brand.toLowerCase().includes(n) || x.aliases.some((a) => a.toLowerCase().includes(n));
  }), [list, q, unverified]);

  if (error) return <ErrorState title="Couldn't load the IP-risk list" message={error} onRetry={load} />;
  if (!list) return <div className="space-y-4"><Skeleton className="h-40 rounded-lg" /><Skeleton className="h-64 rounded-lg" /></div>;
  const seeds = list.filter((x) => /unverified/i.test(x.source ?? "")).length;

  return (
    <div className="space-y-5">
      <section className="panel space-y-4 p-4 sm:p-5">
        <div className="space-y-1">
          <h2 className="section-label">IP-risk brands</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Brands known to file IP or counterfeit complaints against resellers. A product whose brand (or an alias) is here gets the
            compliance rule <b>IP-risk brand</b>: a warning by default; set that rule to fail on the Gates tab to drop high-risk brands
            (medium and low still only warn). On the Brands page, high risk halves the wholesale-friendly score.
            {seeds > 0 && <> <span className="text-warn">{seeds} entries are from the starter list, marked “seed, unverified”: check them before relying on them.</span></>}
          </p>
        </div>

        <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1.2fr_7rem_1.2fr_1.6fr_1fr_9rem_auto]">
          <Input placeholder="Brand" value={draft.brand} onChange={(e) => setDraft({ ...draft, brand: e.target.value })} aria-label="New brand" />
          <NativeSelect value={draft.level} onChange={(e) => setDraft({ ...draft, level: e.target.value as IpLevel })} aria-label="New level">
            {IP_LEVELS.map((l) => <NativeSelectOption key={l} value={l}>{l}</NativeSelectOption>)}
          </NativeSelect>
          <Input placeholder="Aliases; separated" value={draft.aliases} onChange={(e) => setDraft({ ...draft, aliases: e.target.value })} aria-label="New aliases" />
          <Input placeholder="Note, e.g. test buys then complaints" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} aria-label="New note" />
          <Input placeholder="Source" value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })} aria-label="New source" />
          <Input type="date" className="num" value={draft.reported_on} onChange={(e) => setDraft({ ...draft, reported_on: e.target.value })} aria-label="New date" />
          <Button onClick={add} disabled={!draft.brand.trim()}><PlusIcon /> Add</Button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-64">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Find a brand" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a brand" />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="ip-unverified" checked={unverified} onCheckedChange={setUnverified} />
            <Label htmlFor="ip-unverified" className="text-sm font-normal">Unverified only</Label>
          </div>
          <span className="text-sm text-muted-foreground"><span className="num font-medium text-foreground">{shown.length}</span> of {list.length}</span>
        </div>

        {!list.length ? (
          <EmptyState icon={<ShieldAlertIcon />} title="No IP-risk brands" className="border-dashed shadow-none">Add one above, or import a list below.</EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-3">Brand</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Aliases</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="w-10 pr-3" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((x) => (
                  <TableRow key={x.id} className="align-top">
                    <TableCell className="min-w-40 pl-3">
                      <Input defaultValue={x.brand} aria-label={`${x.brand} brand`} onBlur={(e) => e.target.value.trim() && e.target.value !== x.brand && update(x, { brand: e.target.value })} />
                    </TableCell>
                    <TableCell>
                      <NativeSelect className={cn("w-28 font-medium", LEVEL_STYLE[x.level])} value={x.level} aria-label={`${x.brand} level`}
                        onChange={(e) => update(x, { level: e.target.value as IpLevel })}>
                        {IP_LEVELS.map((l) => <NativeSelectOption key={l} value={l}>{l}</NativeSelectOption>)}
                      </NativeSelect>
                    </TableCell>
                    <TableCell className="min-w-40">
                      <Input defaultValue={aliasText(x.aliases)} placeholder="—" aria-label={`${x.brand} aliases`}
                        onBlur={(e) => e.target.value !== aliasText(x.aliases) && update(x, { aliases: aliasList(e.target.value) })} />
                    </TableCell>
                    <TableCell className="min-w-72">
                      <Input defaultValue={x.note ?? ""} aria-label={`${x.brand} note`} onBlur={(e) => e.target.value !== (x.note ?? "") && update(x, { note: e.target.value })} />
                    </TableCell>
                    <TableCell className="min-w-40">
                      <div className="flex items-center gap-1.5">
                        <Input defaultValue={x.source ?? ""} aria-label={`${x.brand} source`} onBlur={(e) => e.target.value !== (x.source ?? "") && update(x, { source: e.target.value })} />
                        {/unverified/i.test(x.source ?? "") && <Badge variant="warn" className="flex-none" title="From the starter list: check it">?</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input type="date" className="num w-36" defaultValue={x.reported_on ?? ""} aria-label={`${x.brand} date`}
                        onChange={(e) => update(x, { reported_on: e.target.value || null })} />
                    </TableCell>
                    <TableCell className="pr-3">
                      <Button variant="ghost" size="icon" aria-label={`Remove ${x.brand}`} onClick={() => remove(x)}><Trash2Icon /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="panel space-y-3 p-4 sm:p-5">
        <div className="space-y-1">
          <h2 className="section-label">Import a list</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Paste a CSV: a header naming <code>brand</code>, <code>level</code>, <code>note</code>, <code>source</code>, <code>date</code>, <code>aliases</code> in any
            order, or just one brand per line. Aliases are separated by ; and a missing level is medium. Brands already listed are updated; blank cells keep what&apos;s there.
          </p>
        </div>
        <Textarea rows={6} className="font-mono text-sm" value={csv} onChange={(e) => setCsv(e.target.value)} aria-label="CSV to import"
          placeholder={"brand,level,note,aliases\nExampleBrand,high,Test buys then counterfeit complaints,Example; ExampleCo"} />
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="csv-source">Source for rows without one</Label>
            <Input id="csv-source" className="w-72" placeholder="e.g. community list, Sept 2026" value={csvSource} onChange={(e) => setCsvSource(e.target.value)} />
          </div>
          <Button variant="outline" onClick={importCsv} disabled={!preview?.rows.length}><UploadIcon /> Import {preview?.rows.length ? preview.rows.length : ""}</Button>
          {preview && (
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {preview.rows.length} to import
              {preview.rows.length > 0 && ` (${preview.rows.filter((r) => list.some((x) => x.brand.toLowerCase() === r.brand.toLowerCase())).length} already listed)`}
              {preview.errors.length > 0 && <span className="text-warn"> · {preview.errors.slice(0, 3).join("; ")}{preview.errors.length > 3 ? ` and ${preview.errors.length - 3} more` : ""}</span>}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
