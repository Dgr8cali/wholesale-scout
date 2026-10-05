/** Supplier Scout on the FakeDb: capture, dedupe on re-capture, rescoring, a quote from a lead, the RFQ. */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { beforeEach, describe, expect, it } from "vitest";
import { __setDbForTests } from "./db";
import { FakeDb } from "./fakeDb";
import { createCandidate, setField } from "./pl";
import { leadSummary, listLeads, quoteFromLead, rescoreLeads, rfqFor, saveCapturedLeads, saveRfqTemplate, updateLead } from "./plSuppliers";

const require = createRequire(import.meta.url);
const P = require("../../../extension/alibaba-parse.js") as { parseAlibabaResults: (doc: Document) => { cards: Record<string, unknown>[] } };
const page = P.parseAlibabaResults(new JSDOM(readFileSync(join(__dirname, "../../../docs/samples/alibaba/lens-wipes.html"), "utf8")).window.document).cards;
const MICKER = "https://www.alibaba.com/product-detail/Factory-Custom-100-200-400pcs-6x12cm_1601715892300.html";

describe("Supplier Scout leads", () => {
  let fake: FakeDb;
  beforeEach(() => {
    fake = new FakeDb();
    __setDbForTests(fake);
    for (const t of ["pl_supplier_leads", "pl_text_settings", "pl_quotes"]) fake.tables[t] ??= [];
  });

  it("captures the page, scores it, and a re-capture updates price/MOQ/sold but keeps status and notes", async () => {
    const c = await createCandidate({ name: "Lens cleaning wipes", niche_keyword: "lens wipes", asins: [] });
    await setField(c.id, "landed", "0.84"); // target ex-works £0.60 a box
    expect(await saveCapturedLeads(c.id, page)).toEqual({ added: 60, updated: 0, skipped: 0, total: 60 });
    const micker = (await listLeads(c.id)).find((l) => l.listing_url === MICKER)!;
    expect(micker).toMatchObject({ supplier_name: "Hangzhou Micker Sanitary Products Co., Ltd.", moq: 1000, moq_unit: "box", price_min: 0.3053, price_max: 0.5342, sold_count: 31, badges: ["Verified"] });
    expect(micker.score_breakdown!.perUnit).toBe(0.5342);
    expect(micker.score).toBeGreaterThan(80);

    await updateLead(micker.id, { status: "contacted", notes: "Asked for 2× MOQ price" });
    const again = page.map((x) => (x.listingUrl === MICKER ? { ...x, priceMax: 0.45, moq: 500, soldCount: 40 } : x));
    expect(await saveCapturedLeads(c.id, [...again, { listingUrl: "https://evil.example.com/x", title: "x" }])).toEqual({ added: 0, updated: 60, skipped: 1, total: 60 });
    expect(fake.tables.pl_supplier_leads).toHaveLength(60);
    expect((await listLeads(c.id)).find((l) => l.listing_url === MICKER)).toMatchObject({ price_max: 0.45, moq: 500, sold_count: 40, status: "contacted", notes: "Asked for 2× MOQ price" });
  });

  it("a new target rescores; rejecting needs a reason; the strip counts; a quote starts from a lead", async () => {
    const c = await createCandidate({ name: "Lens cleaning wipes", niche_keyword: "lens wipes", asins: [] });
    await saveCapturedLeads(c.id, page);
    const before = (await listLeads(c.id)).find((l) => l.listing_url === MICKER)!;
    expect(before.score_breakdown!.parts.price.note).toMatch(/no target ex-works price/);
    await setField(c.id, "targetExworks", "0.26");
    await rescoreLeads(c.id);
    const after = (await listLeads(c.id)).find((l) => l.listing_url === MICKER)!;
    expect(after.flags).toContain("HIGH_PRICE");
    expect(after.score_breakdown!.parts.price.points).toBe(0);

    await expect(updateLead(after.id, { status: "rejected" })).rejects.toThrow("reason");
    await updateLead(after.id, { status: "rejected", reject_reason: "Only sells 100-packs" });
    expect(leadSummary(await listLeads(c.id))).toMatchObject({ captured: 60 });

    const other = (await listLeads(c.id)).find((l) => l.id !== after.id)!;
    const q = await quoteFromLead(other.id);
    expect(q).toMatchObject({ candidate_id: c.id, supplier_name: other.supplier_name, source: "Alibaba", status: "requested" });
    expect((await listLeads(c.id)).find((l) => l.id === other.id)!.status).toBe("quoted");
  });

  it("the RFQ from the template (editable, back to the default)", async () => {
    const c = await createCandidate({ name: "Lens cleaning wipes", niche_keyword: "lens wipes", asins: [] });
    await setField(c.id, "landed", "1.40");
    await setField(c.id, "spec", "6×12 cm, 100 per box");
    const r = await rfqFor(c.id);
    expect(r.text).toContain("Target price: £1.00 per box, ex-works");
    expect(r.missing).toEqual(["Gate 4's six words"]);
    await saveRfqTemplate("Dear supplier, {{product}} at £{{targetPrice}}.");
    expect((await rfqFor(c.id)).text).toBe("Dear supplier, lens wipes at £1.00.");
    await saveRfqTemplate(null);
    expect((await rfqFor(c.id)).text).toContain("SDS, REACH");
  });
});
