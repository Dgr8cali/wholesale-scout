"use client";

import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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

import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
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
    if (!list) return;
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

  const problems = files.flatMap((f) => {
    const p: string[] = [];
    if (!f.mapping.columns.ean) p.push(`${f.fileName}: map the EAN column`);
    if (!f.mapping.columns.unitPrice) p.push(`${f.fileName}: map the unit price column`);
    if (!f.supplier.name.trim()) p.push(`${f.fileName}: name the supplier`);
    if (!(f.fx.rate > 0)) p.push(`${f.fileName}: enter an FX rate`);
    if (f.mapping.columns.packUnits && !f.mapping.pricePer) p.push(`${f.fileName}: say whether price is per piece or per pack`);
    return p;
  });
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
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Upload price lists</h1>
        <p className="mt-1 text-sm text-muted-foreground">xlsx or csv, several at once. A layout you&apos;ve mapped before is recognised and needs no setup.</p>
      </div>

      <label className="panel flex cursor-pointer flex-col items-center gap-2 border-dashed px-6 py-8 text-center hover:bg-muted"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
        <span className="section-title">Drop files here or choose them</span>
        <span className="text-sm text-muted-foreground">.xlsx, .xls, .csv · up to {MAX_FILE_BYTES / 1024 / 1024} MB each, {MAX_ROWS.toLocaleString("en-GB")} rows per upload</span>
        <input type="file" multiple accept=".xlsx,.xls,.csv,.tsv,.txt" className="sr-only" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
      </label>

      {files.map((f) => {
        const headers = headersOf(f.rows, f.mapping.headerRow);
        const pv = previews[f.key];
        return (
          <section key={f.key} className="panel space-y-4 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="section-title">{f.fileName}</h2>
              {f.remembered
                ? <Badge variant="pass">Layout remembered: {f.remembered}</Badge>
                : <Badge variant="warn">New layout: check the mapping</Badge>}
              {f.sheetNames.length > 1 && (
                <NativeSelect className="w-auto" value={f.sheet} onChange={async (e) => {
                  const rows = sheetRows(f.workbook, e.target.value);
                  const next = await loadLayout({ ...f, sheet: e.target.value, rows });
                  update(f.key, () => next);
                }}>
                  {f.sheetNames.map((s) => <NativeSelectOption key={s}>{s}</NativeSelectOption>)}
                </NativeSelect>
              )}
              <Button variant="outline" className="ml-auto" onClick={() => setFiles((fs) => fs.filter((x) => x.key !== f.key))}>Remove</Button>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
              <div className="space-y-3">
                <p className="text-sm font-semibold">Supplier</p>
                <div className="grid grid-cols-2 gap-3">
                  <label className="col-span-2 space-y-1">
                    <span className="field-label">Name</span>
                    <Input  list="suppliers" value={f.supplier.name} onChange={(e) => pickSupplier(f.key, e.target.value)} />
                  </label>
                  <label className="space-y-1">
                    <span className="field-label">Prices are</span>
                    <NativeSelect value={f.supplier.vatBasis} onChange={(e) => update(f.key, (x) => ({ ...x, supplier: { ...x.supplier, vatBasis: e.target.value as "ex_vat" | "inc_vat" } }))}>
                      <NativeSelectOption value="ex_vat">Ex-VAT</NativeSelectOption>
                      <NativeSelectOption value="inc_vat">Inc-VAT</NativeSelectOption>
                    </NativeSelect>
                  </label>
                  <label className="space-y-1">
                    <span className="field-label">VAT rate on these goods (%)</span>
                    <Input className="num" type="number" step="any" value={f.supplier.vatRate} onChange={(e) => update(f.key, (x) => ({ ...x, supplier: { ...x.supplier, vatRate: Number(e.target.value) } }))} />
                  </label>
                  <label className="space-y-1">
                    <span className="field-label">Currency</span>
                    <NativeSelect value={f.supplier.currency} onChange={(e) => setCurrency(f.key, e.target.value)}>
                      {CURRENCIES.map((c) => <NativeSelectOption key={c}>{c}</NativeSelectOption>)}
                    </NativeSelect>
                  </label>
                  <label className="space-y-1">
                    <span className="field-label">GBP per 1 {f.supplier.currency}{f.fx.source && f.fx.source !== "fixed" ? ` (${f.fx.source}, ${f.fx.date})` : ""}</span>
                    <Input className="num" type="number" step="any" disabled={f.supplier.currency === "GBP"} value={f.fx.rate}
                      onChange={(e) => update(f.key, (x) => ({ ...x, fx: { rate: Number(e.target.value), date: today(), source: "entered by hand" } }))} />
                    {f.fxError && <span className="text-xs text-fail">{f.fxError}</span>}
                    {f.currencyHint && !f.fxError && <span className="text-xs text-brand">{f.currencyHint}</span>}
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">VAT basis and currency are saved with the supplier and applied to every future file from them. Costs are stored in GBP ex-VAT at this rate.</p>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-semibold">Columns</p>
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <span className="field-label">Header row</span>
                    <Input className="num" type="number" min={1} value={f.mapping.headerRow + 1}
                      onChange={(e) => update(f.key, (x) => ({ ...x, mapping: { ...x.mapping, headerRow: Math.max(0, Number(e.target.value) - 1) } }))} />
                  </label>
                  {MAPPABLE_FIELDS.map((fd) => (
                    <label key={fd.key} className="space-y-1">
                      <span className="field-label">{fd.label}{fd.required ? " *" : ""}</span>
                      <NativeSelect value={f.mapping.columns[fd.key] ?? ""}
                        onChange={async (e) => {
                          const value = e.target.value || undefined;
                          update(f.key, (x) => ({ ...x, mapping: { ...x.mapping, columns: { ...x.mapping.columns, [fd.key as FieldKey]: value } } }));
                          if (fd.key === "unitPrice" && currencyFromHeader(value)) {
                            const next = await withHeaderCurrency(f, value);
                            update(f.key, (x) => ({ ...x, supplier: { ...x.supplier, currency: next.supplier.currency }, fx: next.fx, fxError: next.fxError, currencyHint: next.currencyHint }));
                          }
                        }}>
                        <NativeSelectOption value="">—</NativeSelectOption>
                        {headers.map((h) => <NativeSelectOption key={h}>{h}</NativeSelectOption>)}
                      </NativeSelect>
                    </label>
                  ))}
                </div>
                {f.mapping.columns.packUnits && (
                  <fieldset className="rounded-md bg-warn-soft px-3 py-2 text-sm">
                    <legend className="sr-only">Price basis</legend>
                    <p className="font-medium">Is &ldquo;{f.mapping.columns.unitPrice ?? "the price"}&rdquo; per piece, or per pack of &ldquo;{f.mapping.columns.packUnits}&rdquo;?</p>
                    <div className="mt-1 flex gap-4">
                      {(["unit", "pack"] as const).map((v) => (
                        <label key={v} className="flex items-center gap-1.5">
                          <input type="radio" name={`per-${f.key}`} checked={f.mapping.pricePer === v} onChange={() => update(f.key, (x) => ({ ...x, mapping: { ...x.mapping, pricePer: v } }))} />
                          {v === "unit" ? "Per piece" : "Per pack"}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
              </div>
            </div>

            {pv && (
              <div className="space-y-2">
                <p className="text-sm">
                  <span className="font-semibold">{pv.rows.length}</span> rows ready
                  {pv.rejected.length > 0 && <>, <span className="text-warn">{pv.rejected.length} set aside for manual matching</span></>}
                  {pv.rows.some((r) => !r.eanValid) && <>, <span className="text-warn">{pv.rows.filter((r) => !r.eanValid).length} with a bad check digit</span></>}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-left text-muted-foreground">
                      <tr><th className="py-1 pr-3">Row</th><th className="pr-3">EAN</th><th className="pr-3">Name</th><th className="pr-3 text-right">Quoted / unit</th><th className="pr-3 text-right">GBP ex-VAT / unit</th><th className="pr-3 text-right">Pack</th><th className="text-right">MOQ</th></tr>
                    </thead>
                    <tbody>
                      {pv.rows.slice(0, 5).map((r) => (
                        <tr key={r.sourceRow} className="border-t border-border">
                          <td className="num py-1 pr-3">{r.sourceRow}</td>
                          <td className={`num pr-3 ${r.eanValid ? "" : "text-warn"}`}>{r.ean}</td>
                          <td className="max-w-[320px] truncate pr-3">{r.title}</td>
                          <td className="num pr-3 text-right">{r.unitCost.toFixed(2)} {f.supplier.currency}</td>
                          <td className="num pr-3 text-right">{gbp(r.unitCostGbp)}</td>
                          <td className="num pr-3 text-right">{r.packUnits}</td>
                          <td className="num text-right">{r.moq ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {pv.rejected.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">Rows set aside</summary>
                    <ul className="mt-1 space-y-0.5">
                      {pv.rejected.slice(0, 50).map((r) => <li key={r.sourceRow}>Row {r.sourceRow}: {r.reason}{r.title ? ` · ${r.title}` : ""}</li>)}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </section>
        );
      })}

      <datalist id="suppliers">{suppliers.map((s) => <option key={s.id} value={s.name} />)}</datalist>

      {files.length > 0 && (
        <div className="panel flex flex-wrap items-end gap-4 p-4">
          <label className="space-y-1">
            <span className="field-label">Profile</span>
            <NativeSelect className="w-56" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
              {profiles.map((p) => <NativeSelectOption key={p.id} value={p.id}>{p.name}{p.is_default ? " (default)" : ""}</NativeSelectOption>)}
            </NativeSelect>
          </label>
          <div className="text-sm text-muted-foreground">{totalRows} rows from {files.length} file{files.length > 1 ? "s" : ""}. The same EAN across files becomes one product; the cheapest offer is scored.</div>
          <Button className="ml-auto" disabled={busy || problems.length > 0 || totalRows === 0} onClick={submit}>
            {busy ? "Starting…" : "Screen these rows"}
          </Button>
          {problems.length > 0 && <ul className="w-full text-sm text-warn">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
        </div>
      )}

      {error && <p className="rounded-md bg-fail-soft px-3 py-2 text-sm text-fail">{error}</p>}
    </div>
  );
}
