import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DOC_KINDS, MAX_DOC_BYTES, type DocKind, type DocumentRow } from "../documents";
import { brandKey } from "../brands";
import { db, must } from "./db";

export const BUCKET = "documents";

/** Storage calls go through this (tests swap in a double). */
type Bucket = Pick<ReturnType<SupabaseClient["storage"]["from"]>, "createSignedUploadUrl" | "createSignedUrl" | "remove" | "list">;
let bucketOverride: Bucket | null = null;
export const __setBucketForTests = (b: Bucket | null) => { bucketOverride = b; };
const bucket = (): Bucket => bucketOverride ?? db().storage.from(BUCKET);

const COLS = "id, kind, doc_date, note, brand_keys, supplier_id, file_name, size_bytes, content_type, created_at, supplier:suppliers(id, name)";

export interface NewDocument {
  kind: DocKind; date?: string | null; note?: string | null;
  brands?: string[]; supplierId?: string | null;
  fileName: string; size?: number | null; contentType?: string | null;
}

/**
 * A document row, not yet uploaded, and a signed URL the browser uploads the file to directly
 * (Vercel caps request bodies well under a PDF's size). `confirmUpload` marks it done.
 */
export async function createDocument(input: NewDocument): Promise<{ id: string; uploadUrl: string; path: string }> {
  if (!DOC_KINDS.some((k) => k.id === input.kind)) throw new Error("Pick a type: invoice, SDS, brand letter or other");
  if (input.size != null && input.size > MAX_DOC_BYTES) throw new Error("Files over 50 MB aren't kept");
  const brands = [...new Set((input.brands ?? []).map((b) => brandKey(b)).filter(Boolean))];
  if (!brands.length && !input.supplierId) throw new Error("A document belongs to a brand or a supplier");
  const date = input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : null;
  const safe = input.fileName.replace(/[^\w.() -]+/g, "_").replace(/\s+/g, " ").trim().slice(-120) || "file";
  const id = crypto.randomUUID();
  const path = `${id}/${safe}`;
  must(await db().from("documents").insert({
    id, kind: input.kind, doc_date: date, note: input.note?.trim().slice(0, 500) || null, brand_keys: brands,
    supplier_id: input.supplierId ?? null, file_name: input.fileName.slice(0, 200), path,
    size_bytes: input.size ?? null, content_type: input.contentType?.slice(0, 100) ?? null,
  }), "save document");
  const signed = await bucket().createSignedUploadUrl(path);
  if (signed.error || !signed.data) {
    await db().from("documents").delete().eq("id", id);
    throw new Error(`Storage wouldn't take the upload: ${signed.error?.message ?? "no URL"}`);
  }
  return { id, uploadUrl: signed.data.signedUrl, path };
}

/** After the browser's upload: check the file is there, then list it. */
export async function confirmUpload(id: string): Promise<boolean> {
  const row = must(await db().from("documents").select("path").eq("id", id).maybeSingle(), "document") as { path: string } | null;
  if (!row) return false;
  const [folder, name] = [row.path.slice(0, row.path.indexOf("/")), row.path.slice(row.path.indexOf("/") + 1)];
  const listed = await bucket().list(folder, { search: name });
  if (listed.error || !listed.data?.some((f) => f.name === name)) throw new Error("The file didn't reach storage; try again");
  must(await db().from("documents").update({ uploaded: true }).eq("id", id), "confirm document");
  return true;
}

/** Documents for a brand, a supplier, or an application (the brand's, plus the supplier's invoices). */
export async function listDocuments(q: { brand?: string | null; supplierId?: string | null; apply?: boolean }): Promise<DocumentRow[]> {
  const d = db();
  const out = new Map<string, DocumentRow>();
  const add = (rows: DocumentRow[]) => { for (const r of rows) out.set(r.id, r); };
  const key = q.brand ? brandKey(q.brand) : null;
  if (key) add(must(await d.from("documents").select(COLS).eq("uploaded", true).contains("brand_keys", [key]), "documents") as unknown as DocumentRow[]);
  if (q.supplierId) {
    let s = d.from("documents").select(COLS).eq("uploaded", true).eq("supplier_id", q.supplierId);
    // For an application only the supplier's invoices count, not its other paperwork.
    if (q.apply && key) s = s.eq("kind", "invoice");
    add(must(await s, "documents") as unknown as DocumentRow[]);
  }
  return [...out.values()].sort((a, b) => (b.doc_date ?? b.created_at).localeCompare(a.doc_date ?? a.created_at));
}

/** A short-lived link to the file (60 seconds), to open or download it. */
export async function documentUrl(id: string, download: boolean): Promise<string | null> {
  const row = must(await db().from("documents").select("path, file_name").eq("id", id).maybeSingle(), "document") as { path: string; file_name: string } | null;
  if (!row) return null;
  const r = await bucket().createSignedUrl(row.path, 60, download ? { download: row.file_name } : undefined);
  if (r.error || !r.data) throw new Error(`Storage: ${r.error?.message ?? "no link"}`);
  return r.data.signedUrl;
}

export async function updateDocument(id: string, p: { kind?: DocKind; date?: string | null; note?: string | null; brands?: string[] }) {
  const patch: Record<string, unknown> = {};
  if (p.kind && DOC_KINDS.some((k) => k.id === p.kind)) patch.kind = p.kind;
  if (p.date !== undefined) patch.doc_date = p.date && /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date : null;
  if (p.note !== undefined) patch.note = p.note?.trim().slice(0, 500) || null;
  if (p.brands) patch.brand_keys = [...new Set(p.brands.map((b) => brandKey(b)).filter(Boolean))];
  must(await db().from("documents").update(patch).eq("id", id), "update document");
}

export async function deleteDocument(id: string): Promise<void> {
  const row = must(await db().from("documents").select("path").eq("id", id).maybeSingle(), "document") as { path: string } | null;
  if (!row) return;
  const r = await bucket().remove([row.path]);
  if (r.error) throw new Error(`Storage: ${r.error.message}`);
  must(await db().from("documents").delete().eq("id", id), "delete document");
}
