"use client";

import { DownloadIcon, FileTextIcon, LoaderIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useDialogs } from "@/components/Dialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { DOC_KINDS, docKindLabel, INVOICE_MAX_AGE_DAYS, MAX_DOC_BYTES, staleInvoice, type DocKind, type DocumentRow } from "@/lib/documents";
import { api } from "@/lib/ui/client";

const size = (n: number | null) => (n == null ? "" : n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Upload one file: the details → a signed URL → the file straight to storage → confirmed. */
async function uploadDocument(file: File, meta: { kind: DocKind; date: string | null; note: string | null; brands: string[]; supplierId: string | null }) {
  if (file.size > MAX_DOC_BYTES) throw new Error(`${file.name} is over 50 MB`);
  const start = await api<{ id: string; uploadUrl: string }>("/api/documents", {
    method: "POST", json: { ...meta, fileName: file.name, size: file.size, contentType: file.type || null },
  });
  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", file);
  const put = await fetch(start.uploadUrl, { method: "PUT", body: form, headers: { "x-upsert": "false" } });
  if (!put.ok) {
    await api(`/api/documents/${start.id}`, { method: "DELETE" }).catch(() => {});
    throw new Error(`Storage refused ${file.name} (${put.status})`);
  }
  await api(`/api/documents/${start.id}/done`, { method: "POST" });
}

/** One document's line: type, date, file (opens), note, and delete. */
export function DocumentLine({ d, onDelete }: { d: DocumentRow; onDelete?: () => void }) {
  const stale = staleInvoice(d);
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
      <Badge variant="muted">{docKindLabel(d.kind)}</Badge>
      <a className="inline-flex min-w-0 items-center gap-1 font-medium text-brand hover:underline" href={`/api/documents/${d.id}/file`} target="_blank" rel="noreferrer">
        <FileTextIcon className="size-3.5 flex-none" /><span className="truncate">{d.file_name}</span>
      </a>
      <span className="num text-xs text-muted-foreground">{d.doc_date ? day(d.doc_date) : "no date"}{d.size_bytes ? ` · ${size(d.size_bytes)}` : ""}</span>
      {d.supplier && <span className="text-xs text-muted-foreground">· {d.supplier.name}</span>}
      {stale != null && <span className="text-xs font-medium text-warn">{stale} days old: Amazon usually wants invoices from the last {INVOICE_MAX_AGE_DAYS} days</span>}
      <span className="ml-auto flex items-center gap-1">
        <Button asChild variant="ghost" size="icon-sm" aria-label={`Download ${d.file_name}`}><a href={`/api/documents/${d.id}/file?download=1`}><DownloadIcon /></a></Button>
        {onDelete && <Button variant="ghost" size="icon-sm" aria-label={`Delete ${d.file_name}`} onClick={onDelete}><Trash2Icon /></Button>}
      </span>
      {d.note && <span className="basis-full text-xs text-muted-foreground">{d.note}</span>}
    </li>
  );
}

/**
 * Documents kept for a brand or a supplier (invoices, SDS, brand letters…), with an upload
 * form: type, date and note per file. On a supplier's page an upload can name the brands on it.
 */
export function Documents({ brand, supplier, suppliers = [] }: {
  brand?: { name: string }; supplier?: { id: string; name: string };
  /** On a brand's page: its suppliers, to say which one an invoice is from. */
  suppliers?: { id: string; name: string }[];
}) {
  const dialogs = useDialogs();
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [kind, setKind] = useState<DocKind>(supplier ? "invoice" : "brand_letter");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [brands, setBrands] = useState("");
  const [from, setFrom] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const q = brand ? `brand=${encodeURIComponent(brand.name)}` : `supplier=${supplier!.id}`;
  const load = useCallback(() => { api<{ documents: DocumentRow[] }>(`/api/documents?${q}`).then((r) => setDocs(r.documents)).catch((e: Error) => toast.error(e.message)); }, [q]);
  useEffect(load, [load]);

  async function upload(files: FileList) {
    setBusy(true);
    let ok = 0;
    for (const f of Array.from(files)) {
      try {
        await uploadDocument(f, {
          kind, date: date || null, note: note || null,
          brands: [...(brand ? [brand.name] : []), ...brands.split(",").map((s) => s.trim()).filter(Boolean)],
          supplierId: supplier?.id ?? (from || null),
        });
        ok++;
      } catch (e) {
        toast.error((e as Error).message);
      }
    }
    setBusy(false);
    if (ok) { toast.success(`${ok} file${ok === 1 ? "" : "s"} kept`); setNote(""); load(); }
  }
  async function remove(d: DocumentRow) {
    if (!(await dialogs.confirm({ title: `Delete ${d.file_name}?`, description: "The file is deleted from storage too.", confirmLabel: "Delete", destructive: true }))) return;
    try { await api(`/api/documents/${d.id}`, { method: "DELETE" }); load(); } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <section className="panel space-y-3 p-4" aria-label="Documents">
      <h2 className="section-label">Documents <span className="font-normal text-muted-foreground">· invoices, SDS, brand letters: shown when you apply for approval</span></h2>
      {docs == null ? <p className="text-sm text-muted-foreground">Loading…</p>
        : docs.length ? <ul className="space-y-1.5">{docs.map((d) => <DocumentLine key={d.id} d={d} onDelete={() => remove(d)} />)}</ul>
        : <p className="text-sm text-muted-foreground">None yet.</p>}
      <div className="grid gap-2 border-t pt-3 sm:grid-cols-[10rem_9rem_1fr]">
        <NativeSelect value={kind} aria-label="Type" onChange={(e) => setKind(e.target.value as DocKind)}>
          {DOC_KINDS.map((k) => <NativeSelectOption key={k.id} value={k.id}>{k.label}</NativeSelectOption>)}
        </NativeSelect>
        <Input type="date" className="num" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Document date" />
        <Input placeholder="Note (optional), e.g. 24 units, invoice 1043" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Document note" />
        {supplier && (
          <Input className="sm:col-span-3" placeholder="Brands on it (optional, comma-separated): links it to those brands' pages and applications" value={brands}
            onChange={(e) => setBrands(e.target.value)} aria-label="Brands on it" />
        )}
        {brand && suppliers.length > 0 && (
          <NativeSelect className="sm:col-span-3" value={from} aria-label="From supplier" onChange={(e) => setFrom(e.target.value)}>
            <NativeSelectOption value="">From no particular supplier</NativeSelectOption>
            {suppliers.map((s) => <NativeSelectOption key={s.id} value={s.id}>From {s.name}</NativeSelectOption>)}
          </NativeSelect>
        )}
      </div>
      <input ref={input} type="file" multiple className="hidden" aria-hidden="true" onChange={(e) => { if (e.target.files?.length) void upload(e.target.files); e.target.value = ""; }} />
      <Button variant="outline" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <LoaderIcon className="animate-spin" /> : <UploadIcon />} Attach files
      </Button>
    </section>
  );
}
