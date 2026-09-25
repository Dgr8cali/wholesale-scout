"use client";

import { CheckIcon, FileSpreadsheetIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import {
  applyMapping,
  currencyFromHeader,
  CURRENCIES,
  detectHeaderRow,
  MAX_FILE_BYTES,
  MAX_ROWS,
  guessMapping,
  headerFingerprint,
  headersOf,
  MAPPABLE_FIELDS,
  rememberedMapping,
  type Cell,
  type ColumnMapping,
  type FieldKey,
} from "@/lib/ingest/mapping";
import { api, gbp } from "@/lib/ui/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const STEPS = ["Drop", "Map", "Review", "Screen"] as const;
type Step = 0 | 1 | 2 | 3;

/** The first few non-empty values under a header, to show what a column holds. */
function sampleOf(rows: Cell[][], headerRow: number, header: string | undefined): string | null {
  if (!header) return null;
  const col = (rows[headerRow] ?? []).findIndex((h) => String(h ?? "").trim() === header);
  if (col < 0) return null;
  const vals: string[] = [];
  for (let i = headerRow + 1; i < rows.length && vals.length < 3; i++) {
    const v = rows[i]?.[col];
    if (v != null && String(v).trim() !== "") vals.push(String(v).trim());
  }
  return vals.length ? vals.join(" · ") : null;
}
interface Supplier { id: string; name: string; vat_basis: "ex_vat" | "inc_vat"; vat_rate: number; currency: string }
interface Profile { id: string; name: string; is_default: boolean }
interface SavedMapping { mapping: ColumnMapping; supplier: Supplier }

interface FileState {
  key: string;
  fileName: string;
  sheetNames: string[];
  sheet: string;
  workbook: XLSX.WorkBook;
  rows: Cell[][];
  mapping: ColumnMapping;
  remembered: string | null;
  supplier: { name: string; vatBasis: "ex_vat" | "inc_vat"; vatRate: number; currency: string };
  fx: { rate: number; date: string; source: string };
  fxError: string | null;
  /** Set when the currency was read from the price column's header. */
  currencyHint: string | null;
}

const today = () => new Date().toISOString().slice(0, 10);

function sheetRows(wb: XLSX.WorkBook, name: string): Cell[][] {
  return XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: false });
}

async function fetchFx(currency: string) {
  return api<{ rate: number; date: string; source: string }>(`/api/fx?from=${currency}`);
}

export default function UploadPage() {
  const router = useRouter();
  const [files, setFiles] = useState<FileState[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfileId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>(0);
  const [tab, setTab] = useState<string>("");

  useEffect(() => {
    api<{ suppliers: Supplier[] }>("/api/suppliers").then((r) => setSuppliers(r.suppliers)).catch(() => {});
    api<{ profiles: Profile[] }>("/api/profiles").then((r) => {
      setProfiles(r.profiles);
      setProfileId(r.profiles.find((p) => p.is_default)?.id ?? r.profiles[0]?.id ?? "");
    }).catch((e) => setError(e.message));
  }, []);

  const update = (key: string, fn: (f: FileState) => FileState) => setFiles((fs) => fs.map((f) => (f.key === key ? fn(f) : f)));

  async function loadLayout(f: FileState): Promise<FileState> {
    const headerRow = detectHeaderRow(f.rows);
    const headers = headersOf(f.rows, headerRow);
    const fp = headerFingerprint(headers);
    try {
      const { mappings } = await api<{ mappings: SavedMapping[] }>(`/api/mappings?fingerprint=${fp}`);
      const saved = mappings[0];
      if (saved?.supplier) {
        const s = saved.supplier;
        const fx = s.currency === "GBP" ? { rate: 1, date: today(), source: "fixed" } : await fetchFx(s.currency).catch(() => ({ rate: 0, date: today(), source: "" }));
        return {
          ...f,
          // The saved layout's columns, on this file's own header row.
          mapping: rememberedMapping(f.rows, saved.mapping, fp),
          remembered: s.name,
          supplier: { name: s.name, vatBasis: s.vat_basis, vatRate: Number(s.vat_rate), currency: s.currency },
          fx,
          fxError: fx.rate ? null : "Couldn't fetch a rate; enter it by hand",
        };
      }
    } catch {
      // No saved layout, or not connected: fall back to guessing.
    }
    const columns = guessMapping(headers);
    const fresh: FileState = { ...f, mapping: { headerRow, columns, pricePer: "unit" }, remembered: null };
    return withHeaderCurrency(fresh, columns.unitPrice);
  }

  /** Pre-select the currency (and its ECB rate) named in the price column's header. */
  async function withHeaderCurrency(f: FileState, priceHeader: string | undefined): Promise<FileState> {
    const code = currencyFromHeader(priceHeader);
    if (!code) return { ...f, currencyHint: null };
    const hint = `Currency from the \u201c${priceHeader}\u201d column header`;
    if (code === "GBP") return { ...f, supplier: { ...f.supplier, currency: "GBP" }, fx: { rate: 1, date: today(), source: "fixed" }, fxError: null, currencyHint: hint };
    try {
      const fx = await fetchFx(code);
      return { ...f, supplier: { ...f.supplier, currency: code }, fx, fxError: null, currencyHint: hint };
    } catch (e) {
      return { ...f, supplier: { ...f.supplier, currency: code }, fx: { rate: 0, date: today(), source: "" }, fxError: (e as Error).message, currencyHint: hint };
    }
  }

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    for (const file of Array.from(list)) {
      if (file.size > MAX_FILE_BYTES) {
        setError(`${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is ${MAX_FILE_BYTES / 1024 / 1024} MB per file. Filter the export or split it.`);
        continue;
      }
      try {
        const buf = await file.arrayBuffer();
        const isText = /\.(csv|tsv|txt)$/i.test(file.name);
        const wb = XLSX.read(buf, { type: "array", raw: isText, dense: true });
        const sheet = wb.SheetNames[0];
        const base: FileState = {
          key: `${file.name}-${file.size}-${file.lastModified}`,
          fileName: file.name,
          sheetNames: wb.SheetNames,
          sheet,
          workbook: wb,
          rows: sheetRows(wb, sheet),
          mapping: { headerRow: 0, columns: {}, pricePer: "unit" },
          remembered: null,
          supplier: { name: file.name.replace(/\.[^.]+$/, ""), vatBasis: "ex_vat", vatRate: 20, currency: "GBP" },
          fx: { rate: 1, date: today(), source: "fixed" },
          fxError: null,
          currencyHint: null,
        };
        const ready = await loadLayout(base);
        setFiles((fs) => [...fs.filter((f) => f.key !== ready.key), ready]);
        setTab((t) => t || ready.key);
      } catch (e) {
        setError(`${file.name}: ${(e as Error).message}`);
      }
    }
  }

  async function setCurrency(key: string, currency: string) {
    update(key, (f) => ({ ...f, supplier: { ...f.supplier, currency }, fx: { rate: currency === "GBP" ? 1 : f.fx.rate, date: today(), source: currency === "GBP" ? "fixed" : "…" }, fxError: null, currencyHint: null }));
    if (currency === "GBP") return;
    try {
      const fx = await fetchFx(currency);
      update(key, (f) => ({ ...f, fx, fxError: null }));
    } catch (e) {
      update(key, (f) => ({ ...f, fxError: (e as Error).message }));
    }
  }

  function pickSupplier(key: string, name: string) {
    const s = suppliers.find((x) => x.name.toLowerCase() === name.trim().toLowerCase());
    update(key, (f) => ({ ...f, supplier: s ? { name: s.name, vatBasis: s.vat_basis, vatRate: Number(s.vat_rate), currency: s.currency } : { ...f.supplier, name } }));
    if (s && s.currency !== "GBP") setCurrency(key, s.currency);
  }

  const previews = useMemo(
    () => Object.fromEntries(files.map((f) => [f.key, f.fx.rate > 0 ? applyMapping(f.rows, f.mapping, f.supplier, f.fx) : null])),
    [files],
  );

  const mapProblems = (f: FileState) => {
    const p: string[] = [];
    if (!f.mapping.columns.ean) p.push(`${f.fileName}: map the EAN column`);
    if (!f.mapping.columns.unitPrice) p.push(`${f.fileName}: map the unit price column`);
    if (!f.supplier.name.trim()) p.push(`${f.fileName}: name the supplier`);
    if (!(f.fx.rate > 0)) p.push(`${f.fileName}: enter an FX rate`);
    if (f.mapping.columns.packUnits && !f.mapping.pricePer) p.push(`${f.fileName}: say whether price is per piece or per pack`);
    return p;
  };
  const problems = files.flatMap(mapProblems);
  const rowTotal = files.reduce((a, f) => a + (previews[f.key]?.rows.length ?? 0), 0);
  if (rowTotal > MAX_ROWS) problems.push(`${rowTotal.toLocaleString("en-GB")} rows is over the ${MAX_ROWS.toLocaleString("en-GB")}-row limit per upload: remove a file or split it`);
  const totalRows = files.reduce((a, f) => a + (previews[f.key]?.rows.length ?? 0), 0);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        profileId,
        files: files.map((f) => {
          const headers = headersOf(f.rows, f.mapping.headerRow);
          return {
            fileName: f.fileName,
            supplier: f.supplier,
            headers,
            fingerprint: headerFingerprint(headers),
            mapping: f.mapping,
            fx: { rate: f.fx.rate, date: f.fx.date },
            rows: previews[f.key]!.rows,
          };
        }),
      };
      const { runId } = await api<{ runId: string }>("/api/ingest", { method: "POST", json: payload });
      router.push(`/runs/${runId}`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  // Can the user move past each step?
  const mapped = files.length > 0 && problems.filter((p) => !p.includes("-row limit")).length === 0;
  const canReach = (s: Step) => s === 0 || (s === 1 && files.length > 0) || (s === 2 && mapped) || (s === 3 && mapped && totalRows > 0 && totalRows <= MAX_ROWS);
  const allRemembered = files.length > 0 && files.every((f) => f.remembered) && mapped;
  const current = files.find((f) => f.key === tab) ?? files[0];
  const next = (s: Step) => canReach(s) && setStep(s);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="page-title">Upload price lists</h1>
        <p className="mt-1 text-sm text-muted-foreground">xlsx or csv, several at once. A layout you&apos;ve mapped before is recognised and needs no setup.</p>
      </div>

      <ol className="flex items-center gap-2" aria-label="Upload steps">
        {STEPS.map((label, i) => {
          const s = i as Step;
          const done = s < step;
          const reachable = canReach(s);
          return (
            <Fragment key={label}>
              {i > 0 && <li aria-hidden="true" className={cn("h-px flex-1", s <= step ? "bg-brand" : "bg-border")} />}
              <li>
                <button type="button" disabled={!reachable} onClick={() => setStep(s)} aria-current={s === step ? "step" : undefined}
                  className={cn("flex items-center gap-2 rounded-full py-1 pr-3 pl-1 text-sm transition-colors disabled:cursor-not-allowed",
                    s === step ? "bg-brand-soft font-semibold text-brand" : reachable ? "text-foreground hover:bg-muted" : "text-muted-foreground")}>
                  <span className={cn("flex size-6 items-center justify-center rounded-full text-xs font-semibold",
                    s === step ? "bg-brand text-brand-foreground" : done ? "bg-brand/15 text-brand" : "bg-muted text-muted-foreground")}>
                    {done ? <CheckIcon className="size-3.5" /> : i + 1}
                  </span>
                  {/* Phones: only the current step's name, so the four fit. */}
                  <span className={s === step ? undefined : "hidden sm:inline"}>{label}</span>
                </button>
              </li>
            </Fragment>
          );
        })}
      </ol>

      {error && <p className="rounded-md bg-fail-soft px-3 py-2 text-sm text-fail">{error}</p>}

      {step === 0 && (
        <div className="space-y-4">
          <label className="panel flex cursor-pointer flex-col items-center gap-2 border-2 border-dashed px-6 py-12 text-center transition-colors hover:border-brand hover:bg-brand-soft/40"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
            <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"><UploadIcon className="size-5" /></span>
            <span className="section-title">Drop price lists here, or choose files</span>
            <span className="text-sm text-muted-foreground">.xlsx, .xls, .csv · up to {MAX_FILE_BYTES / 1024 / 1024} MB each, {MAX_ROWS.toLocaleString("en-GB")} rows per upload</span>
            <input type="file" multiple accept=".xlsx,.xls,.csv,.tsv,.txt" className="sr-only" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          </label>
          {files.length > 0 && (
            <ul className="panel divide-y">
              {files.map((f) => (
                <li key={f.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <FileSpreadsheetIcon className="size-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{f.fileName}</span>
                  <span className="num text-xs text-muted-foreground">{(previews[f.key]?.rows.length ?? 0).toLocaleString("en-GB")} rows</span>
                  {f.remembered ? <Badge variant="pass">Layout remembered: {f.remembered}</Badge> : <Badge variant="warn">New layout</Badge>}
                  <Button variant="ghost" size="icon-sm" aria-label={`Remove ${f.fileName}`} onClick={() => setFiles((fs) => fs.filter((x) => x.key !== f.key))}><Trash2Icon /></Button>
                </li>
              ))}
            </ul>
          )}
          <StepNav>
            {allRemembered && <span className="text-sm text-muted-foreground">Every layout is remembered: you can go straight to Review.</span>}
            <Button variant={allRemembered ? "outline" : "default"} disabled={!canReach(1)} onClick={() => next(1)}>Map columns</Button>
            {allRemembered && <Button onClick={() => next(2)}>Review</Button>}
          </StepNav>
        </div>
      )}

      {step === 1 && current && (
        <div className="space-y-4">
          <Tabs value={current.key} onValueChange={setTab}>
            {files.length > 1 && (
              <TabsList>
                {files.map((f) => (
                  <TabsTrigger key={f.key} value={f.key} className="max-w-56">
                    <span className="truncate">{f.fileName}</span>
                    {mapProblems(f).length ? <span className="size-1.5 flex-none rounded-full bg-warn" aria-label="needs attention" /> : <CheckIcon className="text-pass" />}
                  </TabsTrigger>
                ))}
              </TabsList>
            )}
            {files.map((f) => (
              <TabsContent key={f.key} value={f.key}>
                <MapFile f={f} suppliers={suppliers} problems={mapProblems(f)}
                  onUpdate={(fn) => update(f.key, fn)} onCurrency={(c) => setCurrency(f.key, c)} onSupplier={(n) => pickSupplier(f.key, n)}
                  onSheet={async (sheet) => { const rows = sheetRows(f.workbook, sheet); const n = await loadLayout({ ...f, sheet, rows }); update(f.key, () => n); }}
                  onPriceColumn={async (value) => {
                    if (!currencyFromHeader(value)) return;
                    const n = await withHeaderCurrency(f, value);
                    update(f.key, (x) => ({ ...x, supplier: { ...x.supplier, currency: n.supplier.currency }, fx: n.fx, fxError: n.fxError, currencyHint: n.currencyHint }));
                  }} />
              </TabsContent>
            ))}
          </Tabs>
          <StepNav back={() => setStep(0)}>
            {!mapped && <span className="text-sm text-warn">{problems.filter((p) => !p.includes("-row limit"))[0]}</span>}
            <Button disabled={!canReach(2)} onClick={() => next(2)}>Review rows</Button>
          </StepNav>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          {files.map((f) => {
            const pv = previews[f.key];
            return (
              <section key={f.key} className="panel space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="section-title min-w-0 truncate">{f.fileName}</h2>
                  <span className="text-sm text-muted-foreground">· {f.supplier.name} · {f.supplier.vatBasis === "ex_vat" ? "ex-VAT" : "inc-VAT"} · {f.supplier.currency}</span>
                </div>
                {!pv ? <p className="text-sm text-warn">Enter an FX rate to preview.</p> : (
                  <>
                    <div className="flex flex-wrap gap-2 text-sm">
                      <Badge variant="pass"><span className="num">{pv.rows.length.toLocaleString("en-GB")}</span> rows ready</Badge>
                      {pv.rejected.length > 0 && <Badge variant="warn"><span className="num">{pv.rejected.length}</span> set aside for manual matching</Badge>}
                      {pv.rows.some((r) => !r.eanValid) && <Badge variant="warn"><span className="num">{pv.rows.filter((r) => !r.eanValid).length}</span> with a bad check digit</Badge>}
                    </div>
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50 text-left text-muted-foreground">
                          <tr><th className="px-3 py-2 font-medium">Row</th><th className="px-3 font-medium">EAN</th><th className="px-3 font-medium">Name</th><th className="px-3 text-right font-medium">Quoted / unit</th><th className="px-3 text-right font-medium">GBP ex-VAT / unit</th><th className="px-3 text-right font-medium">Pack</th><th className="px-3 text-right font-medium">MOQ</th></tr>
                        </thead>
                        <tbody>
                          {pv.rows.slice(0, 8).map((r) => (
                            <tr key={r.sourceRow} className="border-t">
                              <td className="num px-3 py-1.5">{r.sourceRow}</td>
                              <td className={cn("num px-3", !r.eanValid && "text-warn")}>{r.ean}</td>
                              <td className="max-w-[320px] truncate px-3">{r.title}</td>
                              <td className="num px-3 text-right">{r.unitCost.toFixed(2)} {f.supplier.currency}</td>
                              <td className="num px-3 text-right">{gbp(r.unitCostGbp)}</td>
                              <td className="num px-3 text-right">{r.packUnits}</td>
                              <td className="num px-3 text-right">{r.moq ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {pv.rows.length > 8 && <p className="text-xs text-muted-foreground">and {(pv.rows.length - 8).toLocaleString("en-GB")} more rows</p>}
                    {pv.rejected.length > 0 && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground">Rows set aside</summary>
                        <ul className="mt-1 space-y-0.5">
                          {pv.rejected.slice(0, 50).map((r) => <li key={r.sourceRow}>Row {r.sourceRow}: {r.reason}{r.title ? ` · ${r.title}` : ""}</li>)}
                        </ul>
                      </details>
                    )}
                  </>
                )}
              </section>
            );
          })}
          <StepNav back={() => setStep(1)}>
            {totalRows > MAX_ROWS && <span className="text-sm text-warn">{totalRows.toLocaleString("en-GB")} rows is over the {MAX_ROWS.toLocaleString("en-GB")}-row limit per upload: remove a file or split it</span>}
            <Button disabled={!canReach(3)} onClick={() => next(3)}>Continue</Button>
          </StepNav>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <section className="panel space-y-4 p-5">
            <h2 className="section-title">Screen against Amazon UK</h2>
            <p className="text-sm text-muted-foreground">
              <span className="num font-medium text-foreground">{totalRows.toLocaleString("en-GB")}</span> rows from {files.length} file{files.length > 1 ? "s" : ""}.
              The same EAN across files becomes one product; the cheapest offer is scored. Screening runs in the background: you can leave the page.
            </p>
            <div className="max-w-xs space-y-1.5">
              <Label htmlFor="profile" className="field-label">Profile</Label>
              <NativeSelect id="profile" className="w-full" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
                {profiles.map((p) => <NativeSelectOption key={p.id} value={p.id}>{p.name}{p.is_default ? " (default)" : ""}</NativeSelectOption>)}
              </NativeSelect>
            </div>
          </section>
          <StepNav back={() => setStep(2)}>
            <Button size="lg" disabled={busy || problems.length > 0 || totalRows === 0} onClick={submit}>
              {busy ? "Starting…" : `Screen ${totalRows.toLocaleString("en-GB")} rows`}
            </Button>
          </StepNav>
        </div>
      )}

      <datalist id="suppliers">{suppliers.map((s) => <option key={s.id} value={s.name} />)}</datalist>
    </div>
  );
}

function StepNav({ back, children }: { back?: () => void; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-4">
      {back && <Button variant="ghost" className="mr-auto" onClick={back}>Back</Button>}
      {children}
    </div>
  );
}

/** One file's supplier terms and its column mapping: our fields on the left, your columns on the right. */
function MapFile({ f, suppliers, problems, onUpdate, onCurrency, onSupplier, onSheet, onPriceColumn }: {
  f: FileState;
  suppliers: Supplier[];
  problems: string[];
  onUpdate: (fn: (f: FileState) => FileState) => void;
  onCurrency: (c: string) => void;
  onSupplier: (name: string) => void;
  onSheet: (sheet: string) => void;
  onPriceColumn: (header: string | undefined) => void;
}) {
  const headers = headersOf(f.rows, f.mapping.headerRow);
  const known = suppliers.some((s) => s.name.toLowerCase() === f.supplier.name.trim().toLowerCase());
  const setCol = (key: FieldKey, value: string | undefined) =>
    onUpdate((x) => ({ ...x, mapping: { ...x.mapping, columns: { ...x.mapping.columns, [key]: value } } }));
  return (
    <div className="space-y-4">
      <section className="panel space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="section-title">Supplier</h2>
          {f.remembered ? <Badge variant="pass">Layout remembered: {f.remembered}</Badge> : <Badge variant="warn">New layout: check the mapping</Badge>}
          {f.sheetNames.length > 1 && (
            <NativeSelect size="sm" className="ml-auto w-auto" aria-label="Sheet" value={f.sheet} onChange={(e) => onSheet(e.target.value)}>
              {f.sheetNames.map((s) => <NativeSelectOption key={s}>{s}</NativeSelectOption>)}
            </NativeSelect>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5 lg:col-span-2">
            <Label className="field-label" htmlFor={`name-${f.key}`}>Name {known && <span className="font-normal text-pass">· saved supplier</span>}</Label>
            <Input id={`name-${f.key}`} list="suppliers" value={f.supplier.name} onChange={(e) => onSupplier(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="field-label" htmlFor={`vat-${f.key}`}>Prices are</Label>
            <NativeSelect id={`vat-${f.key}`} className="w-full" value={f.supplier.vatBasis} onChange={(e) => onUpdate((x) => ({ ...x, supplier: { ...x.supplier, vatBasis: e.target.value as "ex_vat" | "inc_vat" } }))}>
              <NativeSelectOption value="ex_vat">Ex-VAT</NativeSelectOption>
              <NativeSelectOption value="inc_vat">Inc-VAT</NativeSelectOption>
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label className="field-label" htmlFor={`rate-${f.key}`}>VAT on these goods (%)</Label>
            <Input id={`rate-${f.key}`} className="num" type="number" step="any" value={f.supplier.vatRate} onChange={(e) => onUpdate((x) => ({ ...x, supplier: { ...x.supplier, vatRate: Number(e.target.value) } }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="field-label" htmlFor={`cur-${f.key}`}>Currency</Label>
            <NativeSelect id={`cur-${f.key}`} className="w-full" value={f.supplier.currency} onChange={(e) => onCurrency(e.target.value)}>
              {CURRENCIES.map((c) => <NativeSelectOption key={c}>{c}</NativeSelectOption>)}
            </NativeSelect>
          </div>
          {f.supplier.currency !== "GBP" && (
            <div className="space-y-1.5 lg:col-span-2">
              <Label className="field-label" htmlFor={`fx-${f.key}`}>GBP per 1 {f.supplier.currency}{f.fx.source && f.fx.source !== "fixed" ? ` (${f.fx.source}, ${f.fx.date})` : ""}</Label>
              <Input id={`fx-${f.key}`} className="num" type="number" step="any" value={f.fx.rate}
                onChange={(e) => onUpdate((x) => ({ ...x, fx: { rate: Number(e.target.value), date: today(), source: "entered by hand" } }))} />
              {f.fxError && <p className="text-xs text-fail">{f.fxError}</p>}
            </div>
          )}
        </div>
        {f.currencyHint && !f.fxError && <p className="text-xs text-brand">{f.currencyHint}</p>}
        <p className="text-xs text-muted-foreground">VAT basis and currency are saved with the supplier and applied to every future file from them. Costs are stored in GBP ex-VAT.</p>
      </section>

      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <h2 className="section-title">Columns</h2>
          <div className="ml-auto flex items-center gap-2">
            <Label htmlFor={`hdr-${f.key}`} className="field-label">Header row</Label>
            <Input id={`hdr-${f.key}`} className="num h-8 w-16" type="number" min={1} value={f.mapping.headerRow + 1}
              onChange={(e) => onUpdate((x) => ({ ...x, mapping: { ...x.mapping, headerRow: Math.max(0, Number(e.target.value) - 1) } }))} />
          </div>
        </div>
        <div className="grid grid-cols-[minmax(9rem,14rem)_1fr] text-sm">
          <div className="eyebrow border-b bg-muted/40 px-4 py-2">Wholesale Scout field</div>
          <div className="eyebrow border-b bg-muted/40 px-4 py-2">Column in {f.fileName}</div>
          {MAPPABLE_FIELDS.map((fd) => {
            const value = f.mapping.columns[fd.key];
            const sample = sampleOf(f.rows, f.mapping.headerRow, value);
            const missing = fd.required && !value;
            const askPer = fd.key === "unitPrice" && !!f.mapping.columns.packUnits;
            return (
              <Fragment key={fd.key}>
                <div className="flex items-start border-b px-4 py-3">
                  <Label htmlFor={`col-${f.key}-${fd.key}`} className={cn("pt-1.5", missing && "text-warn")}>
                    {fd.label}{fd.required && <span className="text-muted-foreground"> *</span>}
                  </Label>
                </div>
                <div className="flex flex-wrap items-start gap-x-4 gap-y-2 border-b px-4 py-3">
                  <div className="min-w-0 flex-1 basis-56 space-y-1">
                    <NativeSelect id={`col-${f.key}-${fd.key}`} className={cn("w-full", missing && "[&_select]:border-warn")} value={value ?? ""}
                      onChange={(e) => { const v = e.target.value || undefined; setCol(fd.key, v); if (fd.key === "unitPrice") onPriceColumn(v); }}>
                      <NativeSelectOption value="">— not in this file —</NativeSelectOption>
                      {headers.map((h) => <NativeSelectOption key={h}>{h}</NativeSelectOption>)}
                    </NativeSelect>
                    {sample && <p className="num truncate text-2xs text-muted-foreground" title={sample}>e.g. {sample}</p>}
                  </div>
                  {askPer && (
                    <fieldset className="flex-none rounded-md bg-warn-soft px-3 py-1.5">
                      <legend className="sr-only">Is the price per piece or per pack?</legend>
                      <p className="text-xs font-medium text-warn">Price is per…</p>
                      <RadioGroup className="mt-1 flex gap-4" value={f.mapping.pricePer ?? ""}
                        onValueChange={(v) => onUpdate((x) => ({ ...x, mapping: { ...x.mapping, pricePer: v as "unit" | "pack" } }))}>
                        {(["unit", "pack"] as const).map((v) => (
                          <div key={v} className="flex items-center gap-1.5">
                            <RadioGroupItem value={v} id={`per-${f.key}-${v}`} />
                            <Label htmlFor={`per-${f.key}-${v}`} className="text-sm font-normal">{v === "unit" ? "piece" : `pack of “${f.mapping.columns.packUnits}”`}</Label>
                          </div>
                        ))}
                      </RadioGroup>
                    </fieldset>
                  )}
                </div>
              </Fragment>
            );
          })}
        </div>
      </section>
      {problems.length > 0 && <ul className="space-y-0.5 text-sm text-warn">{problems.map((p) => <li key={p}>{p.replace(`${f.fileName}: `, "")}</li>)}</ul>}
    </div>
  );
}
