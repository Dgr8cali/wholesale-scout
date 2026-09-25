/** The document store's kinds, and what the Apply flow needs to know about a document. */

export type DocKind = "invoice" | "sds" | "brand_letter" | "other";

export const DOC_KINDS: { id: DocKind; label: string }[] = [
  { id: "invoice", label: "Invoice" },
  { id: "sds", label: "SDS (safety data sheet)" },
  { id: "brand_letter", label: "Brand letter" },
  { id: "other", label: "Other" },
];
export const docKindLabel = (k: DocKind) => DOC_KINDS.find((x) => x.id === k)?.label ?? k;

export interface DocumentRow {
  id: string;
  kind: DocKind;
  doc_date: string | null;
  note: string | null;
  brand_keys: string[];
  supplier_id: string | null;
  supplier?: { id: string; name: string } | null;
  file_name: string;
  size_bytes: number | null;
  content_type: string | null;
  created_at: string;
}

export const MAX_DOC_BYTES = 50 * 1024 * 1024;

/** Amazon usually wants invoices dated within the last 180 days for an approval. */
export const INVOICE_MAX_AGE_DAYS = 180;

/** An invoice too old for an approval application, by its date (days old), else null. */
export function staleInvoice(d: Pick<DocumentRow, "kind" | "doc_date">, now = Date.now()): number | null {
  if (d.kind !== "invoice" || !d.doc_date) return null;
  const days = Math.floor((now - Date.parse(`${d.doc_date}T00:00:00Z`)) / 86_400_000);
  return days > INVOICE_MAX_AGE_DAYS ? days : null;
}

/** For an application: the brand's letters and SDS, then invoices (newest first), then the rest. */
export function applyOrder(docs: DocumentRow[]): DocumentRow[] {
  const rank: Record<DocKind, number> = { invoice: 0, brand_letter: 1, sds: 2, other: 3 };
  return [...docs].sort((a, b) => rank[a.kind] - rank[b.kind] || (b.doc_date ?? b.created_at).localeCompare(a.doc_date ?? a.created_at));
}
