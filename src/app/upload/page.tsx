"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  applyMapping,
  CURRENCIES,
  detectHeaderRow,
  guessMapping,
  headerFingerprint,
  MAPPABLE_FIELDS,
  type Cell,
  type ColumnMapping,
  type FieldKey,
} from "@/lib/ingest/mapping";
import { api, gbp } from "@/lib/ui/client";

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
}

const today = () => new Date().toISOString().slice(0, 10);

function sheetRows(wb: XLSX.WorkBook, name: string): Cell[][] {
  return XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: false });
}

function headersOf(rows: Cell[][], headerRow: number): string[] {
  return (rows[headerRow] ?? []).map((h) => String(h ?? "").trim()).filter(Boolean);
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
          mapping: saved.mapping,
          remembered: s.name,
          supplier: { name: s.name, vatBasis: s.vat_basis, vatRate: Number(s.vat_rate), currency: s.currency },
          fx,
          fxError: fx.rate ? null : "Couldn't fetch a rate; enter it by hand",
        };
      }
    } catch {
      // No saved layout, or not connected: fall back to guessing.
    }
    return { ...f, mapping: { headerRow, columns: guessMapping(headers), pricePer: "unit" }, remembered: null };
  }

  async function addFiles(list: FileList | null) {
    if (!list) return;
    setError(null);
    for (const file of Array.from(list)) {
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
        };
        const ready = await loadLayout(base);
        setFiles((fs) => [...fs.filter((f) => f.key !== ready.key), ready]);
      } catch (e) {
        setError(`${file.name}: ${(e as Error).message}`);
      }
    }
  }

  async function setCurrency(key: string, currency: string) {
    update(key, (f) => ({ ...f, supplier: { ...f.supplier, currency }, fx: { rate: currency === "GBP" ? 1 : f.fx.rate, date: today(), source: currency === "GBP" ? "fixed" : "…" }, fxError: null }));
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
        <h1 className="h1">Upload price lists</h1>
        <p className="mt-1 text-sm text-muted">xlsx or csv, several at once. A layout you&apos;ve mapped before is recognised and needs no setup.</p>
      </div>

      <label className="card flex cursor-pointer flex-col items-center gap-2 border-dashed px-6 py-8 text-center hover:bg-surface-2"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
        <span className="h2">Drop files here or choose them</span>
        <span className="text-sm text-muted">.xlsx, .xls, .csv</span>
        <input type="file" multiple accept=".xlsx,.xls,.csv,.tsv,.txt" className="sr-only" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
      </label>

      {files.map((f) => {
        const headers = headersOf(f.rows, f.mapping.headerRow);
        const pv = previews[f.key];
        return (
          <section key={f.key} className="card space-y-4 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="h2">{f.fileName}</h2>
              {f.remembered
                ? <span className="rounded-full bg-pass-soft px-2 py-0.5 text-xs font-medium text-pass">Layout remembered: {f.remembered}</span>
                : <span className="rounded-full bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn">New layout: check the mapping</span>}
              {f.sheetNames.length > 1 && (
                <select className="input w-auto" value={f.sheet} onChange={async (e) => {
                  const rows = sheetRows(f.workbook, e.target.value);
                  const next = await loadLayout({ ...f, sheet: e.target.value, rows });
                  update(f.key, () => next);
                }}>
                  {f.sheetNames.map((s) => <option key={s}>{s}</option>)}
                </select>
              )}
              <button className="btn ml-auto" onClick={() => setFiles((fs) => fs.filter((x) => x.key !== f.key))}>Remove</button>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
              <div className="space-y-3">
                <p className="text-sm font-semibold">Supplier</p>
                <div className="grid grid-cols-2 gap-3">
                  <label className="col-span-2 space-y-1">
                    <span className="label">Name</span>
                    <input className="input" list="suppliers" value={f.supplier.name} onChange={(e) => pickSupplier(f.key, e.target.value)} />
                  </label>
                  <label className="space-y-1">
                    <span className="label">Prices are</span>
                    <select className="input" value={f.supplier.vatBasis} onChange={(e) => update(f.key, (x) => ({ ...x, supplier: { ...x.supplier, vatBasis: e.target.value as "ex_vat" | "inc_vat" } }))}>
                      <option value="ex_vat">Ex-VAT</option>
                      <option value="inc_vat">Inc-VAT</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="label">VAT rate on these goods (%)</span>
                    <input className="input num" type="number" step="any" value={f.supplier.vatRate} onChange={(e) => update(f.key, (x) => ({ ...x, supplier: { ...x.supplier, vatRate: Number(e.target.value) } }))} />
                  </label>
                  <label className="space-y-1">
                    <span className="label">Currency</span>
                    <select className="input" value={f.supplier.currency} onChange={(e) => setCurrency(f.key, e.target.value)}>
                      {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="label">GBP per 1 {f.supplier.currency}{f.fx.source && f.fx.source !== "fixed" ? ` (${f.fx.source}, ${f.fx.date})` : ""}</span>
                    <input className="input num" type="number" step="any" disabled={f.supplier.currency === "GBP"} value={f.fx.rate}
                      onChange={(e) => update(f.key, (x) => ({ ...x, fx: { rate: Number(e.target.value), date: today(), source: "entered by hand" } }))} />
                    {f.fxError && <span className="text-xs text-fail">{f.fxError}</span>}
                  </label>
                </div>
                <p className="text-xs text-muted">VAT basis and currency are saved with the supplier and applied to every future file from them. Costs are stored in GBP ex-VAT at this rate.</p>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-semibold">Columns</p>
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <span className="label">Header row</span>
                    <input className="input num" type="number" min={1} value={f.mapping.headerRow + 1}
                      onChange={(e) => update(f.key, (x) => ({ ...x, mapping: { ...x.mapping, headerRow: Math.max(0, Number(e.target.value) - 1) } }))} />
                  </label>
                  {MAPPABLE_FIELDS.map((fd) => (
                    <label key={fd.key} className="space-y-1">
                      <span className="label">{fd.label}{fd.required ? " *" : ""}</span>
                      <select className="input" value={f.mapping.columns[fd.key] ?? ""}
                        onChange={(e) => update(f.key, (x) => ({ ...x, mapping: { ...x.mapping, columns: { ...x.mapping.columns, [fd.key as FieldKey]: e.target.value || undefined } } }))}>
                        <option value="">—</option>
                        {headers.map((h) => <option key={h}>{h}</option>)}
                      </select>
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
                    <thead className="text-left text-muted">
                      <tr><th className="py-1 pr-3">Row</th><th className="pr-3">EAN</th><th className="pr-3">Name</th><th className="pr-3 text-right">Quoted / unit</th><th className="pr-3 text-right">GBP ex-VAT / unit</th><th className="pr-3 text-right">Pack</th><th className="text-right">MOQ</th></tr>
                    </thead>
                    <tbody>
                      {pv.rows.slice(0, 5).map((r) => (
                        <tr key={r.sourceRow} className="border-t border-line">
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
                    <summary className="cursor-pointer text-muted">Rows set aside</summary>
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
        <div className="card flex flex-wrap items-end gap-4 p-4">
          <label className="space-y-1">
            <span className="label">Profile</span>
            <select className="input w-56" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}{p.is_default ? " (default)" : ""}</option>)}
            </select>
          </label>
          <div className="text-sm text-muted">{totalRows} rows from {files.length} file{files.length > 1 ? "s" : ""}. The same EAN across files becomes one product; the cheapest offer is scored.</div>
          <button className="btn btn-primary ml-auto" disabled={busy || problems.length > 0 || totalRows === 0} onClick={submit}>
            {busy ? "Starting…" : "Screen these rows"}
          </button>
          {problems.length > 0 && <ul className="w-full text-sm text-warn">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
        </div>
      )}

      {error && <p className="rounded-md bg-fail-soft px-3 py-2 text-sm text-fail">{error}</p>}
    </div>
  );
}
