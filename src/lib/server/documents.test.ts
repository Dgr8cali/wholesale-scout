import { beforeEach, describe, expect, it } from "vitest";
import { applyOrder, staleInvoice, type DocumentRow } from "../documents";
import { __setDbForTests } from "./db";
import { FakeDb } from "./fakeDb";
import { __setBucketForTests, confirmUpload, createDocument, deleteDocument, listDocuments } from "./documents";

const stored = new Set<string>();
const bucket = {
  async createSignedUploadUrl(path: string) { return { data: { signedUrl: `https://storage.test/upload/${path}?token=t`, token: "t", path }, error: null }; },
  async createSignedUrl(path: string) { return { data: { signedUrl: `https://storage.test/${path}?token=t` }, error: null }; },
  async remove(paths: string[]) { paths.forEach((p) => stored.delete(p)); return { data: [], error: null }; },
  async list(folder: string) { return { data: [...stored].filter((p) => p.startsWith(`${folder}/`)).map((p) => ({ name: p.slice(folder.length + 1) })), error: null }; },
} as unknown as Parameters<typeof __setBucketForTests>[0];

describe("document store", () => {
  let fake: FakeDb;
  beforeEach(() => {
    fake = new FakeDb();
    fake.tables.suppliers = [{ id: "s1", name: "Henbrandt" }];
    __setDbForTests(fake);
    __setBucketForTests(bucket);
    stored.clear();
  });
  const upload = async (doc: Parameters<typeof createDocument>[0]) => {
    const r = await createDocument(doc);
    stored.add(r.path);
    await confirmUpload(r.id);
    return r.id;
  };

  it("keeps a file for a brand or a supplier, listed only once it's uploaded", async () => {
    const letter = await upload({ kind: "brand_letter", brands: ["La Roche-Posay"], fileName: "LRP letter.pdf", date: "2026-09-01" });
    const invoice = await upload({ kind: "invoice", supplierId: "s1", brands: ["La Roche-Posay", "Vichy"], fileName: "INV 1043.pdf", date: "2026-08-20" });
    await upload({ kind: "sds", supplierId: "s1", fileName: "sds.pdf" });
    // Started but never uploaded: not listed, and confirming it fails.
    const half = await createDocument({ kind: "other", brands: ["La Roche-Posay"], fileName: "x.pdf" });
    await expect(confirmUpload(half.id)).rejects.toThrow(/didn't reach storage/);

    expect((await listDocuments({ brand: "La Roche-Posay" })).map((d) => d.id)).toEqual([letter, invoice]);
    expect((await listDocuments({ supplierId: "s1" })).map((d) => d.kind).sort()).toEqual(["invoice", "sds"]);
    // An application: the brand's documents and the supplier's invoices (not its SDS).
    expect((await listDocuments({ brand: "Vichy", supplierId: "s1", apply: true })).map((d) => d.id)).toEqual([invoice]);
    await deleteDocument(letter);
    expect(stored.size).toBe(2);
    expect((await listDocuments({ brand: "La Roche-Posay" })).map((d) => d.id)).toEqual([invoice]);
  });

  it("refuses a document with no brand or supplier, or no type", async () => {
    await expect(createDocument({ kind: "invoice", fileName: "a.pdf" })).rejects.toThrow(/brand or a supplier/);
    await expect(createDocument({ kind: "nope" as never, brands: ["x"], fileName: "a.pdf" })).rejects.toThrow(/Pick a type/);
  });

  it("orders an application's kit and flags invoices over 180 days", () => {
    const d = (kind: DocumentRow["kind"], doc_date: string | null): DocumentRow => ({ id: `${kind}${doc_date}`, kind, doc_date, note: null, brand_keys: [], supplier_id: null, file_name: "f", size_bytes: null, content_type: null, created_at: "2026-09-01T00:00:00Z" });
    const now = Date.parse("2026-09-25T00:00:00Z");
    expect(staleInvoice(d("invoice", "2026-03-01"), now)).toBe(208);
    expect(staleInvoice(d("invoice", "2026-06-01"), now)).toBeNull();
    expect(staleInvoice(d("brand_letter", "2020-01-01"), now)).toBeNull();
    expect(applyOrder([d("sds", null), d("invoice", "2026-05-01"), d("brand_letter", "2026-01-01"), d("invoice", "2026-09-01")]).map((x) => x.id))
      .toEqual(["invoice2026-09-01", "invoice2026-05-01", "brand_letter2026-01-01", "sdsnull"]);
  });
});
